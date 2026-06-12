import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtClaims } from '../../common/auth.types';
import { AuditQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@Roles('supervisor', 'admin')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: AuditQueryDto, @CurrentUser() user: JwtClaims) {
    return this.audit.list(query, user);
  }
}
