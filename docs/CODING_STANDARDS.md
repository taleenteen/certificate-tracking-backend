# Coding Standards ("Claude style")

> The goal: any new file should be indistinguishable from the existing ones.
> Before writing, open a neighbouring file in the same module and copy its shape.
> Every rule below is taken from how this codebase is already written — match it.

## 1. Project layout

```
src/
  main.ts                 # bootstrap: helmet, cookieParser, CORS, global pipe/filter
  app.module.ts
  prisma/                 # global PrismaService + PrismaModule (do not move)
  common/                 # cross-cutting only
    guards/  interceptors/  decorators/  filters/  dto/
    auth.types.ts         # JwtClaims, RequestScope
  modules/<feature>/      # one folder per feature
    <feature>.controller.ts
    <feature>.service.ts
    <feature>.module.ts
    <feature>.dto.ts
```

Feature code goes under `src/modules/<feature>/`. Cross-cutting code goes under
`src/common/`. Never put business logic in `src/common`.

## 2. Controllers are thin

Controllers only: declare the route, apply decorators, pull params, and delegate
to the service. **No business logic, no Prisma calls in controllers.**

```ts
@Roles('supervisor')
@Post('inspection-tasks')
createTask(
  @Body() dto: CreateTaskDto,
  @CurrentUser() user: JwtClaims,
  @Req() request: Request,
) {
  return this.inspections.createTask(dto, user, request.scope!);
}
```

- Return the service promise directly (no `await` in the controller).
- Inject the service as `private readonly <plural>: <Feature>Service`
  (e.g. `private readonly inspections: InspectionService`).
- Use `@CurrentUser() user: JwtClaims` for identity, `@Req() request: Request`
  only to reach `request.scope!`.
- `import type { Request } from 'express'` (type-only import).

## 3. Services own all logic and all Prisma access

- Inject `private readonly prisma: PrismaService` and any other services.
- Put shared query fragments in `private` helpers — e.g. `scopedWhere(...)`,
  `ownedReport(...)`, `scopedReport(...)`.
- Return the Prisma promise directly when there's no post-processing.

## 4. Scope and soft-delete are non-negotiable

- Every scoped staff query must filter by agency. Zone assignment was removed
  from the officer workflow on 2026-07-01; do not add `UserZone`, `Zone`, or
  `zoneId` filters back into staff authorization. Build agency filters with
  `satisfies Prisma.<Model>WhereInput`:

  ```ts
  return {
    OR: [
      { license: { licenseType: { agencyId: scope.agencyId } } },
      { licenseId: null },
    ],
  } satisfies Prisma.InspectionTaskWhereInput;
  ```

- On `SystemUser`, `Business`, `License` (soft-delete models) **every** query
  includes `deletedAt: null`. There is no global middleware — it is explicit per
  query by design. Do not forget it.

## 4b. Roles & authorization

Four hierarchical platform roles (`src/common/auth.roles.ts`):
`public(0) < officer(1) < admin(2) < super_admin(3)`.

- `@Roles('officer')` is satisfied by officer **and anything above** —
  `RolesGuard` is rank-based (`satisfiesRole`). Tag the *lowest* role allowed.
- Never write `roles.includes('admin')` in services. Use the helpers:
  `isAdminTier(roles)` (admin or super_admin → null scope, web-portal login),
  `canGrantRole(actor, role)` (only super_admin grants admin/super_admin),
  `canManageUser(actor, target)` (cannot modify an equal/higher-ranked user).
- `ScopeGuard` treats admin tier as unscoped and public-only users as unscoped.
  Any user satisfying `officer` must receive `{ agencyId }` scope, even if the
  roles array also includes `public`.
- Scoped service methods accept `RequestScope | null`; when scope is `null`
  (admin tier) apply **no** agency filter (admins see everything).
- User-management mutations (`create`, `updateRoles`, `updateAgency`,
  `suspend`, `remove`) take the acting `@CurrentUser()` and enforce the
  grant/manage caps in the service.

## 5. Errors

Use Nest HTTP exceptions with short, non-revealing messages:

| Situation | Exception | Status |
|---|---|---|
| Not found / not in scope | `NotFoundException()` | 404 |
| Conflict of interest, duplicate | `ConflictException(msg)` | 409 |
| Scope/role violation | `ForbiddenException(msg)` | 403 |
| Invalid state transition / bad input | `UnprocessableEntityException(msg)` | 422 |
| Bad query param | `BadRequestException(msg)` | 400 |

