import { ApiHideProperty } from '@nestjs/swagger';
import { LicenseStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateOfficerInspectionEvidenceDto {
  /** The original file name. */
  @IsString()
  @MaxLength(255)
  fileName!: string;

  /** The object key returned by the temp upload endpoint. */
  @IsString()
  @MaxLength(500)
  objectKey!: string;

  /** The MIME type of the uploaded file. */
  @IsString()
  @MaxLength(100)
  mimeType!: string;

  /** The file size in bytes. */
  @IsInt()
  @Min(1)
  fileSizeBytes!: number;
}

export class OfficerLicenseQueryDto extends PaginationDto {
  /**
   * Business / branch name search.
   * @example โรงงานต้นแบบ
   */
  @IsOptional()
  @IsString()
  q?: string;

  /**
   * Optional license number search.
   * @example RNG4-00001
   */
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  _rsc?: string;

  /** Filter by license status. */
  @IsOptional()
  @IsEnum(LicenseStatus)
  status?: LicenseStatus;

  /** Filter by juristic person (uuid). */
  @IsOptional()
  @IsUUID()
  juristicId?: string;

  /** Filter by business / branch (uuid). */
  @IsOptional()
  @IsUUID()
  businessId?: string;

  /** Optional license agency filter (uuid). Omit to show all agencies. */
  @IsOptional()
  @IsUUID()
  agencyId?: string;
}

export class CreateOfficerInspectionItemDto {
  /** License to include in this report item (uuid). */
  @IsUUID()
  licenseId!: string;

  /** Deprecated frontend field. Accepted for compatibility and ignored. */
  @ApiHideProperty()
  @IsOptional()
  result?: unknown;

  /** Officer-written detail for this license item. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  detailNote?: string;

  /** Flexible structured findings for UI form answers. */
  @IsOptional()
  findings?: unknown;

  /** Optional evidence pictures for this item. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOfficerInspectionEvidenceDto)
  pictures?: CreateOfficerInspectionEvidenceDto[];
}

export class CreateOfficerInspectionDto {
  /** Business / branch inspected in this report batch (uuid). */
  @IsUUID()
  businessId!: string;

  /**
   * Actual inspection timestamp (ISO-8601). Server submit time is stored separately.
   * Defaults to current time if omitted.
   * @example 2026-07-01T09:00:00.000Z
   */
  @IsOptional()
  @IsDateString()
  inspectedAt?: string;

  /** Batch-level summary note. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  summaryNote?: string;

  /** License-level report items, one object per selected license. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateOfficerInspectionItemDto)
  items!: CreateOfficerInspectionItemDto[];
}

export class UpdateOfficerInspectionItemDto {
  /** Officer-written detail for this license item. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  detailNote?: string;

  /** Flexible structured findings for UI form answers. */
  @IsOptional()
  findings?: unknown;
}

export class OfficerInspectionLogQueryDto extends PaginationDto {
  /** Filter by officer (uuid). */
  @IsOptional()
  @IsUUID()
  officerId?: string;

  /** Filter by business / branch (uuid). */
  @IsOptional()
  @IsUUID()
  businessId?: string;

  /** Filter by license (uuid). */
  @IsOptional()
  @IsUUID()
  licenseId?: string;

  /**
   * Inclusive start of inspected-at range (ISO-8601).
   * @example 2026-07-01
   */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /**
   * Inclusive end of inspected-at range (ISO-8601).
   * @example 2026-07-31
   */
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class OfficerInspectionListQueryDto extends PaginationDto {
  /**
   * Search by inspection number, business name, or officer name.
   * @example IR-2026
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** Filter by business / branch (uuid). */
  @IsOptional()
  @IsUUID()
  businessId?: string;

  /** Filter by license (uuid). */
  @IsOptional()
  @IsUUID()
  licenseId?: string;

  /**
   * Inclusive start of inspected-at range (ISO-8601 or YYYY-MM-DD).
   * @example 2026-07-01
   */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /**
   * Inclusive end of inspected-at range (ISO-8601 or YYYY-MM-DD).
   * @example 2026-07-31
   */
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class OfficerInspectionExportQueryDto {
  /** Export format. */
  @IsIn(['pdf', 'xlsx'])
  format!: 'pdf' | 'xlsx';
}
