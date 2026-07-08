import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SessionCleanupService {
  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 * * * *')
  cleanup() {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const deletedSessions = await tx.userSession.deleteMany({
        where: {
          expiresAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      });
      const deletedStates = await tx.dgaOidcState.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }],
        },
      });
      return [deletedSessions, deletedStates] as const;
    });
  }
}
