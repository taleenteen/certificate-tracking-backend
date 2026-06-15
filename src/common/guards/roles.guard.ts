import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { satisfiesRole } from '../auth.roles';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) {
      return true;
    }
    // Hierarchical: a higher-ranked role satisfies a lower-ranked requirement.
    const userRoles =
      context.switchToHttp().getRequest<Request>().user?.roles ?? [];
    if (!satisfiesRole(userRoles, roles)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
