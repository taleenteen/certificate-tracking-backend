import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { Observable, switchMap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { SKIP_AUDIT_KEY } from '../decorators/skip-audit.decorator';

const sensitive = /password|token|totp|secret|citizenid|citizen_id|citizenId/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        sensitive.test(key) ? '[REDACTED]' : redact(child),
      ]),
    );
  }
  return value;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      switchMap(async (response: unknown) => {
        const body =
          response && typeof response === 'object'
            ? (response as Record<string, unknown>)
            : {};
        const route = request.path;
        // Strip the global 'api' prefix so entityType is the resource segment
        // (e.g. 'inspection-tasks'), not the constant prefix.
        const segments = route.split('/').filter(Boolean);
        const entitySegment = segments[0] === 'api' ? segments[1] : segments[0];
        const action = route.includes('approve')
          ? 'APPROVE'
          : route.includes('return')
            ? 'RETURN'
            : route.includes('suspend')
              ? 'SUSPEND'
              : method === 'POST'
                ? 'CREATE'
                : method === 'DELETE'
                  ? 'DELETE'
                  : 'UPDATE';
        await this.prisma.auditLog.create({
          data: {
            userId: request.user?.sub,
            juristicId: request.juristicContext?.juristicId ?? null,
            action,
            entityType: entitySegment ?? 'unknown',
            entityId:
              typeof body.id === 'string'
                ? body.id
                : Array.isArray(request.params.id)
                  ? request.params.id[0]
                  : request.params.id,
            afterValue: redact(response) as Prisma.InputJsonValue,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          },
        });
        return response;
      }),
    );
  }
}
