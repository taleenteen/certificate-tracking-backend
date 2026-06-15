import { Agency } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class UserQueryDto {
  /** Filter by role. */
  @IsOptional()
  @IsIn(['public', 'inspector', 'supervisor', 'admin'])
  role?: string;

  /** Filter by assigned zone (uuid). */
  @IsOptional()
  @IsUUID()
  zoneId?: string;

  /** Filter by active status. */
  @IsOptional()
  @IsBoolean()
  status?: boolean;

  /** Free-text search on name/username. */
  @IsOptional()
  @IsString()
  q?: string;
}

export class CreateUserDto {
  /**
   * Full name (Thai).
   * @example สมชาย ใจดี
   */
  @IsString()
  fullName!: string;

  /** Username for self-login users (optional for mToken users). */
  @IsOptional()
  @IsString()
  username?: string;

  /** Contact email. */
  @IsOptional()
  @IsEmail()
  email?: string;

  /** Contact phone. */
  @IsOptional()
  @IsString()
  phone?: string;

  /**
   * Roles to grant. Only `inspector`/`supervisor` may be created here.
   * @example ["inspector"]
   */
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['inspector', 'supervisor'], { each: true })
  roles!: string[];

  /** Owning agency. */
  @IsEnum(Agency)
  agency!: Agency;

  /** Zone assignments (uuids). */
  @IsArray()
  @IsUUID('4', { each: true })
  zoneIds: string[] = [];
}

export class UpdateRolesDto {
  /**
   * Replacement role set. Only a super_admin may assign `admin`/`super_admin`;
   * an admin may assign `public`/`inspector`/`supervisor`.
   * @example ["supervisor","inspector"]
   */
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['public', 'inspector', 'supervisor', 'admin', 'super_admin'], {
    each: true,
  })
  roles!: string[];
}

export class UpdateAgencyDto {
  /** New owning agency. */
  @IsEnum(Agency)
  agency!: Agency;
}

export class UpdateZonesDto {
  /** Replacement set of zone ids (uuids). */
  @IsArray()
  @IsUUID('4', { each: true })
  zoneIds!: string[];
}
