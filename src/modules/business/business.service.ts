import { Injectable, NotFoundException } from '@nestjs/common';
import { LicenseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessQueryDto, MapQueryDto } from './business.dto';
import { buildLicenseOwnership } from '../license/license-ownership';
import { StorageService } from '../storage/storage.service';

const BUSINESS_LIST_INCLUDE = {
  owner: { select: { fullName: true } },
  juristicPerson: { select: { nameTh: true, registrationId: true } },
  licenses: {
    where: { deletedAt: null },
    include: {
      licenseType: true,
      documents: {
        where: { docType: 'LICENSE_CERTIFICATE' },
        select: { objectKey: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  },
} as const;

const BUSINESS_DETAIL_INCLUDE = {
  owner: { select: { fullName: true } },
  juristicPerson: { select: { nameTh: true, registrationId: true } },
  licenses: {
    where: { deletedAt: null },
    include: {
      licenseType: true,
      documents: {
        where: { docType: 'LICENSE_CERTIFICATE' },
        select: { objectKey: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  },
} as const;

type PublicBusinessRow =
  | Prisma.BusinessGetPayload<{ include: typeof BUSINESS_LIST_INCLUDE }>
  | Prisma.BusinessGetPayload<{ include: typeof BUSINESS_DETAIL_INCLUDE }>;

@Injectable()
export class BusinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(query: BusinessQueryDto) {
    const where: Prisma.BusinessWhereInput = {
      deletedAt: null,
      province: query.province,
      nameTh: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
    };
    const [data, total] = await this.prisma.$transaction(async (tx) => {
      const data = await tx.business.findMany({
        where,
        include: BUSINESS_LIST_INCLUDE,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { nameTh: 'asc' },
      });
      const total = await tx.business.count({ where });
      return [data, total] as const;
    });
    return {
      data: await Promise.all(
        data.map((business) => this.toPublicBusinessDto(business)),
      ),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async findOne(id: string) {
    const business = await this.prisma.business.findFirst({
      where: { id, deletedAt: null },
      include: BUSINESS_DETAIL_INCLUDE,
    });
    if (!business) throw new NotFoundException();
    return this.toPublicBusinessDto(business);
  }

  async map(query: MapQueryDto) {
    const businesses = await this.prisma.business.findMany({
      where: {
        deletedAt: null,
        province: query.province,
        latitude: { not: null },
        longitude: { not: null },
        licenses: {
          some: {
            deletedAt: null,
            status: query.status,
            licenseType: query.typeCode ? { code: query.typeCode } : undefined,
          },
        },
      },
      select: {
        id: true,
        nameTh: true,
        address: true,
        province: true,
        latitude: true,
        longitude: true,
        ownerUserId: true,
        juristicPersonId: true,
        owner: { select: { fullName: true } },
        juristicPerson: { select: { nameTh: true, registrationId: true } },
        licenses: {
          where: {
            deletedAt: null,
            status: query.status,
            licenseType: query.typeCode ? { code: query.typeCode } : undefined,
          },
          select: {
            id: true,
            licenseNo: true,
            status: true,
            licenseType: { select: { code: true, nameTh: true } },
          },
          orderBy: { licenseNo: 'asc' },
        },
      },
    });
    return {
      type: 'FeatureCollection',
      features: businesses.map((business) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [Number(business.longitude), Number(business.latitude)],
        },
        properties: this.toMapProperties(business),
      })),
    };
  }

  private toMapProperties(
    business: Prisma.BusinessGetPayload<{
      select: {
        id: true;
        nameTh: true;
        address: true;
        province: true;
        latitude: true;
        longitude: true;
        ownerUserId: true;
        juristicPersonId: true;
        owner: { select: { fullName: true } };
        juristicPerson: { select: { nameTh: true; registrationId: true } };
        licenses: {
          select: {
            id: true;
            licenseNo: true;
            status: true;
            licenseType: { select: { code: true; nameTh: true } };
          };
        };
      };
    }>,
  ) {
    const statusCounts = this.countLicenseStatuses(business.licenses);
    const primaryLicense =
      business.licenses.find(
        (license) => license.status === LicenseStatus.ACTIVE,
      ) ?? business.licenses[0];

    return {
      id: business.id,
      nameTh: business.nameTh,
      address: business.address,
      province: business.province,
      lat: Number(business.latitude),
      lng: Number(business.longitude),
      licenseCount: business.licenses.length,
      licenseStatus: this.pickMapStatus(business.licenses),
      primaryLicense: primaryLicense
        ? {
            id: primaryLicense.id,
            licenseNo: primaryLicense.licenseNo,
            status: primaryLicense.status,
            typeCode: primaryLicense.licenseType.code,
            typeNameTh: primaryLicense.licenseType.nameTh,
          }
        : null,
      statusCounts,
      ownership: buildLicenseOwnership(business),
    };
  }

  private pickMapStatus(licenses: Array<{ status: LicenseStatus }>) {
    const priority = [
      LicenseStatus.SUSPENDED,
      LicenseStatus.EXPIRED,
      LicenseStatus.REVOKED,
      LicenseStatus.PENDING,
      LicenseStatus.ACTIVE,
    ];
    return (
      priority.find((status) =>
        licenses.some((license) => license.status === status),
      ) ?? null
    );
  }

  private countLicenseStatuses(licenses: Array<{ status: LicenseStatus }>) {
    return {
      active: licenses.filter(
        (license) => license.status === LicenseStatus.ACTIVE,
      ).length,
      suspended: licenses.filter(
        (license) => license.status === LicenseStatus.SUSPENDED,
      ).length,
      expired: licenses.filter(
        (license) => license.status === LicenseStatus.EXPIRED,
      ).length,
      pending: licenses.filter(
        (license) => license.status === LicenseStatus.PENDING,
      ).length,
      revoked: licenses.filter(
        (license) => license.status === LicenseStatus.REVOKED,
      ).length,
    };
  }

  private async toPublicBusinessDto(business: PublicBusinessRow) {
    return {
      id: business.id,
      nameTh: business.nameTh,
      address: business.address,
      province: business.province,
      latitude: business.latitude,
      longitude: business.longitude,
      geocodedAt: business.geocodedAt,
      phone: business.phone,
      email: this.mockBusinessEmail(business.id),
      deletedAt: business.deletedAt,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
      licenses: await Promise.all(
        business.licenses.map(async (license) => ({
          ...license,
          previewUrl: await this.certificatePreviewUrl(license.documents),
        })),
      ),
      ownership: buildLicenseOwnership(business),
    };
  }

  private certificatePreviewUrl(documents: Array<{ objectKey: string }>) {
    const document = documents[0];
    return document ? this.storage.presign(document.objectKey) : null;
  }

  private mockBusinessEmail(businessId: string) {
    // MOCK: replace in UAT when Business has a persisted contact email field.
    return `contact-${businessId.replace(/-/g, '').slice(0, 10)}@demo.elicense.local`;
  }
}
