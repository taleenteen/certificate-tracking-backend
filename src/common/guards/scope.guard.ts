import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class ScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (
      !user ||
      user.roles.includes('admin') ||
      user.roles.includes('public')
    ) {
      request.scope = null;
      return true;
    }
    if (!user.agency) {
      throw new ForbiddenException('Agency scope is required');
    }
    request.scope = { zoneIds: user.zoneIds, agency: user.agency };
    return true;
  }
}
