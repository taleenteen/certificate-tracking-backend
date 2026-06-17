import { AgencyApiStatus, AgencyDataSource } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAgencyDto {
  /**
   * Short immutable code, e.g. "DIW", "ACFS", "FDA". Cannot be changed after creation.
   * @example FDA
   */
  @IsString()
  @MaxLength(20)
  code!: string;

  /** Thai name. */
  @IsString()
  @MaxLength(200)
  nameTh!: string;

  /** English name (optional). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  /** How the agency's license data enters the system. */
  @IsEnum(AgencyDataSource)
  dataSource!: AgencyDataSource;

  /** Current API integration status. */
  @IsEnum(AgencyApiStatus)
  apiStatus!: AgencyApiStatus;
}

export class UpdateAgencyDto {
  /** Thai name. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameTh?: string;

  /** English name. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  /** How the agency's license data enters the system. */
  @IsOptional()
  @IsEnum(AgencyDataSource)
  dataSource?: AgencyDataSource;

  /** Current API integration status. */
  @IsOptional()
  @IsEnum(AgencyApiStatus)
  apiStatus?: AgencyApiStatus;

  /** Soft-deactivate (false) or reactivate (true) the agency. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
