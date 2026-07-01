import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  LicenseStatus,
  OfficerInspectionStatus,
  OfficerProfileScanResult,
  Prisma,
} from '@prisma/client';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'crypto';
import { extname } from 'path';
import { JwtClaims } from '../../common/auth.types';
import { isAdminTier } from '../../common/auth.roles';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  CreateOfficerInspectionDto,
  OfficerInspectionExportQueryDto,
  OfficerInspectionLogQueryDto,
  OfficerLicenseQueryDto,
} from './officer.dto';

interface ExportFile {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

const OFFICER_QR_TOKEN_TTL_MS = 60_000;
const OFFICER_QR_TOKEN_TTL_SECONDS = OFFICER_QR_TOKEN_TTL_MS / 1000;

@Injectable()
export class OfficerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listLicenses(query: OfficerLicenseQueryDto) {
    const where: Prisma.LicenseWhereInput = {
      deletedAt: null,
      status: query.status,
      businessId: query.businessId,
      business: {
        deletedAt: null,
        juristicPersonId: query.juristicId,
        nameTh: query.q
          ? { contains: query.q, mode: 'insensitive' }
          : undefined,
      },
      licenseNo: query.licenseNumber
        ? { contains: query.licenseNumber, mode: 'insensitive' }
        : undefined,
      licenseType: query.agencyId ? { agencyId: query.agencyId } : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.license.findMany({
        where,
        include: {
          licenseType: {
            include: {
              agency: { select: { id: true, code: true, nameTh: true } },
            },
          },
          business: {
            include: {
              juristicPerson: {
                select: { id: true, registrationId: true, nameTh: true },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.license.count({ where }),
    ]);
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
        business: {
          id: license.business.id,
          nameTh: license.business.nameTh,
          province: license.business.province,
          juristic: license.business.juristicPerson,
        },
      })),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async createInspection(dto: CreateOfficerInspectionDto, user: JwtClaims) {
    const agencyId = this.requireOfficerAgency(user);
    if (!user.roles.includes('officer')) {
      throw new ForbiddenException('Officer role is required');
    }
    const duplicateLicense = this.findDuplicate(
      dto.items.map((item) => item.licenseId),
    );
    if (duplicateLicense) {
      throw new ConflictException('Duplicate license in inspection items');
    }
    const business = await this.prisma.business.findFirst({
      where: { id: dto.businessId, deletedAt: null },
      include: {
        juristicPerson: {
          select: { id: true, registrationId: true, nameTh: true },
        },
      },
    });
    if (!business) throw new NotFoundException();

    const licenses = await this.prisma.license.findMany({
      where: {
        id: { in: dto.items.map((item) => item.licenseId) },
        businessId: business.id,
        deletedAt: null,
      },
      include: {
        licenseType: {
          include: {
            agency: { select: { id: true, code: true, nameTh: true } },
          },
        },
      },
    });
    if (licenses.length !== dto.items.length) {
      throw new NotFoundException();
    }
    const officer = await this.prisma.systemUser.findFirst({
      where: {
        id: user.sub,
        isActive: true,
        deletedAt: null,
        roles: { has: 'officer' },
        agencyId,
      },
      include: { agency: { select: { id: true, code: true, nameTh: true } } },
    });
    if (!officer?.agency) throw new ForbiddenException('Officer is inactive');
    const officerWithAgency = {
      id: officer.id,
      fullName: officer.fullName,
      agency: officer.agency,
    };

    const licenseById = new Map(
      licenses.map((license) => [license.id, license]),
    );
    const inspectedAt = new Date(dto.inspectedAt);
    const prefix = `IR-${new Date().getFullYear()}-`;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const last = await tx.officerInspection.findFirst({
            where: { inspectionNo: { startsWith: prefix } },
            orderBy: { inspectionNo: 'desc' },
            select: { inspectionNo: true },
          });
          const sequence = Number(last?.inspectionNo.slice(-6) ?? 0) + 1;
          const inspection = await tx.officerInspection.create({
            data: {
              inspectionNo: `${prefix}${String(sequence).padStart(6, '0')}`,
              officerId: officer.id,
              businessId: business.id,
              juristicPersonId: business.juristicPersonId,
              agencyId,
              officerSnapshot: this.officerSnapshot(officerWithAgency),
              businessSnapshot: this.businessSnapshot(business),
              summaryNote: dto.summaryNote,
              inspectedAt,
              submittedAt: new Date(),
              items: {
                create: dto.items.map((item, index) => ({
                  licenseId: item.licenseId,
                  sequence: index + 1,
                  detailNote: item.detailNote,
                  findings:
                    item.findings !== undefined
                      ? (item.findings as Prisma.InputJsonValue)
                      : undefined,
                  licenseSnapshot: this.licenseSnapshot(
                    licenseById.get(item.licenseId)!,
                  ),
                })),
              },
            },
            include: { items: { orderBy: { sequence: 'asc' } } },
          });
          return {
            id: inspection.id,
            inspectionNo: inspection.inspectionNo,
            status: inspection.status,
            businessId: inspection.businessId,
            juristicPersonId: inspection.juristicPersonId,
            itemCount: inspection.items.length,
            items: inspection.items.map((item) => ({
              id: item.id,
              licenseId: item.licenseId,
              sequence: item.sequence,
            })),
            createdAt: inspection.createdAt.toISOString(),
          };
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          attempt < 9
        ) {
          continue;
        }
        throw e;
      }
    }
    throw new Error('Inspection number generation failed after retries');
  }

