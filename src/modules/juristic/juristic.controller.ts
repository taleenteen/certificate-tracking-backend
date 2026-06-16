import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { JuristicCtx } from '../../common/decorators/juristic-context.decorator';
import { RequireJuristicRole } from '../../common/decorators/require-juristic-role.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireJuristicRoleGuard } from '../../common/guards/require-juristic-role.guard';
import { JuristicContext, JwtClaims } from '../../common/auth.types';
import {
  ClaimJuristicDto,
  DirectAddMemberDto,
  InviteMemberDto,
  JoinRequestDetailDto,
  JuristicCompanyDto,
  JuristicInviteDto,
  JuristicMemberDetailDto,
  JuristicMembershipDto,
  JuristicSuccessDto,
  RejectJoinRequestDto,
  ReviewJoinRequestDto,
  UpdateMemberDto,
} from './juristic.dto';
import { JuristicService } from './juristic.service';

@ApiTags('Juristic')
@ApiBearerAuth('access-token')
@Controller('juristic')
export class JuristicController {
  constructor(private readonly juristicService: JuristicService) {}

  @ApiOperation({
    summary: 'My juristic memberships (context-switcher list)',
    description:
      'Lists all active company memberships for the current user. ' +
      "Use POST /auth/context with one of these juristicId values to switch into that company's session.",
  })
  @ApiOkResponse({ type: [JuristicMembershipDto] })
  @Get()
  getMyMemberships(@CurrentUser() user: JwtClaims) {
    return this.juristicService.getMyMemberships(user.sub);
  }

  @ApiOperation({
    summary: 'Claim a company as OWNER via DBD director verification',
    description:
      "Verifies the caller's citizen ID against DBD records. On success, " +
      'creates or upgrades a JuristicMember(OWNER) row and returns the company. ' +
      'Requires a verified citizen ID on the account (link Tang Rat first).',
  })
  @ApiCreatedResponse({ description: 'Claimed as OWNER.' })
  @ApiForbiddenResponse({ description: 'Not a registered director in DBD.' })
  @ApiUnprocessableEntityResponse({
    description: 'No verified citizen ID on account.',
  })
  @ApiNotFoundResponse({ description: 'Juristic person not found.' })
  @Post('claim')
  claimCompany(@CurrentUser() user: JwtClaims, @Body() dto: ClaimJuristicDto) {
    return this.juristicService.claimCompany(user.sub, dto);
  }

  @ApiOperation({
    summary: 'Accept an invite by token',
    description:
      'Consumes the single-use invite token (from email / console log in mock). ' +
      'Token is the secret — email matching is not enforced. Single-use; 410 if already used or expired.',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: JuristicSuccessDto })
  @ApiGoneResponse({ description: 'Invite already used, revoked, or expired.' })
  @ApiConflictResponse({
    description: 'Already a member of this organization.',
  })
  @Post('invites/:token/accept')
  acceptInvite(@CurrentUser() user: JwtClaims, @Param('token') token: string) {
    return this.juristicService.acceptInvite(user.sub, token);
  }

  @ApiOperation({
    summary: 'Company detail (must be a member)',
    description:
      'Returns company info, your role, and member count. ' +
      'Does not require an active juristic context — membership is verified directly.',
  })
  @ApiOkResponse({ type: JuristicCompanyDto })
  @ApiNotFoundResponse({ description: 'Company not found or not a member.' })
  @Get(':id')
  getCompany(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.juristicService.getCompany(id, user.sub);
  }

