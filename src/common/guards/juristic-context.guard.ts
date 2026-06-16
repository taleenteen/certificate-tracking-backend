import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JuristicContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user?.activeJuristicId) {
      request.juristicContext = null;
      return true;
    }

    // Live membership check — revoked membership rejects immediately even with valid token.
    const membership = await this.prisma.juristicMember.findUnique({
      where: {
        juristicPersonId_userId: {
          juristicPersonId: user.activeJuristicId,
          userId: user.sub,
        },
      },
    });

    if (!membership || !membership.isActive) {
      throw new ForbiddenException('Juristic membership has been revoked');
    }

    request.juristicContext = {
      juristicId: user.activeJuristicId,
      role: membership.role,
      userId: user.sub,
    };
    return true;
  }
}
