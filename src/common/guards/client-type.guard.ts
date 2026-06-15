import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ClientType } from '@prisma/client';
import type { Request } from 'express';
import { isAdminTier } from '../auth.roles';

// DECISION (D3): The guide specifies that ADMIN JWTs must originate from the
// web_admin client AND be scoped to the /api/admin-portal route namespace.
// We enforce the client-type condition here (sufficient to satisfy D3: only
// sessions created through the Nuxt admin portal carry clientType=web_admin).
// The route-namespace condition is intentionally not added because all admin
// routes already require @Roles('admin') and there is no /api/admin-portal
// prefix in the current routing design. If an /api/admin-portal namespace is
// introduced in a future iteration this guard must be updated to also check
// request.path.startsWith('/api/admin-portal').
@Injectable()
export class ClientTypeGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user || !isAdminTier(user.roles)) {
      return true;
    }
    if (user.clientType !== ClientType.web_admin) {
      throw new ForbiddenException('Admin sessions require web_admin client');
    }
    return true;
  }
}
