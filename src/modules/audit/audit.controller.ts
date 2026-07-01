import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtClaims } from '../../common/auth.types';
import { AuditQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@ApiBearerAuth('access-token')
@Roles('officer', 'admin')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @ApiOperation({
    summary: 'List audit logs',
    description:
      'Admin sees all; officer is scoped to their agency. Filter by ' +
      'user / entity type / date range. Returns `{ data, meta }`.',
  })
  @ApiOkResponse({ description: 'Paginated audit log entries.' })
  @Get()
  list(@Query() query: AuditQueryDto, @CurrentUser() user: JwtClaims) {
    return this.audit.list(query, user);
  }
}
