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

  /**
   * Free-text `q` matches business name, juristic name, or license number
   * (OR). Explicit `licenseNumber` still ANDs as a separate filter.
   */
  private publicSearchLicenseWhere(
    query: PublicLicenseSearchDto,
  ): Prisma.LicenseWhereInput {
    const term = query.q?.trim();
    const licenseNo = query.licenseNumber?.trim();
    const base: Prisma.LicenseWhereInput = {
      deletedAt: null,
      status: query.status,
    };
    if (licenseNo) {
      base.licenseNo = { contains: licenseNo, mode: 'insensitive' };
    }
    if (!term) {
      return {
        ...base,
        business: { deletedAt: null },
      };
    }
    return {
      ...base,
      business: { deletedAt: null },
      OR: [
        { licenseNo: { contains: term, mode: 'insensitive' } },
        { business: { nameTh: { contains: term, mode: 'insensitive' } } },
        {
          business: {
            juristicPerson: {
              nameTh: { contains: term, mode: 'insensitive' },
            },
          },
        },
      ],
    };
  }

  private publicSearchBusinessWhere(query: PublicLicenseSearchDto): {
    businessWhere: Prisma.BusinessWhereInput;
    licenseWhere: Prisma.LicenseWhereInput;
  } {
    const term = query.q?.trim();
    const licenseNo = query.licenseNumber?.trim();
    const licenseWhere: Prisma.LicenseWhereInput = {
      deletedAt: null,
      status: query.status,
      ...(licenseNo
        ? { licenseNo: { contains: licenseNo, mode: 'insensitive' as const } }
        : {}),
    };

    if (!term) {
      return {
        licenseWhere,
        businessWhere: {
          deletedAt: null,
          licenses: { some: licenseWhere },
        },
      };
    }

    // Match business name, juristic name, or any license number under the
    // business; nested licenses still apply the explicit licenseNumber filter.
    const businessWhere: Prisma.BusinessWhereInput = {
      deletedAt: null,
      AND: [
        { licenses: { some: licenseWhere } },
        {
          OR: [
            { nameTh: { contains: term, mode: 'insensitive' } },
            {
              juristicPerson: {
                nameTh: { contains: term, mode: 'insensitive' },
              },
            },
            {
              licenses: {
                some: {
                  ...licenseWhere,
                  licenseNo: { contains: term, mode: 'insensitive' },
                },
              },
            },
          ],
        },
      ],
    };
    return { businessWhere, licenseWhere };
  }

  async searchPublic(query: PublicLicenseSearchDto) {
    const where = this.publicSearchLicenseWhere(query);
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
          documents: {
            where: { docType: 'LICENSE_CERTIFICATE' },
            select: { objectKey: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
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
      data: await Promise.all(
        data.map(async (license) => ({
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
          business: this.toPublicBusiness(license.business!),
          juristic: license.business!.juristicPerson,
          ownership: buildLicenseOwnership(license.business!),
          previewUrl: await this.certificatePreviewUrl(license.documents),
        })),
      ),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async searchPublicGroupedByBusiness(query: PublicLicenseSearchDto) {
    const { businessWhere: where, licenseWhere } =
      this.publicSearchBusinessWhere(query);
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
              documents: {
                where: { docType: 'LICENSE_CERTIFICATE' },
                select: { objectKey: true },
                orderBy: { createdAt: 'asc' },
                take: 1,
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
      data: await Promise.all(
        businesses.map(async (business) => ({
          id: business.id,
          nameTh: business.nameTh,
          address: business.address,
          province: business.province,
          latitude: business.latitude,
          longitude: business.longitude,
          juristic: business.juristicPerson,
          ownership: buildLicenseOwnership(business),
          licenseCount: business.licenses.length,
          licenses: await Promise.all(
            business.licenses.map(async (license) => ({
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
              previewUrl: await this.certificatePreviewUrl(license.documents),
            })),
          ),
        })),
      ),
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
        juristicPerson: {
          select: {
            id: true,
            nameTh: true,
            registrationId: true,
            address: true,
          },
        },
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
    if (!license.business && !license.juristicPerson)
      throw new NotFoundException();
    const business = license.business
      ? this.toPublicBusiness(license.business)
      : {
          id: license.juristicPerson!.id,
          nameTh: license.juristicPerson!.nameTh,
          address: license.juristicPerson!.address ?? '-',
          province: '-',
          latitude: null,
          longitude: null,
        };
    const ownership = license.business
      ? buildLicenseOwnership(license.business)
      : {
          type: 'JURISTIC',
          labelTh: 'นิติบุคคล',
          contextId: license.juristicPerson!.id,
          displayNameTh: license.juristicPerson!.nameTh,
          registrationId: license.juristicPerson!.registrationId,
        };
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

  private certificatePreviewUrl(documents: Array<{ objectKey: string }>) {
    const document = documents[0];
    return document ? this.storage.presign(document.objectKey) : null;
  }

  /**
   * Stream the first LICENSE_CERTIFICATE PDF for same-origin browser preview.
   * Prefer this over MinIO presigned URLs so pdf.js does not hit CORS / mixed-content.
   */
  async getCertificateFile(id: string) {
    const license = await this.prisma.license.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        documents: {
          where: { docType: 'LICENSE_CERTIFICATE' },
          select: {
            objectKey: true,
            fileName: true,
            mimeType: true,
          },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    const document = license?.documents[0];
    if (!document) throw new NotFoundException('Certificate document not found');

    const buffer = await this.storage.download(document.objectKey);
    return {
      buffer,
      fileName: document.fileName,
      mimeType: document.mimeType || 'application/pdf',
    };
  }

  private async assertNoLicenseConflict(
    user: JwtClaims,
    license: {
      business: {
        ownerUserId: string | null;
        juristicPersonId: string | null;
      } | null;
      juristicPersonId: string | null;
    },
  ) {
    if (license.business?.ownerUserId === user.sub) {
      throw new ConflictException('Officer has a conflict of interest');
    }
    const juristicPersonId =
      license.business?.juristicPersonId ?? license.juristicPersonId;
    if (!juristicPersonId) return;

    const membership = await this.prisma.juristicMember.findFirst({
      where: {
        juristicPersonId,
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
