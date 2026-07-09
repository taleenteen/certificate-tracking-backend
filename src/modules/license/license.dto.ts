import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LicenseStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class PublicLicenseSearchDto extends PaginationDto {
  /**
   * Free-text search: business name, juristic name, or license number.
   * @example สถานประกอบการตัวอย่าง
   */
  @IsOptional()
  @IsString()
  q?: string;

  /**
   * Optional license number search.
   * @example RNG4
   */
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  /**
   * Optional license status filter.
   * @example ACTIVE
   */
  @IsOptional()
  @IsEnum(LicenseStatus)
  status?: LicenseStatus;
}

export class CreateLicenseTypeDto {
  /** Short unique code, e.g. "RNG4". */
  @IsString()
  code!: string;

  /** Thai name, e.g. "ร.ง.4". */
  @IsString()
  nameTh!: string;

  /** English name (optional). */
  @IsOptional()
  @IsString()
  nameEn?: string;

  /** Owning agency (UUID of the Agency record). */
  @IsUUID()
  agencyId!: string;

  /** Standard validity in years. */
  @IsNumber()
  @Min(1)
  @Max(99)
  validityYears!: number;

  /** Whether a field inspection is required at issuance. */
  @IsOptional()
  @IsBoolean()
  requiresInspection?: boolean;

  /** Whether annual-fee nonpayment triggers SUSPENDED status. */
  @IsOptional()
  @IsBoolean()
  suspendedOnNonpayment?: boolean;

  /** Description (Thai). */
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateLicenseStatusDto {
  @IsEnum(['ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED', 'PENDING'])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateLicenseTypeDto {
  @IsOptional()
  @IsString()
  nameTh?: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsUUID()
  agencyId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(99)
  validityYears?: number;

  @IsOptional()
  @IsBoolean()
  requiresInspection?: boolean;

  @IsOptional()
  @IsBoolean()
  suspendedOnNonpayment?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
