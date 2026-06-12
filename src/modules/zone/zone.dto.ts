import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateZoneDto {
  @IsString()
  code!: string;

  @IsString()
  nameTh!: string;

  @IsString()
  province!: string;

  @IsOptional()
  @IsObject()
  boundary?: object;
}

export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  nameTh?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsObject()
  boundary?: object;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
