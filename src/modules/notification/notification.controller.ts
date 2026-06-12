import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtClaims } from '../../common/auth.types';
import { NotificationService } from './notification.service';

@Controller()
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get('my/notifications')
  list(@CurrentUser() user: JwtClaims, @Query() pagination: PaginationDto) {
    return this.notifications.list(user.sub, pagination);
  }

  @Patch('notifications/read-all')
  readAll(@CurrentUser() user: JwtClaims) {
    return this.notifications.readAll(user.sub);
  }

  @Patch('notifications/:id/read')
  read(@CurrentUser() user: JwtClaims, @Param('id') id: string) {
    return this.notifications.read(user.sub, id);
  }
}
