import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
   * Deprecated compatibility switch used only when no active juristic context
   * exists. Prefer POST /auth/context and then call GET /my/licenses.
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
    summary:
      '[DEV] Create a test license expiring within 30 days for the current user',
  })
  @ApiOkResponse({ description: 'Newly created dev license.' })
  @Post('dev/seed-license')
  createDevLicense(@CurrentUser() user: JwtClaims) {
    return this.myService.createDevLicense(user.sub);
  }

  @ApiOperation({
    summary:
      '[DEV] Create complete personal and juristic demo data for current user',
    description:
      'Prototype-only helper that creates or updates one personal demo ' +
      'business/license and one juristic demo company from the seeded license ' +
      'template catalog. It clones document references and map coordinates into ' +
      'records owned by the current user. Idempotent per user; production use ' +
      'requires DEMO_DATA_ENABLED=true.',
  })
  @ApiOkResponse({
    description:
      'Created/updated complete demo data and returns personal/juristic ids.',
  })
  @ApiForbiddenResponse({ description: 'Demo data is disabled.' })
  @Post('dev/seed-demo-data')
  createDevDemoData(@CurrentUser() user: JwtClaims) {
    return this.myService.createDevDemoData(user.sub);
  }

  @ApiOperation({
    summary:
      '[DEV] Create juristic company demo data with licenses for current user',
    description:
      'Prototype-only helper for empty databases and frontend demos. Creates ' +
      'or updates one demo juristic person, makes the current user OWNER, and ' +
      'clones seeded document templates into user-owned businesses/licenses. ' +
      'Idempotent per user; production use requires DEMO_DATA_ENABLED=true.',
  })
  @ApiOkResponse({
    description:
      'Created/updated demo juristic data and returns the grouped license view.',
  })
  @ApiForbiddenResponse({ description: 'Demo data is disabled.' })
  @Post('dev/seed-juristic-license-demo')
  createDevJuristicLicenseDemo(@CurrentUser() user: JwtClaims) {
    return this.myService.createDevJuristicLicenseDemo(user.sub);
  }

  @ApiOperation({
    summary: 'My juristic licenses grouped by company',
    description:
      'Read-only grouped view for collapse UI. Returns every active juristic ' +
      'membership for the current user with businesses nested under each ' +
      'juristic person and licenses nested under each business. ' +
      'Does not require POST /auth/context and does not change the access token.',
  })
  @ApiOkResponse({
    description:
      'Array of juristic companies with role, business count, and nested business/license data.',
  })
  @Get('juristic-license-groups')
  juristicLicenseGroups(@CurrentUser() user: JwtClaims) {
    return this.myService.getJuristicLicenseGroups(user.sub);
  }

  @ApiOperation({
    summary: 'Juristic business detail',
    description:
      'Full detail for one business/branch under a juristic person. The ' +
      'backend derives the juristic person from the business and verifies that ' +
      'the current user is an active member. Returns 404 for not found or not ' +
      'in scope.',
  })
  @ApiOkResponse({
    description:
      'Business detail with address, juristic owner, license summary, and licenses.',
  })
  @ApiNotFoundResponse({
    description: 'Business not found, not juristic, or not in user scope.',
  })
  @Get('juristic-businesses/:id')
  juristicBusinessDetail(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.myService.getJuristicBusinessDetail(user.sub, id);
  }

  @ApiOperation({
    summary: 'My licenses',
    description:
      'Returns licenses for the current session context. If the access token ' +
      'has `activeJuristicId`, this returns that juristic person’s licenses. ' +
      '`mode=personal|juristic` is kept only for legacy clients without active ' +
      'context; `mode=juristic` uses the mock DBD lookup and returns 404 ' +
      'with `{ found: false }` when no match exists.',
  })
  @ApiOkResponse({
    description:
      'Array of licenses with business and ownership metadata for the active context.',
  })
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
