import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtClaims } from '../../common/auth.types';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller()
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @ApiOperation({
    summary: 'List my notifications',
    description: 'Paginated, newest first. Returns `{ data, meta }`.',
  })
  @ApiOkResponse({ description: 'Paginated notifications.' })
  @Get('my/notifications')
  list(@CurrentUser() user: JwtClaims, @Query() pagination: PaginationDto) {
    return this.notifications.list(user.sub, pagination);
  }

  @ApiOperation({
    summary: 'Mark all my notifications read',
    description:
      'Marks every unread notification for the current user as read.',
  })
  @ApiOkResponse({ description: 'Count of updated notifications.' })
  @Patch('notifications/read-all')
  readAll(@CurrentUser() user: JwtClaims) {
    return this.notifications.readAll(user.sub);
  }

  @ApiOperation({
    summary: 'Mark one notification read',
    description: 'Marks a single notification (owned by the user) as read.',
  })
  @ApiParam({ name: 'id', description: 'Notification uuid', format: 'uuid' })
  @ApiOkResponse({ description: 'The updated notification.' })
  @Patch('notifications/:id/read')
  read(@CurrentUser() user: JwtClaims, @Param('id') id: string) {
    return this.notifications.read(user.sub, id);
  }
}
