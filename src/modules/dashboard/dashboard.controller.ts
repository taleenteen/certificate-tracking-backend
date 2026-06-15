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

  @Roles('inspector')
  @ApiOperation({
    summary: 'Inspector dashboard',
    description:
      'Counts (pending, in-progress, returned, completed this month) and the ' +
      '5 most recent tasks for the current inspector.',
  })
  @ApiOkResponse({ description: 'Inspector dashboard aggregates.' })
  @Get('inspector')
  inspector(@CurrentUser() user: JwtClaims) {
    return this.dashboards.inspector(user.sub);
  }

  @Roles('supervisor')
  @ApiOperation({
    summary: 'Supervisor dashboard',
    description:
      'Zone summary, pending review count, task counts by status, and ' +
      'compliance rate — scoped to the supervisor’s zones + agency.',
  })
  @ApiOkResponse({ description: 'Supervisor dashboard aggregates.' })
  @Get('supervisor')
  supervisor(@Req() request: Request) {
    return this.dashboards.supervisor(request.scope!);
  }

  @Roles('admin')
  @ApiOperation({
    summary: 'Admin dashboard',
    description:
      'System-wide counts: users by role, zones, licenses by status, and last ' +
      'sync per agency.',
  })
  @ApiOkResponse({ description: 'Admin dashboard aggregates.' })
  @Get('admin')
  admin() {
    return this.dashboards.admin();
  }
}
