import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { isAdminTier, satisfiesRole } from '../auth.roles';

@Injectable()
export class ScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user || isAdminTier(user.roles)) {
      request.scope = null;
      return true;
    }
    if (!satisfiesRole(user.roles, ['officer'])) {
      request.scope = null;
      return true;
    }
    if (!user.agencyId) {
      throw new ForbiddenException('Agency scope is required');
    }
    request.scope = { agencyId: user.agencyId };
    return true;
  }
}
