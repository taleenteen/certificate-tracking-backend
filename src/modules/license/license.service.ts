import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JuristicRole, LicenseStatus, Prisma } from '@prisma/client';
import { JwtClaims } from '../../common/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  CreateLicenseTypeDto,
  PublicLicenseSearchDto,
  UpdateLicenseStatusDto,
  UpdateLicenseTypeDto,
} from './license.dto';
import { buildLicenseOwnership } from './license-ownership';

const STATUS_META: Array<{
  statusCode: string;
  statusName: string;
  description: string;
  nextAction: string;
  color: string;
}> = [
  {
    statusCode: 'ACTIVE',
    statusName: 'มีผล',
    description: 'ใบอนุญาตใช้งานได้',
    nextAction: 'ต่ออายุก่อนหมดอายุ',
    color: 'success',
  },
  {
    statusCode: 'PENDING',
    statusName: 'รออนุมัติ',
    description: 'ยื่นแล้ว รอตรวจสอบ',
    nextAction: 'ตรวจสอบเอกสาร',
    color: 'warning',
  },
  {
    statusCode: 'SUSPENDED',
    statusName: 'ระงับ',
    description: 'ระงับใบอนุญาตชั่วคราว',
    nextAction: 'รอชำระค่าธรรมเนียม',
    color: 'purple',
  },
  {
    statusCode: 'EXPIRED',
    statusName: 'หมดอายุ',
    description: 'ใบอนุญาตพ้นกำหนด',
    nextAction: 'ยื่นต่ออายุ',
    color: 'muted',
  },
  {
    statusCode: 'REVOKED',
    statusName: 'ถูกเพิกถอน',
    description: 'ใบอนุญาตถูกยกเลิกถาวร',
    nextAction: 'ยื่นขอใหม่',
    color: 'critical',
  },
];

const TASK_STATUS_META: Array<{
  statusCode: string;
  statusName: string;
  description: string;
  color: string;
}> = [
  {
    statusCode: 'WAITING_ASSIGNMENT',
    statusName: 'รอมอบหมาย',
    description: 'ยังไม่มีเจ้าหน้าที่รับผิดชอบ',
    color: 'warning',
  },
  {
    statusCode: 'ASSIGNED',
    statusName: 'มอบหมายแล้ว',
    description: 'มีเจ้าหน้าที่รับมอบหมาย',
    color: 'info',
  },
  {
    statusCode: 'IN_PROGRESS',
    statusName: 'กำลังดำเนินการ',
    description: 'เจ้าหน้าที่กำลังตรวจสอบ',
    color: 'warning',
  },
  {
    statusCode: 'PENDING_REVIEW',
    statusName: 'รอการตรวจสอบ',
    description: 'รายงานถูกส่งแล้ว รอผู้บังคับบัญชา',
    color: 'purple',
  },
  {
    statusCode: 'APPROVED',
    statusName: 'เสร็จสิ้น',
    description: 'ผ่านการตรวจสอบ',
    color: 'success',
  },
  {
    statusCode: 'RETURNED',
    statusName: 'ส่งกลับแก้ไข',
    description: 'ต้องแก้ไขรายงาน',
    color: 'critical',
  },
  {
    statusCode: 'CANCELLED',
    statusName: 'ยกเลิก',
    description: 'งานถูกยกเลิก',
    color: 'muted',
  },
];

