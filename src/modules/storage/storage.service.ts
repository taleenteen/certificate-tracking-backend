import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket = process.env.MINIO_BUCKET ?? 'elicense-private';
  private readonly client = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.MINIO_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'elicense',
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'change-me',
    },
  });

  async onModuleInit() {
    await this.ensurePrivateBucket();
  }

  // Creates the bucket if absent and enforces a deny-public-read policy so
  // objects are only accessible via presigned URLs (10-min TTL via presign()).
  private async ensurePrivateBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
        this.logger.log(`Created MinIO bucket: ${this.bucket}`);
      } catch (createErr) {
        this.logger.error(`Failed to create bucket ${this.bucket}`, createErr);
        return;
      }
    }

    // Deny all s3:GetObject requests that are not pre-signed (no signed query
    // params means the request came directly without a presigned URL).
    const denyPublicReadPolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'DenyPublicRead',
          Effect: 'Deny',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${this.bucket}/*`,
          Condition: {
            StringNotLike: {
              'aws:signedHeaders': '*',
            },
          },
        },
      ],
    });

    try {
      await this.client.send(
        new PutBucketPolicyCommand({
          Bucket: this.bucket,
          Policy: denyPublicReadPolicy,
        }),
      );
      this.logger.log(`Applied private bucket policy to: ${this.bucket}`);
    } catch (policyErr) {
      this.logger.warn(
        `Could not set bucket policy (non-fatal in dev): ${String(policyErr)}`,
      );
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
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn: 600 },
    );
  }
}
