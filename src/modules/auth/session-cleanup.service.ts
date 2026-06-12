import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SessionCleanupService {
  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 * * * *')
  cleanup() {
    return this.prisma.userSession.deleteMany({
      where: {
        expiresAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    });
  }
}
