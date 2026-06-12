import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class LicenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  listTypes() {
    return this.prisma.licenseType.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string, minimal = false) {
    const license = await this.prisma.license.findFirst({
      where: { id, deletedAt: null },
      include: {
        licenseType: true,
        business: {
          select: minimal
            ? { id: true, nameTh: true, province: true }
            : {
                id: true,
                nameTh: true,
                address: true,
                province: true,
                latitude: true,
                longitude: true,
              },
        },
        documents: !minimal,
      },
    });
    if (!license) throw new NotFoundException();
    if (minimal) return license;
    return {
      ...license,
      documents: await Promise.all(
        license.documents.map(async (document) => ({
          ...document,
          url: await this.storage.presign(document.objectKey),
          urlExpiresInSeconds: 600,
        })),
      ),
    };
  }
}
