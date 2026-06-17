import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class UserQueryDto {
  /** Filter by role. */
  @IsOptional()
  @IsIn(['public', 'officer', 'admin'])
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
   * Roles to grant. `officer`/`officer` for admin; `admin` for super_admin only.
   * @example ["officer"]
   */
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['officer', 'admin'], { each: true })
  roles!: string[];

  /** Owning agency (UUID of the Agency record). */
  @IsUUID()
  agencyId!: string;

  /** Zone assignments (uuids). */
  @IsArray()
  @IsUUID('4', { each: true })
  zoneIds: string[] = [];
}

export class UpdateRolesDto {
  /**
   * Replacement role set. Only a super_admin may assign `admin`/`super_admin`;
   * an admin may assign `public`/`officer`/`officer`.
   * @example ["officer","officer"]
   */
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['public', 'officer', 'admin', 'super_admin'], {
    each: true,
  })
  roles!: string[];
}

export class UpdateAgencyDto {
  /** New owning agency (UUID of the Agency record). */
  @IsUUID()
  agencyId!: string;
}

export class UpdateZonesDto {
  /** Replacement set of zone ids (uuids). */
  @IsArray()
  @IsUUID('4', { each: true })
  zoneIds!: string[];
}
