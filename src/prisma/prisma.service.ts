import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Soft-delete contract: queries on SystemUser, Business, and License must
// explicitly include `deletedAt: null` in the where clause. Prisma 6 removed
// the $use middleware API; the filter is applied per-query throughout the
// codebase rather than globally. See each service for the explicit filters.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
