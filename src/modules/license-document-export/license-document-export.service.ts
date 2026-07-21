import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  LicenseDocumentExportFormat,
  LicenseDocumentExportStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PDFDocument from 'pdfkit';
import { PDFDocument as PdfLibDocument } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { JwtClaims } from '../../common/auth.types';
import { isAdminTier } from '../../common/auth.roles';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  CreateLicenseDocumentExportDto,
  LicenseDocumentExportQueryDto,
} from './license-document-export.dto';

interface ExportFile {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

interface CreatedExportFile extends ExportFile {
  exportId: string;
  referenceNo: string;
  objectKey: string;
}

interface SourceDocument {
  id: string;
  docType: string;
  fileName: string;
  objectKey: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: Date;
}

interface SourceLicense {
  id: string;
  licenseNo: string;
  status: string;
  issueDate: Date;
  expireDate: Date | null;
  licenseType: {
    id: string;
    code: string;
    nameTh: string;
    agencyId: string;
    agency: { id: string; code: string; nameTh: string };
  };
  documents: SourceDocument[];
}

interface ExportSource {
  business: {
    id: string;
    nameTh: string;
    address: string;
    province: string;
    phone: string | null;
    ownerUserId: string | null;
    juristicPersonId: string | null;
    ownerName: string | null;
    juristicName: string | null;
    juristicRegistrationId: string | null;
  };
  licenses: SourceLicense[];
  agencies: Array<{ id: string; code: string; nameTh: string }>;
}

const FONT_MAGIC_HEADERS = ['00010000', '4f54544f', '74746366', '74727565'];
const SUPPORTED_PDF_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
]);
const MAX_SOURCE_DOCUMENTS = 100;
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