  async uploadEvidence(
    inspectionId: string,
    itemId: string,
    user: JwtClaims,
    file: Express.Multer.File,
  ) {
    const inspection = await this.findInspectionForAccess(inspectionId, user);
    if (
      inspection.status === OfficerInspectionStatus.VOIDED ||
      (!isAdminTier(user.roles) && inspection.officerId !== user.sub)
    ) {
      throw new UnprocessableEntityException('Inspection is not editable');
    }
    const item = inspection.items.find((row) => row.id === itemId);
    if (!item) throw new NotFoundException();
    if (!file) throw new UnprocessableEntityException('Evidence file required');
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.mimetype) || file.size > 10 * 1024 * 1024) {
      throw new UnprocessableEntityException('Invalid evidence file');
    }
    const suffix = extname(file.originalname).toLowerCase();
    const objectKey = `officer-inspections/${inspectionId}/${itemId}/${randomUUID()}${suffix}`;
    await this.storage.upload(objectKey, file.buffer, file.mimetype);
    const evidence = await this.prisma.officerInspectionEvidence.create({
      data: {
        inspectionItemId: itemId,
        fileName: file.originalname,
        objectKey,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        uploadedBy: user.sub,
      },
    });
    return {
      id: evidence.id,
      fileName: evidence.fileName,
      mimeType: evidence.mimeType,
      fileSizeBytes: evidence.fileSizeBytes,
      url: await this.storage.presign(evidence.objectKey),
      urlExpiresInSeconds: 600,
    };
  }

  async findInspection(id: string, user: JwtClaims) {
    const inspection = await this.findInspectionForAccess(id, user);
    return this.toInspectionDetail(inspection);
  }

  async exportInspection(
    id: string,
    query: OfficerInspectionExportQueryDto,
    user: JwtClaims,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<ExportFile> {
    const inspection = await this.findInspectionForAccess(id, user);
    const file =
      query.format === 'xlsx'
        ? this.exportXlsx(inspection)
        : await this.exportPdf(inspection);
    const objectKey = `officer-inspections/${id}/exports/${inspection.inspectionNo}.${query.format}`;
    await this.storage.upload(objectKey, file.buffer, file.contentType);
    await this.prisma.$transaction([
      this.prisma.officerInspection.update({
        where: { id },
        data: {
          status: OfficerInspectionStatus.EXPORTED,
          exportedAt: new Date(),
          pdfObjectKey: query.format === 'pdf' ? objectKey : undefined,
          xlsxObjectKey: query.format === 'xlsx' ? objectKey : undefined,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: user.sub,
          action: 'EXPORT',
          entityType: 'officer-inspections',
          entityId: id,
          afterValue: {
            inspectionNo: inspection.inspectionNo,
            format: query.format,
            objectKey,
          },
          ipAddress,
          userAgent,
        },
      }),
    ]);
    return file;
  }

  async listInspectionLogs(query: OfficerInspectionLogQueryDto) {
    const where: Prisma.OfficerInspectionWhereInput = {
      officerId: query.officerId,
      businessId: query.businessId,
      deletedAt: null,
      inspectedAt:
        query.dateFrom || query.dateTo
          ? {
              gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
              lte: query.dateTo ? new Date(query.dateTo) : undefined,
            }
          : undefined,
      items: query.licenseId
        ? {
            some: {
              licenseId: query.licenseId,
            },
          }
        : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.officerInspection.findMany({
        where,
        include: {
          officer: {
            select: {
              id: true,
              fullName: true,
              agency: { select: { code: true, nameTh: true } },
            },
          },
          business: { select: { id: true, nameTh: true, province: true } },
          juristicPerson: { select: { id: true, nameTh: true } },
          items: { select: { id: true } },
        },
        orderBy: { inspectedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.officerInspection.count({ where }),
    ]);
    return {
      data: data.map((inspection) => ({
        inspectionId: inspection.id,
        inspectionNo: inspection.inspectionNo,
        officer: {
          id: inspection.officer.id,
          fullName: inspection.officer.fullName,
          agency: inspection.officer.agency?.code ?? null,
        },
        business: inspection.business,
        juristic: inspection.juristicPerson,
        itemCount: inspection.items.length,
        status: inspection.status,
        inspectedAt: inspection.inspectedAt.toISOString(),
        submittedAt: inspection.submittedAt.toISOString(),
      })),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async getQrProfile(id: string, user: JwtClaims) {
    if (!isAdminTier(user.roles) && user.sub !== id) {
      throw new ForbiddenException('Cannot read this officer profile');
    }
    const officer = await this.prisma.systemUser.findFirst({
      where: {
        id,
        isActive: true,
        deletedAt: null,
        roles: { has: 'officer' },
      },
      include: { agency: true },
    });
    if (!officer) throw new NotFoundException();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + OFFICER_QR_TOKEN_TTL_MS);
    const qrToken = this.encryptToken({
      officerId: officer.id,
      issuedAt: issuedAt.toISOString(),
      version: 1,
    });
    return {
      officerId: officer.id,
      qrToken,
      verifyUrl: `${this.publicBaseUrl()}/api/public/officers/verify/${qrToken}`,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: OFFICER_QR_TOKEN_TTL_SECONDS,
    };
  }

  async verifyOfficerToken(
    token: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const scannedAt = new Date();
    const qrTokenId = this.tokenId(token);
    const payload = this.decryptToken(token);
    if (!payload) {
      await this.logScan(
        null,
        scannedAt,
        ipAddress,
        userAgent,
        qrTokenId,
        OfficerProfileScanResult.INVALID_TOKEN,
      );
      return {
        valid: false,
        scannedAt: scannedAt.toISOString(),
        reason: 'INVALID_TOKEN',
      };
    }
    const issuedAt = new Date(payload.issuedAt);
    if (
      Number.isNaN(issuedAt.getTime()) ||
      scannedAt.getTime() - issuedAt.getTime() > OFFICER_QR_TOKEN_TTL_MS
    ) {
      await this.logScan(
        payload.officerId,
        scannedAt,
        ipAddress,
        userAgent,
        qrTokenId,
        OfficerProfileScanResult.EXPIRED_TOKEN,
      );
      return {
        valid: false,
        scannedAt: scannedAt.toISOString(),
        reason: 'EXPIRED_TOKEN',
      };
    }
    const officer = await this.prisma.systemUser.findFirst({
      where: { id: payload.officerId, deletedAt: null },
      include: {
        agency: {
          include: {
            licenseTypes: {
              where: { isActive: true },
              orderBy: { code: 'asc' },
            },
          },
        },
      },
    });
    if (!officer || !officer.roles.includes('officer')) {
      await this.logScan(
        payload.officerId,
        scannedAt,
        ipAddress,
        userAgent,
        qrTokenId,
        OfficerProfileScanResult.NOT_OFFICER,
      );
      return {
        valid: false,
        scannedAt: scannedAt.toISOString(),
        reason: 'NOT_OFFICER',
      };
    }
    if (!officer.isActive || !officer.agency) {
      await this.logScan(
        officer.id,
        scannedAt,
        ipAddress,
        userAgent,
        qrTokenId,
        OfficerProfileScanResult.INACTIVE,
      );
      return {
        valid: false,
        scannedAt: scannedAt.toISOString(),
        reason: 'OFFICER_NOT_ACTIVE',
      };
    }
    await this.logScan(
      officer.id,
      scannedAt,
      ipAddress,
      userAgent,
      qrTokenId,
      OfficerProfileScanResult.VALID,
    );
    return {
      valid: true,
      scannedAt: scannedAt.toISOString(),
      officer: {
        fullName: officer.fullName,
        agency: {
          id: officer.agency.id,
          code: officer.agency.code,
          nameTh: officer.agency.nameTh,
        },
        permissions: [
          {
            agency: officer.agency.code,
            labelTh: `สามารถตรวจใบอนุญาต${officer.agency.nameTh}`,
            licenseTypeCodes: officer.agency.licenseTypes.map(
              (type) => type.code,
            ),
          },
        ],
      },
    };
  }

  private async findInspectionForAccess(id: string, user: JwtClaims) {
    const inspection = await this.prisma.officerInspection.findFirst({
      where: {
        id,
        deletedAt: null,
        officerId: isAdminTier(user.roles) ? undefined : user.sub,
      },
      include: {
        officer: { select: { id: true, fullName: true, agencyId: true } },
        agency: { select: { id: true, code: true, nameTh: true } },
        business: {
          include: {
            juristicPerson: {
              select: { id: true, registrationId: true, nameTh: true },
            },
          },
        },
        juristicPerson: {
          select: { id: true, registrationId: true, nameTh: true },
        },
        items: {
          include: {
            license: {
              include: {
                licenseType: {
                  include: {
                    agency: { select: { id: true, code: true, nameTh: true } },
                  },
                },
              },
            },
            evidence: { orderBy: { createdAt: 'asc' } },
          },
          orderBy: { sequence: 'asc' },
        },
      },
    });
    if (!inspection) throw new NotFoundException();
    return inspection;
  }

  private async toInspectionDetail(
    inspection: Awaited<ReturnType<OfficerService['findInspectionForAccess']>>,
  ) {
    return {
      id: inspection.id,
      inspectionNo: inspection.inspectionNo,
      status: inspection.status,
      summaryNote: inspection.summaryNote,
      inspectedAt: inspection.inspectedAt.toISOString(),
      submittedAt: inspection.submittedAt.toISOString(),
      exportedAt: inspection.exportedAt?.toISOString() ?? null,
      officer: inspection.officer,
      agency: inspection.agency,
      business: {
        id: inspection.business.id,
        nameTh: inspection.business.nameTh,
        address: inspection.business.address,
        province: inspection.business.province,
        juristic: inspection.business.juristicPerson,
      },
      juristic: inspection.juristicPerson,
      items: await Promise.all(
        inspection.items.map(async (item) => ({
          id: item.id,
          sequence: item.sequence,
          detailNote: item.detailNote,
          findings: item.findings,
          licenseSnapshot: item.licenseSnapshot,
          license: {
            id: item.license.id,
            licenseNumber: item.license.licenseNo,
            status: item.license.status,
            licenseType: {
              id: item.license.licenseType.id,
              code: item.license.licenseType.code,
              nameTh: item.license.licenseType.nameTh,
              agency: item.license.licenseType.agency,
            },
          },
          evidence: await Promise.all(
            item.evidence.map(async (evidence) => ({
              id: evidence.id,
              fileName: evidence.fileName,
              mimeType: evidence.mimeType,
              fileSizeBytes: evidence.fileSizeBytes,
              createdAt: evidence.createdAt.toISOString(),
              url: await this.storage.presign(evidence.objectKey),
              urlExpiresInSeconds: 600,
            })),
          ),
        })),
      ),
    };
  }

  private exportXlsx(
    inspection: Awaited<ReturnType<OfficerService['findInspectionForAccess']>>,
  ): ExportFile {
    const workbook = XLSX.utils.book_new();
    const rows = inspection.items.map((item) => ({
      inspectionNo: inspection.inspectionNo,
      inspectedAt: inspection.inspectedAt.toISOString(),
      officer: inspection.officer.fullName,
      agency: inspection.agency.code,
      business: inspection.business.nameTh,
      licenseNo: item.license.licenseNo,
      licenseType: item.license.licenseType.code,
      detailNote: item.detailNote ?? '',
      evidenceCount: item.evidence.length,
    }));
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(rows),
      'Inspection',
    );
    return {
      buffer: XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
      }) as Buffer,
      fileName: `${inspection.inspectionNo}.xlsx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private exportPdf(
    inspection: Awaited<ReturnType<OfficerService['findInspectionForAccess']>>,
  ): Promise<ExportFile> {
    return new Promise((resolve) => {
      const document = new PDFDocument({ margin: 40 });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () =>
        resolve({
          buffer: Buffer.concat(chunks),
          fileName: `${inspection.inspectionNo}.pdf`,
          contentType: 'application/pdf',
        }),
      );
      document.text(`Inspection No: ${inspection.inspectionNo}`);
      document.text(`Officer: ${inspection.officer.fullName}`);
      document.text(`Agency: ${inspection.agency.code}`);
      document.text(`Business: ${inspection.business.nameTh}`);
      document.text(`Inspected At: ${inspection.inspectedAt.toISOString()}`);
      document.moveDown();
      inspection.items.forEach((item) => {
        document.text(`License: ${item.license.licenseNo}`);
        document.text(`Type: ${item.license.licenseType.code}`);
        document.text(`Detail: ${item.detailNote ?? ''}`);
        document.text(`Evidence: ${item.evidence.length}`);
        document.moveDown();
      });
      document.end();
    });
  }

  private requireOfficerAgency(user: JwtClaims) {
    if (!user.agencyId) {
      throw new ForbiddenException('Officer agency is required');
    }
    return user.agencyId;
  }

  private findDuplicate(values: string[]) {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) return value;
      seen.add(value);
    }
    return null;
  }

  private officerSnapshot(officer: {
    id: string;
    fullName: string;
    agency: { id: string; code: string; nameTh: string };
  }) {
    return {
      id: officer.id,
      fullName: officer.fullName,
      agency: officer.agency,
    };
  }

  private businessSnapshot(business: {
    id: string;
    nameTh: string;
    address: string;
    province: string;
    juristicPerson: {
      id: string;
      registrationId: string;
      nameTh: string;
    } | null;
  }) {
    return {
      id: business.id,
      nameTh: business.nameTh,
      address: business.address,
      province: business.province,
      juristic: business.juristicPerson,
    };
  }

  private licenseSnapshot(license: {
    id: string;
    licenseNo: string;
    status: LicenseStatus;
    issueDate: Date;
    expireDate: Date | null;
    licenseType: {
      id: string;
      code: string;
      nameTh: string;
      agency: { id: string; code: string; nameTh: string };
    };
  }) {
    return {
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
    };
  }

  private encryptToken(payload: {
    officerId: string;
    issuedAt: string;
    version: number;
  }) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.tokenSecret(), iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  private decryptToken(token: string) {
    try {
      const [version, iv, tag, encrypted] = token.split('.');
      if (version !== 'v1' || !iv || !tag || !encrypted) return null;
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.tokenSecret(),
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final(),
      ]);
      const parsed = JSON.parse(decrypted.toString('utf8')) as {
        officerId?: string;
        issuedAt?: string;
        version?: number;
      };
      if (!parsed.officerId || !parsed.issuedAt) return null;
      return { officerId: parsed.officerId, issuedAt: parsed.issuedAt };
    } catch {
      return null;
    }
  }

  private tokenSecret() {
    const seed =
      process.env.OFFICER_QR_SECRET ??
      process.env.JWT_PRIVATE_KEY ??
      'dev-only-officer-qr-secret';
    return createHash('sha256').update(seed).digest();
  }

  private tokenId(token: string) {
    return createHash('sha256').update(token).digest('hex').slice(0, 32);
  }

  private publicBaseUrl() {
    return process.env.PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
  }

  private logScan(
    officerId: string | null,
    scannedAt: Date,
    ipAddress: string | undefined,
    userAgent: string | undefined,
    qrTokenId: string,
    result: OfficerProfileScanResult,
  ) {
    return this.prisma.officerPublicProfileScanLog.create({
      data: { officerId, scannedAt, ipAddress, userAgent, qrTokenId, result },
    });
  }
}
