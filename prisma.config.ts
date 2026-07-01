import { defineConfig } from 'prisma/config';

export default defineConfig({
  migrations: {
    seed:
      'node -r dotenv/config -r ts-node/register -e "require(\'./prisma/seed.ts\')"',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