  @ApiOperation({
    summary: 'List members (ADMIN+)',
    description:
      'Lists all members of the company. Requires ADMIN or OWNER juristic role ' +
      'in the active context (switch via POST /auth/context first).',
  })
  @ApiOkResponse({ type: [JuristicMemberDetailDto] })
  @ApiForbiddenResponse({
    description: 'Not in active juristic context or insufficient role.',
  })
  @UseGuards(RequireJuristicRoleGuard)
  @RequireJuristicRole('ADMIN')
  @Get(':id/members')
  getMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @JuristicCtx() ctx: JuristicContext,
  ) {
    this.assertContext(ctx, id);
    return this.juristicService.getMembers(id);
  }

  @ApiOperation({
    summary: 'Direct-add a member by citizen ID (ADMIN+)',
    description:
      'Adds a user who already has a verified citizen ID. ' +
      'No invite email is sent. Use POST /:id/invites for newcomers.',
  })
  @ApiCreatedResponse({ type: JuristicSuccessDto })
  @ApiConflictResponse({ description: 'Already a member.' })
  @ApiNotFoundResponse({
    description: 'No verified user found with that citizen ID.',
  })
  @ApiUnprocessableEntityResponse({ description: 'Invalid citizen ID format.' })
  @UseGuards(RequireJuristicRoleGuard)
  @RequireJuristicRole('ADMIN')
  @Post(':id/members')
  directAddMember(
    @Param('id', ParseUUIDPipe) id: string,
    @JuristicCtx() ctx: JuristicContext,
    @Body() dto: DirectAddMemberDto,
  ) {
    this.assertContext(ctx, id);
    return this.juristicService.directAddMember(ctx, dto);
  }

  @ApiOperation({
    summary: 'Update member role or position (ADMIN+)',
    description:
      'Change the juristic role or free-text position of a member. ' +
      'Cannot demote the only OWNER (422).',
  })
  @ApiOkResponse({ type: JuristicSuccessDto })
  @ApiNotFoundResponse({ description: 'Member not found.' })
  @ApiUnprocessableEntityResponse({
    description: 'Cannot demote the only OWNER.',
  })
  @UseGuards(RequireJuristicRoleGuard)
  @RequireJuristicRole('ADMIN')
  @Patch(':id/members/:userId')
  updateMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @JuristicCtx() ctx: JuristicContext,
    @Body() dto: UpdateMemberDto,
  ) {
    this.assertContext(ctx, id);
    return this.juristicService.updateMember(ctx, userId, dto);
  }

  @ApiOperation({
    summary: 'Remove a member (ADMIN+)',
    description:
      'Soft-deactivates the membership. Cannot remove the only OWNER (422).',
  })
  @ApiOkResponse({ type: JuristicSuccessDto })
  @ApiNotFoundResponse({ description: 'Member not found.' })
  @ApiUnprocessableEntityResponse({
    description: 'Cannot remove the only OWNER.',
  })
  @UseGuards(RequireJuristicRoleGuard)
  @RequireJuristicRole('ADMIN')
  @HttpCode(HttpStatus.OK)
  @Delete(':id/members/:userId')
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @JuristicCtx() ctx: JuristicContext,
  ) {
    this.assertContext(ctx, id);
    return this.juristicService.removeMember(ctx, userId);
  }

  @ApiOperation({
    summary: 'Send an email invite (ADMIN+, MOCK: console)',
    description:
      'Creates a single-use 7-day invite token. In development the token is ' +
      'printed to the console instead of emailed.',
  })
  @ApiCreatedResponse({ type: JuristicSuccessDto })
  @UseGuards(RequireJuristicRoleGuard)
  @RequireJuristicRole('ADMIN')
  @Post(':id/invites')
  inviteMember(
    @Param('id', ParseUUIDPipe) id: string,
    @JuristicCtx() ctx: JuristicContext,
    @Body() dto: InviteMemberDto,
  ) {
    this.assertContext(ctx, id);
    return this.juristicService.inviteMember(ctx, dto);
  }

  @ApiOperation({ summary: 'List pending invites (ADMIN+)' })
  @ApiOkResponse({ type: [JuristicInviteDto] })
  @UseGuards(RequireJuristicRoleGuard)
  @RequireJuristicRole('ADMIN')
  @Get(':id/invites')
  getInvites(
    @Param('id', ParseUUIDPipe) id: string,
    @JuristicCtx() ctx: JuristicContext,
  ) {
    this.assertContext(ctx, id);
    return this.juristicService.getInvites(id);
  }

  @ApiOperation({ summary: 'Revoke a pending invite (ADMIN+)' })
  @ApiOkResponse({ type: JuristicSuccessDto })
  @ApiNotFoundResponse({ description: 'Invite not found.' })
  @ApiUnprocessableEntityResponse({
    description: 'Invite is no longer pending.',
  })
  @UseGuards(RequireJuristicRoleGuard)
  @RequireJuristicRole('ADMIN')
  @HttpCode(HttpStatus.OK)
  @Delete(':id/invites/:inviteId')
  revokeInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @JuristicCtx() ctx: JuristicContext,
  ) {
    this.assertContext(ctx, id);
    return this.juristicService.revokeInvite(ctx, inviteId);
  }

  @ApiOperation({
    summary: 'Pending join requests for this company (ADMIN+)',
    description:
      'Lists PENDING non-first-owner join requests for the active company. ' +
      'Expired requests are lazily swept to EXPIRED status on each read. ' +
      'Requires active juristic context matching the :id param.',
  })
  @ApiOkResponse({ type: [JoinRequestDetailDto] })
  @ApiForbiddenResponse({
    description: 'Not in active juristic context or insufficient role.',
  })
  @UseGuards(RequireJuristicRoleGuard)
  @RequireJuristicRole('ADMIN')
  @Get(':id/join-requests')
  getPendingRequests(
    @Param('id', ParseUUIDPipe) id: string,
    @JuristicCtx() ctx: JuristicContext,
  ) {
    this.assertContext(ctx, id);
    return this.juristicService.getPendingRequests(id);
  }

  @ApiOperation({
    summary: 'Approve a join request (ADMIN+)',
    description:
      'Approve a pending join request and grant the requester membership. ' +
      'Peer approvers can grant MEMBER or ADMIN only (not OWNER). ' +
      'Idempotent if the requester is already a member.',
  })
  @ApiOkResponse({ type: JuristicSuccessDto })
  @ApiNotFoundResponse({ description: 'Request not found.' })
  @ApiConflictResponse({ description: 'Request is no longer pending.' })
  @ApiGoneResponse({ description: 'Request has expired.' })
  @UseGuards(RequireJuristicRoleGuard)
  @RequireJuristicRole('ADMIN')
  @HttpCode(HttpStatus.OK)
  @Post(':id/join-requests/:reqId/approve')
  approveJoinRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('reqId', ParseUUIDPipe) reqId: string,
    @JuristicCtx() ctx: JuristicContext,
    @Body() dto: ReviewJoinRequestDto,
  ) {
    this.assertContext(ctx, id);
    return this.juristicService.approveRequest(ctx, reqId, dto);
  }

  @ApiOperation({
    summary: 'Reject a join request (ADMIN+)',
    description: 'Reject a pending join request. The requester is notified.',
  })
  @ApiOkResponse({ type: JuristicSuccessDto })
  @ApiNotFoundResponse({ description: 'Request not found.' })
  @ApiConflictResponse({ description: 'Request is no longer pending.' })
  @UseGuards(RequireJuristicRoleGuard)
  @RequireJuristicRole('ADMIN')
  @HttpCode(HttpStatus.OK)
  @Post(':id/join-requests/:reqId/reject')
  rejectJoinRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('reqId', ParseUUIDPipe) reqId: string,
    @JuristicCtx() ctx: JuristicContext,
    @Body() dto: RejectJoinRequestDto,
  ) {
    this.assertContext(ctx, id);
    return this.juristicService.rejectRequest(ctx, reqId, dto);
  }

  private assertContext(ctx: JuristicContext | null, id: string) {
    if (!ctx || ctx.juristicId !== id) {
      throw new ForbiddenException(
        `Active juristic context must match the requested organization. Switch context first via POST /auth/context.`,
      );
    }
  }
}
