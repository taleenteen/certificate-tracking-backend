import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Soft-delete contract: queries on SystemUser, Business, and License must
// explicitly include `deletedAt: null` in the where clause. Prisma 7 removed
// the $use middleware API; the filter is applied per-query throughout the
// codebase rather than globally. See each service for the explicit filters.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
