import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtClaims } from '../../common/auth.types';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboards: DashboardService) {}

  @Roles('inspector')
  @Get('inspector')
  inspector(@CurrentUser() user: JwtClaims) {
    return this.dashboards.inspector(user.sub);
  }

  @Roles('supervisor')
  @Get('supervisor')
  supervisor(@Req() request: Request) {
    return this.dashboards.supervisor(request.scope!);
  }

  @Roles('admin')
  @Get('admin')
  admin() {
    return this.dashboards.admin();
  }
}
