import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * D5 profile + identity DTOs (Tang Rat primary).
 * Follows CODING_STANDARDS §10/10b: JSDoc + class-validator; plugin generates Swagger.
 */

// Request DTOs

export class PatchProfileDto {
  /**
   * Display name (Thai preferred). Maps to fullName.
   * @example สมชาย ใจดี
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  /**
   * Choose a known email (from registration or linked tang_rat) or set a new one.
   * Server validates against current known emails for this account.
   * @example somchai@example.com
   */
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  /**
   * Phone override (Tang Rat phone is source if present).
   * @example 0812345678
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class AddCredentialsDto {
  /**
   * Desired username for password login (must be unique).
   * @example somchai.dev
   */
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username!: string;

  /**
   * New password (12-72 chars, bcrypt cost 12).
   * @example MyWebPass-2026!
   */
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password!: string;
}

export class LinkTangRatDto {
  /**
   * Fresh mToken proving control of a Tang Rat identity (citizen ID).
   * Used for domain-first users to bind/merge into their Tang Rat canonical (secondary path).
   * @example mock-public-collision-b
   */
  @IsString()
  mToken!: string;
}

// Response shapes (typed for Swagger + client)

export class IdentityDto {
  /**
   * The provider for this identity.
   * @example tang_rat
   */
  provider!: 'self' | 'tang_rat';

  /** Username if this is a self (password) identity. */
  username?: string;

  /** Whether this identity was verified (true for tang_rat). */
  verified?: boolean;

  /** Email associated with this identity (if any). */
  email?: string;

  /** When the identity was linked. */
  linkedAt?: string;

  /** Last time this identity was used to log in. */
  lastLoginAt?: string;

  /** Phone from the provider (Tang Rat). */
  providerPhone?: string;
}

export class ProfileResponseDto {
  /** User UUID. */
  id!: string;

  /** Display name (Thai). */
  displayName!: string;

  /** Primary email (can be chosen among known ones). */
  email?: string;

  /** Phone number. */
  phone?: string;

  /** Roles array, e.g. ["public"]. */
  roles!: string[];

  /** Agency if applicable (null for public or admin). */
  agency?: string | null;

  /** Whether the user has a verified citizen ID from Tang Rat. */
  citizenIdVerified!: boolean;

  /** Last 4 digits of citizen ID for display (e.g. "1234"). Never the full ID. */
  citizenIdLast4?: string;

  /** Origin channel: "tang_rat" is primary for most users. */
  primaryChannel!: 'domain' | 'tang_rat';

  /** List of linked identities (self and/or tang_rat). */
  identities!: IdentityDto[];

  /**
   * True if the user can still add a password (i.e. currently Tang Rat only).
   * This is the primary two-way UX for most citizens.
   */
  canAddPassword!: boolean;

  /**
   * True if the user can still link a Tang Rat identity (domain-first case).
   * This is the secondary/rarer path.
   */
  canLinkTangRat!: boolean;
}

export class LinkSuggestionDto {
  type!: 'email_match';
  maskedEmail!: string;
}

// Reusable success response (or import from auth if preferred)
export class MessageResponseDto {
  /** Operation outcome flag. */
  success!: boolean;
}
