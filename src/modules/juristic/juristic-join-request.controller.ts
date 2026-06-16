import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtClaims } from '../../common/auth.types';
import {
  ApproveFirstOwnerDto,
  CompanySearchResultDto,
  CreateJoinRequestDto,
  FirstOwnerClaimDetailDto,
  JoinRequestSubmittedDto,
  JoinRequestSummaryDto,
  JuristicSuccessDto,
  RejectJoinRequestDto,
  SearchCompaniesQuery,
} from './juristic.dto';
import { JuristicService } from './juristic.service';

@ApiTags('Juristic Requests')
@ApiBearerAuth('access-token')
@Controller('juristic-requests')
export class JuristicJoinRequestController {
  constructor(private readonly juristicService: JuristicService) {}

  @ApiOperation({
    summary: 'Search companies to join',
    description:
      'Full-text search by Thai or English company name, or exact match on registration ID. ' +
      'Returns up to 20 results. Does not require juristic context.',
  })
  @ApiOkResponse({ type: [CompanySearchResultDto] })
  @Get('companies')
  searchCompanies(@Query() query: SearchCompaniesQuery) {
    return this.juristicService.searchCompanies(query.q ?? '');
  }

  @ApiOperation({
    summary: 'Submit a join request',
    description:
      'Request to join a company. Requires a verified citizen ID on your account (link Tang Rat first). ' +
      'Routing is automatic: if the company has no active OWNER, the request is sent to platform staff ' +
      'as a first-owner claim; otherwise it goes to the company OWNER/ADMIN queue. ' +
      'Rate limited to 3 requests per hour, max 5 pending at a time.',
  })
  @ApiCreatedResponse({ type: JoinRequestSubmittedDto })
  @ApiConflictResponse({
    description: 'Already a member, duplicate pending, or rate limit exceeded.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'No verified citizen ID on account.',
  })
  @ApiNotFoundResponse({ description: 'Company not found.' })
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @Post()
  requestToJoin(
    @CurrentUser() user: JwtClaims,
    @Body() dto: CreateJoinRequestDto,
  ) {
    return this.juristicService.requestToJoin(user.sub, dto);
  }

  @ApiOperation({
    summary: 'My join requests',
    description:
      'List all join requests submitted by the current user, with their current status.',
  })
  @ApiOkResponse({ type: [JoinRequestSummaryDto] })
  @Get('mine')
  getMyRequests(@CurrentUser() user: JwtClaims) {
    return this.juristicService.getMyRequests(user.sub);
  }

  @ApiOperation({
    summary: 'Staff: first-owner claim queue',
    description:
      'Platform-staff queue for companies that have no active OWNER yet. ' +
      'Expired requests are lazily swept on each read. Requires admin tier.',
  })
  @ApiOkResponse({ type: [FirstOwnerClaimDetailDto] })
  @Roles('admin')
  @Get('admin/first-owner-claims')
  getFirstOwnerClaims() {
    return this.juristicService.getFirstOwnerClaims();
  }

  @ApiOperation({
    summary: 'Staff: approve a first-owner claim',
    description:
      'Approve a first-owner claim, making the requester the OWNER of the company. ' +
      'Race condition safe: 409 if another OWNER appeared since the request was submitted.',
  })
  @ApiOkResponse({ type: JuristicSuccessDto })
  @ApiNotFoundResponse({ description: 'Claim not found.' })
  @ApiConflictResponse({
    description: 'Request no longer pending, or company already has an OWNER.',
  })
  @ApiGoneResponse({ description: 'Request has expired.' })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post('admin/:reqId/approve')
  approveFirstOwnerClaim(
    @CurrentUser() user: JwtClaims,
    @Param('reqId', ParseUUIDPipe) reqId: string,
    @Body() dto: ApproveFirstOwnerDto,
  ) {
    return this.juristicService.approveFirstOwnerClaim(user.sub, reqId, dto);
  }

  @ApiOperation({
    summary: 'Staff: reject a first-owner claim',
    description: 'Reject a first-owner claim. The requester is notified.',
  })
  @ApiOkResponse({ type: JuristicSuccessDto })
  @ApiNotFoundResponse({ description: 'Claim not found.' })
  @ApiConflictResponse({ description: 'Request is no longer pending.' })
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @Post('admin/:reqId/reject')
  rejectFirstOwnerClaim(
    @CurrentUser() user: JwtClaims,
    @Param('reqId', ParseUUIDPipe) reqId: string,
    @Body() dto: RejectJoinRequestDto,
  ) {
    return this.juristicService.rejectFirstOwnerClaim(user.sub, reqId, dto);
  }

  @ApiOperation({
    summary: 'Cancel own pending request',
    description:
      'Cancel a join request you submitted. Only PENDING requests can be cancelled.',
  })
  @ApiOkResponse({ type: JuristicSuccessDto })
  @ApiNotFoundResponse({ description: 'Request not found.' })
  @ApiConflictResponse({ description: 'Request is no longer pending.' })
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  cancelRequest(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.juristicService.cancelRequest(user.sub, id);
  }
}
