import { IsEnum, IsOptional, IsString } from 'class-validator';
import { LicenseStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class BusinessQueryDto extends PaginationDto {
  /**
   * Case-insensitive search on the Thai business name.
   * @example โรงงาน
   */
  @IsOptional()
  @IsString()
  q?: string;

  /**
   * Filter by province (Thai).
   * @example กรุงเทพมหานคร
   */
  @IsOptional()
  @IsString()
  province?: string;
}

export class MapQueryDto {
  /**
   * Case-insensitive search on Thai business name or address.
   * @example โรงงาน
   */
  @IsOptional()
  @IsString()
  q?: string;

  /** Filter by province (Thai). */
  @IsOptional()
  @IsString()
  province?: string;

  /**
   * Filter by license type code.
   * @example RNG4
   */
  @IsOptional()
  @IsString()
  typeCode?: string;

  /** Filter by license status. */
  @IsOptional()
  @IsEnum(LicenseStatus)
  status?: LicenseStatus;
}