@Injectable()
export class LicenseDocumentExportService {
  private readonly logger = new Logger(LicenseDocumentExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async create(
    businessId: string,
    dto: CreateLicenseDocumentExportDto,
    user: JwtClaims,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<CreatedExportFile> {
    const source = await this.loadSource(businessId, dto.licenseIds);
    const referenceNo = this.referenceNo();
    const verificationCode = randomBytes(32).toString('hex');
    const format = this.toFormat(dto.format);
    const snapshot = this.snapshot(source, referenceNo);

    const exportRecord = await this.prisma.licenseDocumentExport.create({
      data: {
        referenceNo,
        verificationCode,
        businessId,
        exportedByUserId: user.sub,
        // DECISION: this legacy, required column remains a single-agency index.
        // The immutable snapshot and generated file carry every selected agency.
        agencyId: source.agencies[0].id,
        format,
        contentSnapshot: snapshot,
        items: {
          create: this.exportItems(source),
        },
      },
    });

    try {
      const file = await this.render(dto.format, source, referenceNo);
      const objectKey = `license-document-exports/${exportRecord.id}/${file.fileName}`;
      const sha256 = createHash('sha256').update(file.buffer).digest('hex');
      await this.storage.upload(objectKey, file.buffer, file.contentType);
      await this.prisma.$transaction(async (tx) => {
        await tx.licenseDocumentExport.update({
          where: { id: exportRecord.id },
          data: {
            status: LicenseDocumentExportStatus.COMPLETED,
            fileName: file.fileName,
            objectKey,
            fileSizeBytes: file.buffer.length,
            sha256,
            completedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            userId: user.sub,
            action: 'EXPORT',
            entityType: 'license-document-exports',
            entityId: exportRecord.id,
            afterValue: {
              referenceNo,
              businessId,
              licenseIds: dto.licenseIds,
              format: dto.format,
              sha256,
              sourcePlatform: 'E_LICENSE',
            },
            ipAddress,
            userAgent,
          },
        });
      });
      return {
        ...file,
        exportId: exportRecord.id,
        referenceNo,
        objectKey,
      };
    } catch (error) {
      this.logger.error(
        `License document export failed: ${exportRecord.id}`,
        error,
      );
      await this.prisma.$transaction(async (tx) => {
        await tx.licenseDocumentExport.update({
          where: { id: exportRecord.id },
          data: {
            status: LicenseDocumentExportStatus.FAILED,
            errorMessage: 'File generation failed',
          },
        });
        await tx.auditLog.create({
          data: {
            userId: user.sub,
            action: 'EXPORT_FAILED',
            entityType: 'license-document-exports',
            entityId: exportRecord.id,
            afterValue: {
              referenceNo,
              businessId,
              licenseIds: dto.licenseIds,
              format: dto.format,
            },
            ipAddress,
            userAgent,
          },
        });
      });
      throw new UnprocessableEntityException(
        'Unable to export license documents',
      );
    }
  }

  async list(query: LicenseDocumentExportQueryDto, user: JwtClaims) {
    const where: Prisma.LicenseDocumentExportWhereInput = {
      businessId: query.businessId,
      referenceNo: query.referenceNo
        ? { contains: query.referenceNo, mode: 'insensitive' }
        : undefined,
      status: LicenseDocumentExportStatus.COMPLETED,
      ...(isAdminTier(user.roles) ? {} : { exportedByUserId: user.sub }),
    };
    const [data, total] = await this.prisma.$transaction(async (tx) => {
      const data = await tx.licenseDocumentExport.findMany({
        where,
        include: {
          business: { select: { id: true, nameTh: true } },
          exportedByUser: { select: { id: true, fullName: true } },
          agency: { select: { id: true, code: true, nameTh: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
      const total = await tx.licenseDocumentExport.count({ where });
      return [data, total] as const;
    });
    return {
      data: data.map((item) => ({
        id: item.id,
        referenceNo: item.referenceNo,
        format: item.format.toLowerCase(),
        sourcePlatform: item.sourcePlatform,
        business: item.business,
        exportedBy: item.exportedByUser,
        agency: item.agency,
        fileName: item.fileName,
        fileSizeBytes: item.fileSizeBytes,
        sha256: item.sha256,
        documentCount: item._count.items,
        createdAt: item.createdAt,
        completedAt: item.completedAt,
      })),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async file(id: string, user: JwtClaims): Promise<ExportFile> {
    const record = await this.prisma.licenseDocumentExport.findFirst({
      where: {
        id,
        status: LicenseDocumentExportStatus.COMPLETED,
        ...(isAdminTier(user.roles) ? {} : { exportedByUserId: user.sub }),
      },
      select: {
        fileName: true,
        objectKey: true,
        format: true,
      },
    });
    if (!record?.fileName || !record.objectKey) throw new NotFoundException();
    return {
      buffer: await this.storage.download(record.objectKey),
      fileName: record.fileName,
      contentType: this.contentType(record.format),
    };
  }

  presign(objectKey: string) {
    return this.storage.presign(objectKey);
  }

  async nativeDelivery(objectKey: string, exportId: string) {
    const downloadUrl = await this.storage.presign(objectKey);
    const url = new URL(downloadUrl);
    this.logger.log({
      message: 'Native license export delivery created',
      exportId,
      downloadOrigin: url.origin,
      protocol: url.protocol,
    });
    return { downloadUrl, downloadOrigin: url.origin };
  }

  async verify(verificationCode: string) {
    const record = await this.prisma.licenseDocumentExport.findFirst({
      where: {
        verificationCode,
        status: LicenseDocumentExportStatus.COMPLETED,
      },
      select: {
        referenceNo: true,
        format: true,
        sourcePlatform: true,
        sha256: true,
        createdAt: true,
        completedAt: true,
        contentSnapshot: true,
      },
    });
    if (!record) throw new NotFoundException();
    const snapshot = record.contentSnapshot as {
      business?: { nameTh?: string; province?: string };
      licenses?: Array<{
        licenseNo?: string;
        licenseType?: { code?: string; nameTh?: string };
        status?: string;
      }>;
    };
    return {
      verified: true,
      referenceNo: record.referenceNo,
      format: record.format.toLowerCase(),
      sourcePlatform: record.sourcePlatform,
      sha256: record.sha256,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      business: snapshot.business
        ? {
            nameTh: snapshot.business.nameTh,
            province: snapshot.business.province,
          }
        : null,
      licenses: (snapshot.licenses ?? []).map((license) => ({
        licenseNo: license.licenseNo,
        licenseType: license.licenseType,
        status: license.status,
      })),
    };
  }

  private async loadSource(
    businessId: string,
    licenseIds: string[],
  ): Promise<ExportSource> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
      select: {
        id: true,
        nameTh: true,
        address: true,
        province: true,
        phone: true,
        ownerUserId: true,
        juristicPersonId: true,
        owner: { select: { fullName: true } },
        juristicPerson: { select: { nameTh: true, registrationId: true } },
      },
    });
    if (!business) throw new NotFoundException();
    const licenses = await this.prisma.license.findMany({
      where: { id: { in: licenseIds }, businessId, deletedAt: null },
      include: {
        licenseType: {
          include: {
            agency: { select: { id: true, code: true, nameTh: true } },
          },
        },
        documents: {
          select: {
            id: true,
            docType: true,
            fileName: true,
            objectKey: true,
            mimeType: true,
            fileSizeBytes: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (licenses.length !== licenseIds.length) throw new NotFoundException();

    const byId = new Map(licenses.map((license) => [license.id, license]));
    const ordered = licenseIds.map((id) => byId.get(id)!);
    const agencies = Array.from(
      new Map(
        ordered.map((license) => [
          license.licenseType.agency.id,
          license.licenseType.agency,
        ]),
      ).values(),
    ).sort((left, right) => left.code.localeCompare(right.code));

    const documents = ordered.flatMap((license) => license.documents);
    if (documents.length > MAX_SOURCE_DOCUMENTS) {
      throw new UnprocessableEntityException('Too many source documents');
    }
    const sourceBytes = documents.reduce(
      (total, document) => total + document.fileSizeBytes,
      0,
    );
    if (sourceBytes > MAX_SOURCE_BYTES) {
      throw new UnprocessableEntityException(
        'Source documents exceed export limit',
      );
    }
    return {
      business: {
        ...business,
        ownerName: business.owner?.fullName ?? null,
        juristicName: business.juristicPerson?.nameTh ?? null,
        juristicRegistrationId: business.juristicPerson?.registrationId ?? null,
      },
      licenses: ordered,
      agencies,
    };
  }

  private snapshot(source: ExportSource, referenceNo: string) {
    return {
      version: 1,
      sourcePlatform: 'E_LICENSE',
      referenceNo,
      business: {
        id: source.business.id,
        nameTh: source.business.nameTh,
        address: source.business.address,
        province: source.business.province,
        phone: source.business.phone,
        ownerName: source.business.juristicName ?? source.business.ownerName,
        juristicRegistrationId: source.business.juristicRegistrationId,
      },
      agencies: source.agencies,
      licenses: source.licenses.map((license) => ({
        id: license.id,
        licenseNo: license.licenseNo,
        status: license.status,
        issueDate: license.issueDate.toISOString(),
        expireDate: license.expireDate?.toISOString() ?? null,
        licenseType: {
          id: license.licenseType.id,
          code: license.licenseType.code,
          nameTh: license.licenseType.nameTh,
        },
        documents: license.documents.map((document) => ({
          id: document.id,
          docType: document.docType,
          fileName: document.fileName,
          mimeType: document.mimeType,
          fileSizeBytes: document.fileSizeBytes,
          createdAt: document.createdAt.toISOString(),
        })),
      })),
    };
  }

  private exportItems(source: ExportSource) {
    let sequence = 0;
    return source.licenses.flatMap((license) => {
      const documents: Array<SourceDocument | null> = license.documents.length
        ? license.documents
        : [null];
      return documents.map((document) => ({
        licenseId: license.id,
        licenseDocumentId: document?.id,
        sequence: ++sequence,
        licenseNoSnapshot: license.licenseNo,
        licenseTypeSnapshot: {
          id: license.licenseType.id,
          code: license.licenseType.code,
          nameTh: license.licenseType.nameTh,
        },
        documentSnapshot: document
          ? {
              id: document.id,
              docType: document.docType,
              fileName: document.fileName,
              mimeType: document.mimeType,
              fileSizeBytes: document.fileSizeBytes,
            }
          : undefined,
      }));
    });
  }

  private async render(
    format: CreateLicenseDocumentExportDto['format'],
    source: ExportSource,
    referenceNo: string,
  ): Promise<ExportFile> {
    if (format === 'pdf') return this.renderPdf(source, referenceNo);
    if (format === 'xlsx') return this.renderXlsx(source, referenceNo);
    return this.renderCsv(source, referenceNo);
  }

  private async renderPdf(
    source: ExportSource,
    referenceNo: string,
  ): Promise<ExportFile> {
    const document = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve) =>
      document.on('end', () => resolve(Buffer.concat(chunks))),
    );
    const fonts = this.pdfFontPaths();
    const regularFont = fonts ? 'Sarabun' : 'Helvetica';
    const boldFont = fonts ? 'Sarabun-Bold' : 'Helvetica-Bold';
    if (fonts) {
      document.registerFont(regularFont, fonts.regular);
      document.registerFont(boldFont, fonts.bold);
    }
    const pageWidth = 515;
    const drawSection = (title: string, y: number) => {
      document.rect(40, y, pageWidth, 26).fill('#1f3a5f');
      document
        .fillColor('#ffffff')
        .font(boldFont)
        .fontSize(11)
        .text(title, 52, y + 7);
      document.fillColor('#1f2937');
      return y + 26;
    };
    const drawField = (label: string, value: string, y: number) => {
      document.font(regularFont).fontSize(10);
      const height = Math.max(
        30,
        document.heightOfString(value, { width: 338 }) + 12,
      );
      document
        .rect(40, y, pageWidth, height)
        .fillAndStroke('#ffffff', '#cbd5e1');
      document
        .fillColor('#334155')
        .font(boldFont)
        .fontSize(9)
        .text(label, 52, y + 9, { width: 126 });
      document
        .fillColor('#111827')
        .font(regularFont)
        .fontSize(10)
        .text(value, 188, y + 8, { width: 350 });
      return y + height;
    };
    const issuedAt = new Date();
    document.font(boldFont).fontSize(18).text('รายงานผลการตรวจสอบใบอนุญาต', {
      align: 'center',
    });
    document.font(regularFont).fontSize(10);
    document.text(`วันที่ออกรายงาน: ${this.reportDate(issuedAt)}`, 300, 72, {
      width: 215,
      align: 'right',
    });
    document.text(`เวลาออกรายงาน: ${this.reportTime(issuedAt)}`, 300, 89, {
      width: 215,
      align: 'right',
    });
    document.text(`เลขที่อ้างอิงรายงาน: ${referenceNo}`, 300, 106, {
      width: 215,
      align: 'right',
    });
    document.text('แหล่งที่มาข้อมูล : e-license', 300, 123, {
      width: 215,
      align: 'right',
    });
    document.moveTo(40, 153).lineTo(555, 153).strokeColor('#1f3a5f').stroke();
    let coverY = drawSection('ข้อมูลสถานประกอบการ', 174);
    coverY = drawField('ชื่อสถานประกอบการ', source.business.nameTh, coverY);
    coverY = drawField(
      'ผู้ถือใบอนุญาต',
      source.business.juristicName ?? source.business.ownerName ?? '-',
      coverY,
    );
    if (source.business.juristicRegistrationId) {
      coverY = drawField(
        'เลขทะเบียนนิติบุคคล',
        source.business.juristicRegistrationId,
        coverY,
      );
    }
    coverY = drawField('ที่อยู่', source.business.address, coverY);
    coverY = drawField('จังหวัด', source.business.province, coverY);
    coverY = drawField('โทรศัพท์', source.business.phone ?? '-', coverY);
    coverY = drawSection('ขอบเขตรายงาน', coverY + 18);
    drawField(
      'ใบอนุญาตที่แนบ',
      `${source.licenses.length} รายการ จาก ${this.agencyLabel(source.agencies)}`,
      coverY,
    );

    source.licenses.forEach((license, index) => {
      document.addPage();
      document
        .fillColor('#1f2937')
        .font(boldFont)
        .fontSize(16)
        .text(`ข้อมูลใบอนุญาต ลำดับที่ ${index + 1}`, { align: 'center' });
      document.moveTo(40, 72).lineTo(555, 72).strokeColor('#1f3a5f').stroke();
      let licenseY = drawSection('รายละเอียดใบอนุญาต', 92);
      licenseY = drawField(
        'ประเภทใบอนุญาต',
        license.licenseType.nameTh,
        licenseY,
      );
      licenseY = drawField('รหัสประเภท', license.licenseType.code, licenseY);
      licenseY = drawField('เลขที่ใบอนุญาต', license.licenseNo, licenseY);
      licenseY = drawField(
        'สถานะ',
        this.licenseStatusLabel(license.status),
        licenseY,
      );
      licenseY = drawField(
        'วันที่ออกใบอนุญาต',
        this.reportDate(license.issueDate),
        licenseY,
      );
      licenseY = drawField(
        'วันหมดอายุ',
        license.expireDate
          ? this.reportDate(license.expireDate)
          : 'ไม่มีวันหมดอายุ',
        licenseY,
      );
      licenseY = drawSection('เอกสารที่แนบ', licenseY + 18);
      drawField(
        'ไฟล์เอกสาร',
        license.documents.length
          ? license.documents.map((item) => item.fileName).join(', ')
          : 'ไม่พบเอกสารที่ผูกกับใบอนุญาต',
        licenseY,
      );
    });
    document.end();
    const generated = await finished;
    const reportPages = await PdfLibDocument.load(generated);
    const merged = await PdfLibDocument.create();
    const [businessPage] = await merged.copyPages(reportPages, [0]);
    if (businessPage) merged.addPage(businessPage);
    for (const [index, license] of source.licenses.entries()) {
      const [licensePage] = await merged.copyPages(reportPages, [index + 1]);
      if (licensePage) merged.addPage(licensePage);
      for (const sourceDocument of license.documents) {
        try {
          if (!SUPPORTED_PDF_MIME_TYPES.has(sourceDocument.mimeType)) {
            this.logger.warn(
              `Unsupported export document type: ${sourceDocument.id}`,
            );
            continue;
          }
          const sourceFile = await this.storage.download(
            sourceDocument.objectKey,
          );
          const attachment = await this.toPdfAttachment(
            sourceFile,
            sourceDocument.mimeType,
          );
          const pages = await merged.copyPages(
            attachment,
            attachment.getPageIndices(),
          );
          pages.forEach((page) => merged.addPage(page));
        } catch (error) {
          this.logger.warn(
            `Unable to append source document: ${sourceDocument.id}`,
            error,
          );
        }
      }
    }
    const buffer = Buffer.from(await merged.save());
    return {
      buffer,
      fileName: `${referenceNo}.pdf`,
      contentType: 'application/pdf',
    };
  }

  private renderXlsx(source: ExportSource, referenceNo: string): ExportFile {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          referenceNo,
          sourcePlatform: 'E_LICENSE',
          businessName: source.business.nameTh,
          address: source.business.address,
          province: source.business.province,
          phone: source.business.phone ?? '',
          agencies: this.agencyLabel(source.agencies),
        },
      ]),
      'สถานประกอบการ',
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        source.licenses.map((license) => ({
          licenseNo: license.licenseNo,
          licenseTypeCode: license.licenseType.code,
          licenseTypeName: license.licenseType.nameTh,
          agencyCode: license.licenseType.agency.code,
          agencyName: license.licenseType.agency.nameTh,
          status: license.status,
          issueDate: license.issueDate.toISOString().slice(0, 10),
          expireDate: license.expireDate?.toISOString().slice(0, 10) ?? '',
          documentCount: license.documents.length,
        })),
      ),
      'ใบอนุญาต',
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        source.licenses.flatMap((license) =>
          license.documents.map((document) => ({
            licenseNo: license.licenseNo,
            docType: document.docType,
            fileName: document.fileName,
            mimeType: document.mimeType,
            fileSizeBytes: document.fileSizeBytes,
            createdAt: document.createdAt.toISOString(),
          })),
        ),
      ),
      'เอกสาร',
    );
    return {
      buffer: XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
      }) as Buffer,
      fileName: `${referenceNo}.xlsx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private renderCsv(source: ExportSource, referenceNo: string): ExportFile {
    const sheet = XLSX.utils.json_to_sheet(
      source.licenses.map((license) => ({
        referenceNo,
        sourcePlatform: 'E_LICENSE',
        businessName: source.business.nameTh,
        province: source.business.province,
        agency: license.licenseType.agency.nameTh,
        licenseNo: license.licenseNo,
        licenseTypeCode: license.licenseType.code,
        licenseTypeName: license.licenseType.nameTh,
        status: license.status,
        issueDate: license.issueDate.toISOString().slice(0, 10),
        expireDate: license.expireDate?.toISOString().slice(0, 10) ?? '',
        documentCount: license.documents.length,
      })),
    );
    return {
      buffer: Buffer.from(`\ufeff${XLSX.utils.sheet_to_csv(sheet)}`, 'utf8'),
      fileName: `${referenceNo}.csv`,
      contentType: 'text/csv; charset=utf-8',
    };
  }

  private toFormat(format: CreateLicenseDocumentExportDto['format']) {
    return {
      pdf: LicenseDocumentExportFormat.PDF,
      xlsx: LicenseDocumentExportFormat.XLSX,
      csv: LicenseDocumentExportFormat.CSV,
    }[format];
  }

  private contentType(format: LicenseDocumentExportFormat) {
    if (format === LicenseDocumentExportFormat.PDF) return 'application/pdf';
    if (format === LicenseDocumentExportFormat.XLSX) {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    return 'text/csv; charset=utf-8';
  }

  private referenceNo() {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `LEX-${date}-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private agencyLabel(agencies: Array<{ code: string; nameTh: string }>) {
    return agencies
      .map((agency) => `${agency.nameTh} (${agency.code})`)
      .join(', ');
  }

  private reportDate(value: Date) {
    return value.toLocaleDateString('th-TH', {
      timeZone: 'Asia/Bangkok',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  private reportTime(value: Date) {
    return `${value.toLocaleTimeString('th-TH', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })} น.`;
  }

  private licenseStatusLabel(status: string) {
    return (
      {
        ACTIVE: 'มีผลบังคับใช้',
        SUSPENDED: 'ถูกพักใช้',
        EXPIRED: 'หมดอายุ',
        REVOKED: 'ถูกเพิกถอน',
        PENDING: 'รอพิจารณา',
      }[status] ?? status
    );
  }

  private async toPdfAttachment(source: Buffer, mimeType: string) {
    if (mimeType === 'application/pdf') {
      return PdfLibDocument.load(source, { ignoreEncryption: true });
    }
    const imageDocument = await PdfLibDocument.create();
    const image =
      mimeType === 'image/png'
        ? await imageDocument.embedPng(source)
        : await imageDocument.embedJpg(source);
    const page = imageDocument.addPage([595.28, 841.89]);
    const scale = Math.min(
      (page.getWidth() - 72) / image.width,
      (page.getHeight() - 72) / image.height,
    );
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, {
      x: (page.getWidth() - width) / 2,
      y: (page.getHeight() - height) / 2,
      width,
      height,
    });
    return imageDocument;
  }

  private pdfFontPaths(): { regular: string; bold: string } | null {
    const cwd = process.cwd();
    const compiled = resolve(__dirname, '..', '..', 'assets', 'fonts');
    const regular = this.firstValidFontPath([
      resolve(cwd, 'src/assets/fonts/Sarabun-Regular.ttf'),
      resolve(cwd, 'dist/assets/fonts/Sarabun-Regular.ttf'),
      resolve(compiled, 'Sarabun-Regular.ttf'),
      '/usr/share/fonts/truetype/sarabun/Sarabun-Regular.ttf',
    ]);
    const bold = this.firstValidFontPath([
      resolve(cwd, 'src/assets/fonts/Sarabun-Bold.ttf'),
      resolve(cwd, 'dist/assets/fonts/Sarabun-Bold.ttf'),
      resolve(compiled, 'Sarabun-Bold.ttf'),
      '/usr/share/fonts/truetype/sarabun/Sarabun-Bold.ttf',
    ]);
    return regular && bold ? { regular, bold } : null;
  }

  private firstValidFontPath(paths: string[]) {
    return paths.find((path) => {
      if (!existsSync(path)) return false;
      try {
        return FONT_MAGIC_HEADERS.includes(
          readFileSync(path).subarray(0, 4).toString('hex'),
        );
      } catch {
        return false;
      }
    });
  }
}
