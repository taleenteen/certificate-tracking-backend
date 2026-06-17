import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

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
