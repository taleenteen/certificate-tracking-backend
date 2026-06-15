import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Agency, LicenseStatus, SyncStatus } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { JwtClaims, RequestScope } from '../../common/auth.types';
import { isAdminTier } from '../../common/auth.roles';
import { GDX_PROVIDER } from '../external/external.module';
import type { GdxProvider, GdxLicenseRecord } from '../external/gdx.provider';
import { PrismaService } from '../../prisma/prisma.service';

interface DiwCsvRow {
  license_no: string;
  business_name: string;
  type_code: string;
  issue_date: string;
  status: LicenseStatus;
}

function isDiwCsvRow(value: unknown): value is DiwCsvRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.license_no === 'string' &&
    typeof row.business_name === 'string' &&
    typeof row.type_code === 'string' &&
    typeof row.issue_date === 'string' &&
    typeof row.status === 'string' &&
    new Set<string>(Object.values(LicenseStatus)).has(row.status)
  );
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GDX_PROVIDER) private readonly gdx: GdxProvider,
  ) {}

  private async upsert(record: GdxLicenseRecord, agency: Agency) {
    const type = await this.prisma.licenseType.findFirst({
      where: { code: record.typeCode, agency },
    });
    const zone = await this.prisma.zone.findFirst({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
    if (!type || !zone) throw new BadRequestException('Missing master data');
    let business = await this.prisma.business.findFirst({
      where: { nameTh: record.businessName, deletedAt: null },
    });
    business ??= await this.prisma.business.create({
      data: {
        nameTh: record.businessName,
        zoneId: zone.id,
        address: 'MOCK: imported address unavailable',
        province: zone.province,
      },
    });
    return this.prisma.license.upsert({
      where: { licenseNo: record.licenseNo },
      create: {
        licenseNo: record.licenseNo,
        businessId: business.id,
        licenseTypeId: type.id,
        issueDate: record.issueDate,
        expireDate:
          type.code === 'RNG4'
            ? null
            : new Date(
                Date.UTC(
                  record.issueDate.getUTCFullYear() + type.validityYears,
                  record.issueDate.getUTCMonth(),
                  record.issueDate.getUTCDate(),
                ),
              ),
        status: record.status,
      },
      update: {
        status: record.status,
        issueDate: record.issueDate,
        // RNG4 never receives an expiry date.
        expireDate:
          type.code === 'RNG4'
            ? null
            : new Date(
                Date.UTC(
                  record.issueDate.getUTCFullYear() + type.validityYears,
                  record.issueDate.getUTCMonth(),
                  record.issueDate.getUTCDate(),
                ),
              ),
      },
    });
  }

  async trigger(agency: Agency, user: JwtClaims) {
    if (!isAdminTier(user.roles) && user.agency !== agency) {
      throw new ForbiddenException();
    }
    if (agency !== Agency.ACFS) {
      throw new BadRequestException('DIW uses CSV import');
    }
    const recent = await this.prisma.syncLog.findFirst({
      where: {
        agency,
        startedAt: { gte: new Date(Date.now() - 5 * 60_000) },
      },
    });
    if (recent) {
      throw new HttpException(
        'Sync rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const log = await this.prisma.syncLog.create({
      data: { agency, triggeredBy: user.sub },
    });
    try {
      const records = await this.gdx.fetchAcfsLicenses();
      for (const record of records) await this.upsert(record, agency);
      return this.prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: SyncStatus.SUCCESS,
          recordsUpdated: records.length,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: SyncStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown sync error',
          finishedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async importDiw(file: Express.Multer.File, userId: string) {
    if (
      !file ||
      !['text/csv', 'application/vnd.ms-excel'].includes(file.mimetype)
    ) {
      throw new BadRequestException('CSV file required');
    }
    const parsed: unknown = parse(file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    if (
      !Array.isArray(parsed) ||
      !parsed.length ||
      !parsed.every(isDiwCsvRow)
    ) {
      throw new BadRequestException('Invalid CSV columns');
    }
    const rows = parsed;
    const log = await this.prisma.syncLog.create({
      data: { agency: Agency.DIW, triggeredBy: userId },
    });
    try {
      for (const row of rows) {
        if (
          !['RNG4', 'HAZMAT'].includes(row.type_code) ||
          !Object.values(LicenseStatus).includes(row.status)
        ) {
          throw new BadRequestException('Invalid DIW CSV row');
        }
        await this.upsert(
          {
            licenseNo: row.license_no,
            businessName: row.business_name,
            typeCode: row.type_code,
            issueDate: new Date(row.issue_date),
            status: row.status,
          },
          Agency.DIW,
        );
      }
      return this.prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: SyncStatus.SUCCESS,
          recordsUpdated: rows.length,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: SyncStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message : 'CSV import failed',
          finishedAt: new Date(),
        },
      });
      throw error;
    }
  }

  status(user: JwtClaims, scope?: RequestScope | null) {
    return this.prisma.syncLog.findMany({
      where: {
        agency: isAdminTier(user.roles) ? undefined : scope?.agency,
      },
      distinct: ['agency'],
      orderBy: [{ agency: 'asc' }, { startedAt: 'desc' }],
    });
  }
}
