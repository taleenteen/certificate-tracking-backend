import { Injectable, NotFoundException } from '@nestjs/common';
import { LicenseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessQueryDto, MapQueryDto } from './business.dto';

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: BusinessQueryDto) {
    const where: Prisma.BusinessWhereInput = {
      deletedAt: null,
      province: query.province,
      nameTh: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.business.findMany({
        where,
        include: {
          licenses: {
            where: { deletedAt: null },
            include: { licenseType: true },
          },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { nameTh: 'asc' },
      }),
      this.prisma.business.count({ where }),
    ]);
    return {
      data,
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async findOne(id: string) {
    const business = await this.prisma.business.findFirst({
      where: { id, deletedAt: null },
      include: {
        zone: true,
        licenses: {
          where: { deletedAt: null, status: LicenseStatus.ACTIVE },
          include: { licenseType: true },
        },
      },
    });
    if (!business) throw new NotFoundException();
    return business;
  }

  async map(query: MapQueryDto) {
    const businesses = await this.prisma.business.findMany({
      where: {
        deletedAt: null,
        province: query.province,
        latitude: { not: null },
        longitude: { not: null },
        licenses:
          query.typeCode || query.status
            ? {
                some: {
                  deletedAt: null,
                  status: query.status,
                  licenseType: query.typeCode
                    ? { code: query.typeCode }
                    : undefined,
                },
              }
            : undefined,
      },
      select: {
        id: true,
        nameTh: true,
        latitude: true,
        longitude: true,
        licenses: {
          where: {
            deletedAt: null,
            status: query.status,
            licenseType: query.typeCode ? { code: query.typeCode } : undefined,
          },
          select: { status: true },
          take: 1,
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
        properties: {
          id: business.id,
          nameTh: business.nameTh,
          lat: Number(business.latitude),
          lng: Number(business.longitude),
          licenseStatus: business.licenses[0]?.status ?? null,
        },
      })),
    };
  }
}