Auth failures return a **generic** message — never reveal which field failed.
Prefer returning 404 over 403 when revealing existence would leak scope.

## 6. Transactions

Any operation that writes more than one row uses `this.prisma.$transaction`:

```ts
return this.prisma.$transaction(async (tx) => {
  const updated = await tx.inspectionTask.update({ ... });
  await tx.notification.create({ ... });   // notifications belong in the same tx
  return updated;
});
```

Notifications, side-effect license updates, and audit-relevant state changes go
**inside** the transaction with the main write.

## 7. Enums and status

Import enums from `@prisma/client` and reference members:
`TaskStatus.PENDING_REVIEW`, `LicenseStatus.SUSPENDED`, `ReportResult.FAILED`.
Never write the status as a string literal. For membership checks use the
existing pattern `(<TaskStatus[]>[...]).includes(task.status)`.

## 8. JSON, files, ids

- Cast JSON writes: `findings: dto.findings as Prisma.InputJsonValue`.
- Generate ids/keys with `randomUUID()` from `node:crypto`.
- Object keys: `evidence-photos/{reportId}/{uuid}{ext}`; validate MIME against the
  whitelist `['image/jpeg','image/png','application/pdf']` and the 10 MB cap.

## 9. Comments

English only. Three sanctioned tags:

- `// MOCK: replace in UAT` — on every fake/external stub.
- `// DECISION: <why>` — when you make a non-obvious choice the guide didn't cover
  (choose the most secure option).
- `// TODO(schema): <what>` — when you'd need a schema change (never make one).

Otherwise comment only to explain a constraint the code can't show. No narration.

## 10. DTOs and validation

DTOs in `<feature>.dto.ts` using `class-validator`. The global pipe is
`whitelist: true, forbidNonWhitelisted: true, transform: true` — so unknown
fields are rejected automatically; rely on it, don't re-check manually.

## 10b. API documentation (Swagger / OpenAPI)

Interactive docs are served at **`/docs`** (JSON at `/docs-json`), configured in
`src/swagger.ts`. The `@nestjs/swagger` **CLI plugin** is enabled in
`nest-cli.json` (`introspectComments` + `classValidatorShim`), so:

- **DTO/query schemas are generated automatically** from TS types,
  `class-validator` decorators, and JSDoc. Do **not** hand-write `@ApiProperty`
  on request DTO fields — instead add a `/** ... */` JSDoc comment (becomes the
  description) and an `@example` tag where useful. The plugin reads them.
- **Every controller** carries `@ApiTags('<Tag>')`, and `@ApiBearerAuth('access-token')`
  when the routes require auth (omit only on `@Public()` controllers).
- **Every endpoint** carries `@ApiOperation({ summary, description })` plus the
  relevant response decorators: `@ApiOkResponse` / `@ApiCreatedResponse` for
  success (pass `type:` when a response DTO exists), and the error decorators
  that match the service (`@ApiNotFoundResponse`, `@ApiForbiddenResponse`,
  `@ApiConflictResponse`, `@ApiUnprocessableEntityResponse`,
  `@ApiUnauthorizedResponse`).
- `@ApiParam` for every `:id`; `@ApiQuery` for query params not covered by a DTO.
- File uploads: `@ApiConsumes('multipart/form-data')` + an `@ApiBody` schema with
  a `binary` `file` property.
- Responses that return Prisma entities are documented with a `description`;
  typed response DTOs exist for auth (`auth.dto.ts`). When you add a new endpoint,
  annotate it the same way — the plugin won't infer responses for you.

## 11. Imports order

1. `@nestjs/*`
2. `@prisma/client` / third-party
3. node builtins (`crypto`, `path`)
4. internal (`../../common/...`, `../../prisma/...`, `./...`)

## 12. Security invariants (never weaken)

- No `$queryRawUnsafe` — parameterized Prisma only.
- bcrypt cost 12; passwords/tokens/totp never logged or returned (the audit
  interceptor redacts `/password|token|totp|secret/i`).
- RS256 JWT, 15-min TTL, `jti` checked against a non-revoked session.
- MinIO buckets private; serve files only via presigned URL (10-min TTL).
