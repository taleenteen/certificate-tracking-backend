import { IsEnum, IsOptional, IsString } from 'class-validator';
import { LicenseStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class BusinessQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  province?: string;
}

export class MapQueryDto {
  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  typeCode?: string;

  @IsOptional()
  @IsEnum(LicenseStatus)
  status?: LicenseStatus;
}
