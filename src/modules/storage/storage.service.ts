import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket = process.env.MINIO_BUCKET ?? 'elicense-private';
  private readonly s3Creds = {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'elicense',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'change-me',
  };
  private readonly region = process.env.MINIO_REGION ?? 'us-east-1';
  // Internal endpoint for upload/delete (Docker service name resolves inside compose).
  private readonly client = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
    region: this.region,
    forcePathStyle: true,
    credentials: this.s3Creds,
  });
  // Public endpoint for presigned URL generation. The URL must be reachable from
  // the browser. In production set MINIO_PUBLIC_ENDPOINT=http://<server-ip>:9000.
  private readonly presignClient = new S3Client({
    endpoint: process.env.MINIO_PUBLIC_ENDPOINT ?? process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
    region: this.region,
    forcePathStyle: true,
    credentials: this.s3Creds,
  });

  async onModuleInit() {
    await this.ensurePrivateBucket();
  }

  // Creates the bucket if absent. MinIO (and S3) buckets are private by default:
  // anonymous requests are denied, and the only read path is a presigned URL
  // (signed with our credentials, 10-min TTL via presign()). We intentionally do
  // NOT attach an anonymous-allow policy, so nothing is publicly readable. A
  // blanket Deny policy is avoided because it would also reject our own
  // presigned (authenticated) reads.
  private async ensurePrivateBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch {
      // Bucket missing — fall through to create it.
    }
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created private MinIO bucket: ${this.bucket}`);
    } catch (createErr) {
      this.logger.error(`Failed to create bucket ${this.bucket}`, createErr);
    }
  }

  upload(objectKey: string, body: Buffer, contentType: string) {
    return this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  remove(objectKey: string) {
    return this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }

  presign(objectKey: string) {
    return getSignedUrl(
      this.presignClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn: 600 },
    );
  }
}
