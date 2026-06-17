import { defineConfig } from 'prisma/config';

export default defineConfig({
  migrations: {
    seed: 'ts-node -r dotenv/config prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
