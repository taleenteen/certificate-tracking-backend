import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JuristicContext } from '../auth.types';

export const JuristicCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JuristicContext | null => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.juristicContext ?? null;
  },
);
