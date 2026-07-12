import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

const normalizeIdentity = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trimText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UserQueryDto {
  /** Filter by role. */
  @IsOptional()
  @IsIn(['public', 'officer', 'admin'])
  role?: string;

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
  @Transform(trimText)
  fullName!: string;

  /** Username for self-login users (optional for mToken users). */
  @IsOptional()
  @IsString()
  @Transform(normalizeIdentity)
  username?: string;

  /** Contact email. */
  @IsOptional()
  @IsEmail()
  @Transform(normalizeIdentity)
  email?: string;

  /** Contact phone. */
  @IsOptional()
  @IsString()
  @Transform(trimText)
  phone?: string;

  /**
   * Roles to grant. Admin may grant public/officer; super_admin may grant admin.
   * @example ["officer"]
   */
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['officer', 'admin'], { each: true })
  roles!: string[];

  /** Owning agency (UUID of the Agency record). */
  @IsUUID()
  agencyId!: string;

  /** Optional initial password. If provided, sets this as the password and does not force a change.
   *  If omitted alongside a username, a random temp password is generated and mustChangePassword is set. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  initialPassword?: string;
}

export class UpdateRolesDto {
  /**
   * Replacement role set. Only a super_admin may assign `admin`/`super_admin`;
   * an admin may assign `public`/`officer`.
   * @example ["officer"]
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

export class UpdateUserAccessDto {
  /**
   * Replacement role set. This back-office operation is restricted to
   * super_admin because it may promote a Tang Rat identity to staff access.
   * @example ["officer"]
   */
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['public', 'officer', 'admin', 'super_admin'], { each: true })
  roles!: string[];

  /**
   * Required when assigning the officer role. Clear it for a public-only
   * account so the account cannot retain staff scope accidentally.
   */
  @IsOptional()
  @IsUUID()
  agencyId?: string;
}
