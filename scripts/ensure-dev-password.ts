/**
 * Idempotent dev helper — sets a known password on the `public-owner` seed user
 * WITHOUT wiping any other data.  Safe to run at any time in development.
 *
 *   npx ts-node -r dotenv/config scripts/ensure-dev-password.ts
 *   # or via package.json:
 *   npm run dev:fix-login
 */

import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run in production');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const DEV_ACCOUNTS: { username: string; password: string }[] = [
    { username: 'public-owner', password: 'password' },
  ];

  for (const { username, password } of DEV_ACCOUNTS) {
    const user = await prisma.systemUser.findUnique({ where: { username } });
    if (!user) {
      console.log(`⚠  ${username} not found — run prisma db seed first`);
      continue;
    }
    if (user.passwordHash) {
      console.log(`✓  ${username} already has a password — skipping`);
      continue;
    }
    const hash = await bcrypt.hash(password, 12);
    await prisma.systemUser.update({
      where: { username },
      data: { passwordHash: hash },
    });
    console.log(`✓  Set password for ${username}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
