import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  
  try {
    const updated = await prisma.systemUser.update({
      where: { username: 'superadmin' },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
      }
    });
    console.log('Unlocked superadmin:', {
      username: updated.username,
      failedLoginCount: updated.failedLoginCount,
      lockedUntil: updated.lockedUntil,
    });
  } catch (error) {
    console.error('Error unlocking database:', error);
  } finally {
    await pool.end();
  }
}

main();
