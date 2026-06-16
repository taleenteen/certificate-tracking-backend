import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Builds the OpenAPI document config (title, description, tags, auth).
 * Exported so `scripts/generate-openapi.ts` can reuse the same config
 * without mounting the UI.
 */
export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('E-License Verification Platform API')
    .setDescription(
      [
        'REST API for the Thai e-licensing platform that plugs into the ทางรัฐ',
        '(Tang Rat) super app. Serves the public app and the admin portal.',
        '',
        '**Authentication.** Most endpoints require a Bearer access token',
        '(RS256 JWT, 15-min TTL). Obtain one from `POST /api/auth/register` or',
        '`POST /api/auth/login` (PUBLIC), `POST /api/auth/tang-rat`',
        '(PUBLIC/INSPECTOR/SUPERVISOR), or `POST /api/auth/self` (ADMIN + TOTP).',
        'Click **Authorize** and paste the `accessToken` to call protected routes.',
        'See `docs/AUTHENTICATION.md` for a plain-English walkthrough.',
        '',
        '**Scope.** INSPECTOR/SUPERVISOR responses are filtered server-side by the',
        "caller's zones and agency; clients cannot widen scope via query params.",
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
        description: 'Paste the access token returned by an /auth login route.',
      },
      'access-token',
    )
    .addTag('Auth', 'Login, token refresh, logout, and password management')
    .addTag('Licenses', 'Public license type, detail, and QR verification')
    .addTag('Businesses', 'Public business search, detail, and map')
    .addTag('My', 'Authenticated user self-service (licenses)')
    .addTag(
      'Juristic',
      'Multi-tenant corporate portal: memberships, context, invites (D6)',
    )
    .addTag(
      'Juristic Requests',
      'Self-service join request flow: search, submit, approve, reject (D7)',
    )
    .addTag('Notifications', 'In-app notifications for the current user')
    .addTag('Inspection', 'Inspection tasks and reports state machine')
    .addTag('Dashboards', 'Role-specific aggregate dashboards')
    .addTag('Users', 'User administration (admin / supervisor)')
    .addTag('Zones', 'Zone master data')
    .addTag('Sync', 'Agency data sync and CSV import')
    .addTag('Audit', 'Audit log listing')
    .addTag('Export', 'PDF/XLSX exports')
    .build();
}

/**
 * Mounts interactive OpenAPI docs at `/docs` (JSON at `/docs-json`).
 *
 * Most property-level schemas are generated automatically by the
 * `@nestjs/swagger` CLI plugin (see `nest-cli.json`) from TypeScript types,
 * `class-validator` decorators, and JSDoc comments. Controllers add the
 * per-endpoint summaries, responses, and auth requirements.
 */
export function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'E-License API Docs',
  });
}
