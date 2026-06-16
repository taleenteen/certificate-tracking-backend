import { JoinRequestStatus, JuristicRole } from '@prisma/client';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─────────────── Requests ───────────────

export class ClaimJuristicDto {
  /**
   * DBD registration ID (tax ID) of the juristic person to claim as OWNER.
   * The caller's verified citizen ID must appear as a director in DBD records.
   * @example "0105560000001"
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  registrationId!: string;
}

export class DirectAddMemberDto {
  /**
   * Thai national citizen ID (13 digits) of the user to add.
   * The target must already be registered and have a verified citizen ID.
   * @example "1000003703701"
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(13)
  citizenId!: string;

  /** Juristic role to assign. Defaults to MEMBER. */
  @IsOptional()
  @IsIn(['OWNER', 'ADMIN', 'MEMBER'])
  role?: JuristicRole;

  /** Free-text HR position (e.g. "Compliance Officer"). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;
}

export class UpdateMemberDto {
  /** New juristic role. */
  @IsOptional()
  @IsIn(['OWNER', 'ADMIN', 'MEMBER'])
  role?: JuristicRole;

  /** Updated HR position. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;
}

export class InviteMemberDto {
  /**
   * Email address to send the invite to.
   * @example "newmember@example.com"
   */
  @IsEmail()
  @MaxLength(150)
  email!: string;

  /** Role to grant upon acceptance. Defaults to MEMBER. */
  @IsOptional()
  @IsIn(['OWNER', 'ADMIN', 'MEMBER'])
  role?: JuristicRole;

  /** Free-text HR position. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;
}

export class AcceptInviteDto {
  /**
   * Single-use invite token (from email / console log in mock).
   * @example "abc123token"
   */
  @IsString()
  @IsNotEmpty()
  token!: string;
}

// ─────────────── Responses ───────────────

export class JuristicMembershipDto {
  @ApiProperty() juristicId!: string;
  @ApiProperty() nameTh!: string;
  @ApiPropertyOptional() nameEn?: string;
  @ApiProperty({ enum: JuristicRole }) role!: JuristicRole;
  @ApiPropertyOptional() position?: string;
  @ApiProperty() joinedAt!: Date;
}

export class JuristicCompanyDto {
  @ApiProperty() id!: string;
  @ApiProperty() registrationId!: string;
  @ApiProperty() nameTh!: string;
  @ApiPropertyOptional() nameEn?: string;
  @ApiPropertyOptional() juristicType?: string;
  @ApiPropertyOptional() address?: string;
  @ApiProperty({ enum: JuristicRole }) myRole!: JuristicRole;
  @ApiPropertyOptional() myPosition?: string;
  @ApiProperty() memberCount!: number;
}

export class JuristicMemberDetailDto {
  @ApiProperty() userId!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ enum: JuristicRole }) role!: JuristicRole;
  @ApiPropertyOptional() position?: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() joinedAt!: Date;
}

export class JuristicInviteDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: JuristicRole }) role!: JuristicRole;
  @ApiPropertyOptional() position?: string;
  @ApiProperty() status!: string;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty() createdAt!: Date;
}

export class JuristicSuccessDto {
  @ApiProperty() success!: boolean;
}

// ─────────────── D7: Join Request DTOs ───────────────

export class SearchCompaniesQuery {
  /** Search keyword — matches company name (Thai/English) or exact registration ID. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class CreateJoinRequestDto {
  /** UUID of the juristic person to request to join. */
  @IsUUID()
  juristicId!: string;

  /** Preferred role (advisory; peer approver may override; capped at ADMIN on peer path). */
  @IsOptional()
  @IsIn(['OWNER', 'ADMIN', 'MEMBER'])
  requestedRole?: JuristicRole;

  /** Preferred HR position title. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  requestedPosition?: string;

  /** Justification note for the approver. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class ReviewJoinRequestDto {
  /** Role to grant. Peer approvers can only grant MEMBER or ADMIN (not OWNER). */
  @IsOptional()
  @IsIn(['MEMBER', 'ADMIN'])
  role?: JuristicRole;

  /** HR position to assign to the new member. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;

  /** Optional note for the requester. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ApproveFirstOwnerDto {
  /** HR position title to assign. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;
}

export class RejectJoinRequestDto {
  /** Rejection reason shown to the requester. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// ─── D7 Responses ───

export class CompanySearchResultDto {
  @ApiProperty() id!: string;
  @ApiProperty() registrationId!: string;
  @ApiProperty() nameTh!: string;
  @ApiPropertyOptional() nameEn?: string;
  @ApiProperty({
    description: 'True if the company already has at least one active OWNER',
  })
  hasActiveOwner!: boolean;
}

export class JoinRequestSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() juristicId!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty({ enum: JoinRequestStatus }) status!: JoinRequestStatus;
  @ApiProperty() isFirstOwnerClaim!: boolean;
  @ApiProperty({ enum: JuristicRole }) requestedRole!: JuristicRole;
  @ApiPropertyOptional() requestedPosition?: string;
  @ApiPropertyOptional() message?: string;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty() createdAt!: Date;
}

export class JoinRequestDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() requesterName!: string;
  @ApiPropertyOptional() citizenIdLast4?: string;
  @ApiProperty({ enum: JuristicRole }) requestedRole!: JuristicRole;
  @ApiPropertyOptional() requestedPosition?: string;
  @ApiPropertyOptional() message?: string;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty() createdAt!: Date;
}

export class FirstOwnerClaimDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() requesterName!: string;
  @ApiPropertyOptional() citizenIdLast4?: string;
  @ApiPropertyOptional() message?: string;
  @ApiProperty() juristicId!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty() registrationId!: string;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty() createdAt!: Date;
}

export class JoinRequestSubmittedDto {
  @ApiProperty() id!: string;
  @ApiProperty() juristicId!: string;
  @ApiProperty() isFirstOwnerClaim!: boolean;
  @ApiProperty({ enum: JoinRequestStatus }) status!: JoinRequestStatus;
}
