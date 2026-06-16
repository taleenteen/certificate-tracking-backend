import { Agency } from '@prisma/client';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// ───────────────────────── Requests ─────────────────────────

export class RegisterDto {
  /**
   * Unique login name: 3–50 chars, letters/digits/dot/underscore/hyphen only.
   * @example somchai.dev
   */
  @IsString()
  @Length(3, 50)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'username may contain only letters, digits, dot, underscore, hyphen',
  })
  username!: string;

  /**
   * Contact email address.
   * @example somchai@example.com
   */
  @IsEmail()
  @MaxLength(150)
  email!: string;

  /**
   * Password: 12–72 chars. The 72-char cap reflects bcrypt's input limit so
   * nothing is silently truncated. Choose a passphrase, not a short word.
   * @example MyStrongPass-2026!
   */
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password!: string;

  /**
   * Display name (Thai).
   * @example สมชาย ใจดี
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  /**
   * Optional phone number.
   * @example 0812345678
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class LoginDto {
  /**
   * Account username (the one chosen at registration).
   * @example somchai.dev
   */
  @IsString()
  @IsNotEmpty()
  username!: string;

  /**
   * Account password.
   * @example MyStrongPass-2026!
   */
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class TangRatLoginDto {
  /**
   * Opaque ทางรัฐ (Tang Rat) mToken. In development the mock provider accepts
   * deterministic tokens such as `mock-inspector-1`, `mock-supervisor-diw`.
   * @example mock-inspector-1
   */
  @IsString()
  @IsNotEmpty()
  mToken!: string;
}

export class SelfLoginDto {
  /**
   * Admin account username.
   * @example superadmin
   */
  @IsString()
  @IsNotEmpty()
  username!: string;

  /**
   * Admin account password.
   * @example ChangeMe-2026!
   */
  @IsString()
  @IsNotEmpty()
  password!: string;

  /**
   * 6-digit TOTP code. In development the code `000000` is accepted.
   * @example 000000
   */
  @IsString()
  @Length(6, 6)
  totpCode!: string;
}

export class RefreshDto {
  /**
   * Opaque refresh token. Optional in the body — when omitted, the value is
   * read from the `refreshToken` httpOnly cookie set at login.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}

export class ChangePasswordDto {
  /**
   * New password, minimum 12 characters.
   * @example NewStrongPass-2026!
   */
  @IsString()
  @MinLength(12)
  newPassword!: string;
}

export class ForgotPasswordDto {
  /**
   * Username of the account requesting a reset link.
   * @example superadmin
   */
  @IsString()
  @IsNotEmpty()
  username!: string;
}

export class ResetPasswordDto extends ChangePasswordDto {
  /**
   * Single-use reset token delivered to the user (logged to console in mock).
   */
  @IsString()
  @IsNotEmpty()
  token!: string;

  /** Optional username hint. */
  @IsOptional()
  @IsString()
  username?: string;
}

// ───────────────────────── Responses ─────────────────────────

export class AuthUserDto {
  /** User id (uuid). */
  id!: string;
  /** Display name (Thai). */
  fullName!: string;
  /** Granted roles, e.g. `["inspector"]`. */
  roles!: string[];
  /** Owning agency, or null for ADMIN/PUBLIC. */
  agency!: Agency | null;
}

export class AuthTokenResponseDto {
  /** RS256 access JWT (15-min TTL). Send as `Authorization: Bearer <token>`. */
  accessToken!: string;
  /** Opaque refresh token (also set as an httpOnly cookie). */
  refreshToken!: string;
  /** Minimal identity for the client to render the session. */
  user!: AuthUserDto;
  /**
   * D5 (secondary path hint): when a Tang Rat login or register detects an email
   * match with a password account, this non-blocking suggestion is returned so the
   * (rarer) domain-first user can complete proof-based link from /my/profile.
   * Primary Tang Rat users almost never see this.
   */
  linkSuggestion?: { type: 'email_match'; maskedEmail: string };
}

export class PasswordChangeRequiredResponseDto {
  /** Always true — the admin must set a new password before continuing. */
  requiresPasswordChange!: boolean;
  /** 5-minute token valid only on `POST /auth/change-password`. */
  tempToken!: string;
}

export class MessageResponseDto {
  /** Operation outcome flag. */
  success!: boolean;
}

export class SwitchContextDto {
  /**
   * UUID of the juristic person to activate, or `null` to return to user mode.
   * @example "7f3e1f9a-5c3b-4d7e-a8b1-2f0d6e9c4a1b"
   */
  @IsOptional()
  @IsUUID()
  juristicId?: string | null;
}

export class ContextSwitchResponseDto {
  /** Fresh RS256 access JWT with updated juristic context claims. */
  accessToken!: string;
  /** Minimal identity for the client. */
  user!: AuthUserDto;
  /** The active juristic person UUID, or null if switched back to user mode. */
  activeJuristicId!: string | null;
}