type PublicLicenseBusiness = {
  id: string;
  nameTh: string;
  address?: string;
  province: string;
  latitude?: unknown;
  longitude?: unknown;
};

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

  async searchPublic(query: PublicLicenseSearchDto) {
    const where: Prisma.LicenseWhereInput = {
      deletedAt: null,
      status: query.status,
      licenseNo: query.licenseNumber
        ? { contains: query.licenseNumber, mode: 'insensitive' }
        : undefined,
      business: {
        deletedAt: null,
        nameTh: query.q
          ? { contains: query.q, mode: 'insensitive' }
          : undefined,
      },
    };
    const [data, total] = await this.prisma.$transaction(async (tx) => {
      const data = await tx.license.findMany({
        where,
        include: {
          licenseType: {
            include: {
              agency: { select: { id: true, code: true, nameTh: true } },
            },
          },
          business: {
            select: {
              id: true,
              nameTh: true,
              address: true,
              province: true,
              latitude: true,
              longitude: true,
              ownerUserId: true,
              juristicPersonId: true,
              juristicPerson: {
                select: { id: true, nameTh: true, registrationId: true },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
      const total = await tx.license.count({ where });
      return [data, total] as const;
    });
    return {
      data: data.map((license) => ({
        id: license.id,
        licenseNumber: license.licenseNo,
        status: license.status,
        issuedAt: license.issueDate.toISOString(),
        expiresAt: license.expireDate?.toISOString() ?? null,
        licenseType: {
          id: license.licenseType.id,
          code: license.licenseType.code,
          nameTh: license.licenseType.nameTh,
          agency: license.licenseType.agency,
        },
        business: this.toPublicBusiness(license.business),
        juristic: license.business.juristicPerson,
        ownership: buildLicenseOwnership(license.business),
      })),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async searchPublicGroupedByBusiness(query: PublicLicenseSearchDto) {
    const licenseWhere: Prisma.LicenseWhereInput = {
      deletedAt: null,
      status: query.status,
      licenseNo: query.licenseNumber
        ? { contains: query.licenseNumber, mode: 'insensitive' }
        : undefined,
    };
    const where: Prisma.BusinessWhereInput = {
      deletedAt: null,
      nameTh: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
      licenses: { some: licenseWhere },
    };
    const [businesses, total] = await this.prisma.$transaction(async (tx) => {
      const businesses = await tx.business.findMany({
        where,
        select: {
          id: true,
          nameTh: true,
          address: true,
          province: true,
          latitude: true,
          longitude: true,
          ownerUserId: true,
          juristicPersonId: true,
          juristicPerson: {
            select: { id: true, nameTh: true, registrationId: true },
          },
          licenses: {
            where: licenseWhere,
            include: {
              licenseType: {
                include: {
                  agency: { select: { id: true, code: true, nameTh: true } },
                },
              },
            },
            orderBy: { licenseNo: 'asc' },
          },
        },
        orderBy: { nameTh: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
      const total = await tx.business.count({ where });
      return [businesses, total] as const;
    });
    return {
      data: businesses.map((business) => ({
        id: business.id,
        nameTh: business.nameTh,
        address: business.address,
        province: business.province,
        latitude: business.latitude,
        longitude: business.longitude,
        juristic: business.juristicPerson,
        ownership: buildLicenseOwnership(business),
        licenseCount: business.licenses.length,
        licenses: business.licenses.map((license) => ({
          id: license.id,
          licenseNumber: license.licenseNo,
          status: license.status,
          issuedAt: license.issueDate.toISOString(),
          expiresAt: license.expireDate?.toISOString() ?? null,
          licenseType: {
            id: license.licenseType.id,
            code: license.licenseType.code,
            nameTh: license.licenseType.nameTh,
            agency: license.licenseType.agency,
          },
        })),
      })),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async createType(dto: CreateLicenseTypeDto) {
    return this.prisma.licenseType.create({ data: dto });
  }

  async updateType(id: string, dto: UpdateLicenseTypeDto) {
    const existing = await this.prisma.licenseType.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException();
    return this.prisma.licenseType.update({ where: { id }, data: dto });
  }

  listStatuses() {
    return {
      licenseStatuses: STATUS_META,
      taskStatuses: TASK_STATUS_META,
    };
  }

  async updateStatus(id: string, dto: UpdateLicenseStatusDto, user: JwtClaims) {
    const exists = await this.prisma.license.findFirst({
      where: { id, deletedAt: null },
      include: { business: true },
    });
    if (!exists) throw new NotFoundException();
    await this.assertNoLicenseConflict(user, exists);
    return this.prisma.license.update({
      where: { id },
      data: { status: dto.status as LicenseStatus },
    });
  }

  async findOne(id: string, minimal = false) {
    const license = await this.prisma.license.findFirst({
      where: { id, deletedAt: null },
      include: {
        licenseType: true,
        business: {
          select: minimal
            ? {
                id: true,
                nameTh: true,
                province: true,
                ownerUserId: true,
                juristicPersonId: true,
                juristicPerson: {
                  select: { nameTh: true, registrationId: true },
                },
              }
            : {
                id: true,
                nameTh: true,
                address: true,
                province: true,
                latitude: true,
                longitude: true,
                ownerUserId: true,
                juristicPersonId: true,
                juristicPerson: {
                  select: { nameTh: true, registrationId: true },
                },
              },
        },
        documents: !minimal,
      },
    });
    if (!license) throw new NotFoundException();
    const ownership = buildLicenseOwnership(license.business);
    const business = this.toPublicBusiness(license.business);
    if (minimal) return { ...license, business, ownership };
    return {
      ...license,
      business,
      ownership,
      documents: await Promise.all(
        license.documents.map(async (document) => ({
          ...document,
          url: await this.storage.presign(document.objectKey),
          urlExpiresInSeconds: 600,
        })),
      ),
    };
  }

  private toPublicBusiness(business: PublicLicenseBusiness) {
    return {
      id: business.id,
      nameTh: business.nameTh,
      address: business.address,
      province: business.province,
      latitude: business.latitude,
      longitude: business.longitude,
    };
  }

  private async assertNoLicenseConflict(
    user: JwtClaims,
    license: {
      business: { ownerUserId: string | null; juristicPersonId: string | null };
    },
  ) {
    if (license.business.ownerUserId === user.sub) {
      throw new ConflictException('Officer has a conflict of interest');
    }
    if (!license.business.juristicPersonId) return;

    const membership = await this.prisma.juristicMember.findFirst({
      where: {
        juristicPersonId: license.business.juristicPersonId,
        userId: user.sub,
        isActive: true,
        // DECISION: OWNER and ADMIN can act for a company, so both are treated as conflicted reviewers.
        role: { in: [JuristicRole.OWNER, JuristicRole.ADMIN] },
      },
      select: { id: true },
    });
    if (membership) {
      throw new ConflictException('Officer has a conflict of interest');
    }
  }
}
