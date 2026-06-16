import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUIRE_JURISTIC_ROLE_KEY } from '../decorators/require-juristic-role.decorator';

const roleRank: Record<string, number> = { OWNER: 2, ADMIN: 1, MEMBER: 0 };

@Injectable()
export class RequireJuristicRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string>(
      REQUIRE_JURISTIC_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const ctx = request.juristicContext;

    if (!ctx) {
      throw new ForbiddenException('Juristic context required');
    }
    if ((roleRank[ctx.role] ?? -1) < (roleRank[required] ?? 0)) {
      throw new ForbiddenException(`Requires juristic role: ${required}`);
    }
    return true;
  }
}
