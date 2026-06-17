import { BadRequestException, Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { JwtClaims, RequestScope } from '../../common/auth.types';
import { isAdminTier } from '../../common/auth.roles';
import { PrismaService } from '../../prisma/prisma.service';

interface ExportFile {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  private pdf(lines: string[]): Promise<Buffer> {
    return new Promise((resolve) => {
      const document = new PDFDocument({ margin: 40 });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      lines.forEach((line) => document.text(line));
      document.end();
    });
  }

  private workbook(rows: Record<string, unknown>[]) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(rows),
      'Export',
    );
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async audit(format: string): Promise<ExportFile> {
    const logs = await this.prisma.auditLog.findMany({
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const rows = logs.map((log) => ({
      id: log.id,
      user: log.user?.fullName ?? '',
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId ?? '',
      createdAt: log.createdAt.toISOString(),
    }));
    if (format === 'xlsx') {
      return {
        buffer: this.workbook(rows),
        fileName: 'audit-logs.xlsx',
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }
    if (format === 'pdf') {
      return {
        buffer: await this.pdf(
          rows.map(
            (row) =>
              `${row.createdAt} ${row.action} ${row.entityType} ${row.entityId}`,
          ),
        ),
        fileName: 'audit-logs.pdf',
        contentType: 'application/pdf',
      };
    }
    throw new BadRequestException('format must be pdf or xlsx');
  }

  async report(
    id: string,
    format: string,
    user: JwtClaims,
    scope?: RequestScope | null,
  ): Promise<ExportFile | null> {
    const report = await this.prisma.inspectionReport.findFirst({
      where: {
        id,
        task: isAdminTier(user.roles)
          ? undefined
          : {
              zoneId: { in: scope?.zoneIds ?? [] },
              OR: [
                { license: { licenseType: { agencyId: scope?.agencyId } } },
                { licenseId: null },
              ],
            },
      },
      include: {
        inspector: { select: { fullName: true } },
        task: {
          include: {
            business: true,
            license: { include: { licenseType: true } },
          },
        },
      },
    });
    if (!report) return null;
    const row = {
      taskNo: report.task.taskNo,
      business: report.task.business.nameTh,
      licenseNo: report.task.license?.licenseNo ?? '',
      inspector: report.inspector.fullName,
      result: report.result ?? '',
      score: report.score ?? '',
      summaryNote: report.summaryNote ?? '',
      submittedAt: report.submittedAt?.toISOString() ?? '',
    };
    if (format === 'xlsx') {
      return {
        buffer: this.workbook([row]),
        fileName: `${report.task.taskNo}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }
    if (format === 'pdf') {
      return {
        buffer: await this.pdf(
          Object.entries(row).map(([key, value]) => `${key}: ${value}`),
        ),
        fileName: `${report.task.taskNo}.pdf`,
        contentType: 'application/pdf',
      };
    }
    throw new BadRequestException('format must be pdf or xlsx');
  }
}
