import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { JuristicCtx } from '../../common/decorators/juristic-context.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JuristicContext, JwtClaims } from '../../common/auth.types';
import { MyService } from './my.service';
import {
  AddCredentialsDto,
  LinkTangRatDto,
  MessageResponseDto,
  PatchProfileDto,
  ProfileResponseDto,
} from './my.dto';

class MyLicensesQuery {
  /**
   * `personal` = licenses of a business the user owns; `juristic` = licenses of
   * the user's registered juristic person (mock DBD lookup).
   */
  @ApiPropertyOptional({ enum: ['personal', 'juristic'], default: 'personal' })
  @IsIn(['personal', 'juristic'])
  mode: 'personal' | 'juristic' = 'personal';
}

@ApiTags('My')
@ApiBearerAuth('access-token')
@Controller('my')
export class MyController {
  constructor(private readonly myService: MyService) {}

  @ApiOperation({
    summary: 'My licenses',
    description:
      'Returns the current user’s licenses. In `juristic` mode, a 404 with ' +
      '`{ found: false }` is returned when no juristic match exists.',
  })
  @ApiOkResponse({ description: 'Licenses for the selected mode.' })
  @Get('licenses')
  licenses(
    @CurrentUser() user: JwtClaims,
    @Query() query: MyLicensesQuery,
    @JuristicCtx() ctx: JuristicContext | null,
  ) {
    if (ctx?.juristicId) {
      return this.myService.getLicensesByJuristicId(ctx.juristicId);
    }
    if (query.mode === 'personal') {
      return this.myService.getLicensesPersonal(user.sub);
    }
    return this.myService.getLicensesJuristic(user);
  }

  // ───────────────────────── D5 Profile & Identity (Tang Rat primary) ─────────────────────────

  @ApiOperation({
    summary: 'Unified profile + linked identities (D5)',
    description:
      'Returns the current user’s profile with citizen verification status (Tang Rat is canonical/primary), linked identities, and actionable flags. ' +
      'citizenIdLast4 is display-only; raw national ID is never stored or returned.',
  })
  @ApiOkResponse({
    description: 'Profile for the authenticated user.',
    type: ProfileResponseDto,
  })
  @ApiNotFoundResponse({ description: 'User not found or soft-deleted.' })
  @Get('profile')
  getProfile(@CurrentUser() user: JwtClaims) {
    return this.myService.getProfile(user);
  }

  @ApiOperation({
    summary: 'Edit display name / primary email / phone (self only)',
    description:
      'User-editable fields only. Email must be one of the known emails for this account or the current value.',
  })
  @ApiOkResponse({ description: 'Updated profile.', type: ProfileResponseDto })
  @ApiNotFoundResponse({ description: 'User not found.' })
  @Patch('profile')
  patchProfile(@CurrentUser() user: JwtClaims, @Body() dto: PatchProfileDto) {
    return this.myService.updateProfile(user, dto);
  }

  @ApiOperation({
    summary:
      'Add username/password to a Tang Rat-primary account (primary two-way path)',
    description:
      'Allows a user who authenticated via Tang Rat to add password credentials for web fallback. ' +
      'Requires the account has no passwordHash yet (use change-password otherwise). Primary happy path for most users.',
  })
  @ApiOkResponse({
    description: 'Credentials added.',
    type: MessageResponseDto,
  })
  @ApiNotFoundResponse({ description: 'User not found.' })
  @ApiConflictResponse({ description: 'Username already taken.' })
  @Post('credentials')
  addCredentials(
    @CurrentUser() user: JwtClaims,
    @Body() dto: AddCredentialsDto,
  ) {
    return this.myService.addCredentials(user, dto);
  }

  @ApiOperation({
    summary:
      'Link a Tang Rat identity (mToken proof) to current account (secondary/domain-first path)',
    description:
      'Proof-based link. If the mToken resolves to a citizen ID already verified on another (Tang Rat) account, the current (domain) account is merged *into* the Tang Rat canonical. ' +
      'Domain-initiated merge is deliberately secondary and never compromises primary Tang Rat accounts.',
  })
  @ApiOkResponse({
    description: 'Link or merge completed; returns updated profile.',
    type: ProfileResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid mToken or inactive target.',
  })
  @ApiNotFoundResponse({ description: 'User not found.' })
  @ApiConflictResponse({
    description:
      'Citizen identity already linked to another account (or cross-tier).',
  })
  @ApiForbiddenResponse({
    description: 'Account inactive or other permission issue.',
  })
  @Post('identities/tang-rat')
  linkTangRat(@CurrentUser() user: JwtClaims, @Body() dto: LinkTangRatDto) {
    return this.myService.linkTangRat(user, dto.mToken);
  }

  @ApiOperation({
    summary:
      'Unlink Tang Rat identity (must retain at least one sign-in method)',
    description:
      'Removes the tang_rat link(s). 422 if this would leave the account with no password and no tang_rat link.',
  })
  @ApiOkResponse({ description: 'Unlinked.', type: MessageResponseDto })
  @ApiNotFoundResponse({ description: 'User not found.' })
  @ApiUnprocessableEntityResponse({
    description: 'Cannot unlink the last remaining sign-in method.',
  })
  @Delete('identities/tang-rat')
  unlinkTangRat(@CurrentUser() user: JwtClaims) {
    return this.myService.unlinkTangRat(user);
  }
}
