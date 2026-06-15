/**
 * Generates openapi.json at the project root without starting the HTTP server.
 *
 * Requires the same infra as normal dev (Postgres + MinIO must be up):
 *   docker compose -f docker-compose.infra.yml up -d
 *
 * Run:
 *   npm run swagger:export
 *
 * The output file can be imported into:
 *   - Postman  (Import → OpenAPI)
 *   - Insomnia (Import → From File)
 *   - Kong Gateway  (deck file import)
 *   - AWS API Gateway (Import API)
 *   - Azure API Management (Import from OpenAPI)
 *   - Any other OpenAPI 3.0-compatible portal
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { buildSwaggerConfig } from '../src/swagger';

async function main() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api');

  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());

  const outputPath = resolve(process.cwd(), 'openapi.json');
  writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf-8');
  // eslint-disable-next-line no-console
  console.log(`OpenAPI spec written → ${outputPath}`);

  await app.close();
  process.exit(0);
}

void main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
});
