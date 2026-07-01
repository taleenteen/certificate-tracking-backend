import { Controller, Get, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtClaims } from '../../common/auth.types';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboards')
@ApiBearerAuth('access-token')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboards: DashboardService) {}

  @Roles('officer')
  @ApiOperation({
    summary: 'Officer dashboard',
    description:
      'Combined personal task counts (assigned to me) and agency-level ' +
      'aggregates (task counts by status, compliance rate) scoped to the ' +
      "officer's agency.",
  })
  @ApiOkResponse({ description: 'Officer dashboard aggregates.' })
  @Get('officer')
  officer(@CurrentUser() user: JwtClaims, @Req() request: Request) {
    return this.dashboards.officer(user.sub, request.scope!);
  }

  @Roles('admin')
  @ApiOperation({
    summary: 'Admin dashboard',
    description:
      'System-wide counts: users by role, licenses by status, and last ' +
      'sync per agency.',
  })
  @ApiOkResponse({ description: 'Admin dashboard aggregates.' })
  @Get('admin')
  admin() {
    return this.dashboards.admin();
  }
}
