import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateZoneDto {
  /**
   * Unique zone code.
   * @example Z-BKK
   */
  @IsString()
  code!: string;

  /**
   * Zone name (Thai).
   * @example เขตกรุงเทพมหานคร
   */
  @IsString()
  nameTh!: string;

  /**
   * Province (Thai).
   * @example กรุงเทพมหานคร
   */
  @IsString()
  province!: string;

  /** GeoJSON polygon boundary. */
  @IsOptional()
  @IsObject()
  boundary?: object;
}

export class UpdateZoneDto {
  /** Zone name (Thai). */
  @IsOptional()
  @IsString()
  nameTh?: string;

  /** Province (Thai). */
  @IsOptional()
  @IsString()
  province?: string;

  /** GeoJSON polygon boundary. */
  @IsOptional()
  @IsObject()
  boundary?: object;

  /** Whether the zone is active. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
