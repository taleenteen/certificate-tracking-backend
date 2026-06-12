# E-License Verification Platform — AI Implementation Guide

> **PURPOSE OF THIS DOCUMENT**: This is the single source of truth for implementing this project. It is written for an AI coding agent (Claude Sonnet, Gemini, GPT, etc.) to execute without ambiguity. Follow every rule exactly. When this document conflicts with your own judgment, **this document wins**. When something is genuinely not covered, choose the most conservative/secure option and add a `// DECISION:` comment explaining your choice.

---

## 0. HARD RULES (read first, never violate)

1. **ALL data is MOCK.** This is a prototype. Every external API call (ทางรัฐ mToken verify, GDX/ACFS, DBD) must be implemented behind an interface with a `MockProvider` returning realistic fake data. Mark every mock with `// MOCK: replace in UAT`.
2. **Never invent schema fields.** The Prisma schema in §3 is final. If you need a new field, STOP and leave a `TODO(schema)` comment instead.
3. **Status enums are exact strings** as defined in §3. Do not rename, lowercase, or abbreviate.
4. **Locked security decisions** (do not re-debate):
   - D1: Role assignment is **ADMIN (SuperAdmin) only**. SUPERVISOR cannot change roles.
   - D3: ADMIN can **only** log in via the Nuxt web portal (`client_type='web_admin'`, `auth_provider='self'`). Reject ADMIN JWTs originating from the mobile app path.
   - ร.ง.4 (RNG4) licenses **never expire by date**. Non-payment → `SUSPENDED`, never `EXPIRED`.
5. **Every mutating endpoint writes to AUDIT_LOG** (use a NestJS interceptor; see §6.5).
6. **Scope filtering is server-side only.** Never trust client-supplied zone/agency filters. INSPECTOR/SUPERVISOR scope comes from JWT claims injected at login.
7. **No secrets in git.** `.env.example` only. Generate RS256 keys locally.
8. Thai text in UI; English in code/comments/commit messages.

---

## 1. PROJECT CONTEXT

A standalone **e-service** app that plugs into Thailand's **ทางรัฐ (Tang Rat)** super app. It verifies business operating licenses from two agencies:

| Agency | License types | Integration status |
|---|---|---|
| **DIW** (กรมโรงงานอุตสาหกรรม) | `RNG4` (ร.ง.4, no expiry, annual fee), `HAZMAT` (วัตถุอันตราย, 3-year) | API **not ready** → CSV import (mock) |
| **ACFS** (มกอช.) | `ACFS_MANDATORY`, `ACFS_GENERAL`, `ACFS_GAP_HACCP` | GDX connected (mock in prototype) |

### Roles (4)

| Role | Login path | Scope | Summary |
|---|---|---|---|
| `PUBLIC` | mToken (ทางรัฐ) | none (read-only public data) | Search licenses, e-Map, QR scan, "my licenses" via ThaID/DBD |
| `INSPECTOR` | mToken | own zones + own agency | Field officer: receives tasks, inspects, submits reports |
| `SUPERVISOR` | mToken | own zones + own agency | Creates/assigns tasks, reviews reports, manages users *in own agency* (not roles), zones, sync |
| `ADMIN` | username/password + TOTP, **web portal only** | full system | SuperAdmin: creates/suspends SUPERVISOR & INSPECTOR accounts, full audit log, system status |

A user can hold multiple roles (`roles: text[]`), e.g. a SUPERVISOR who also inspects → `['supervisor','inspector']`.

### Task state machine (exact)

```
ASSIGNED → IN_PROGRESS → PENDING_REVIEW → APPROVED
                              ↓
                          RETURNED → (inspector edits) → PENDING_REVIEW
ASSIGNED | IN_PROGRESS → CANCELLED (supervisor only)
```

### Two frontends, one backend

- **`app/`** — Next.js 15 (App Router). Users: PUBLIC, INSPECTOR, SUPERVISOR. Mobile-first (runs inside ทางรัฐ WebView).
- **`admin/`** — **Nuxt 4** (Vue 3, Composition API, `<script setup>`). Users: ADMIN only. Desktop-first.
- **`api/`** — NestJS 10. Single REST API for both frontends.

---

## 2. REPOSITORY LAYOUT (monorepo)

```
elicense/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── nginx/
│   └── nginx.conf
├── api/                      # NestJS 10
│   ├── Dockerfile
│   ├── prisma/
│   │   ├── schema.prisma     # §3 — copy verbatim
│   │   └── seed.ts           # §9
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       ├── common/
│       │   ├── guards/        (jwt-auth.guard.ts, roles.guard.ts, scope.guard.ts, client-type.guard.ts)
│       │   ├── interceptors/  (audit.interceptor.ts)
│       │   ├── decorators/    (roles.decorator.ts, current-user.decorator.ts, skip-audit.decorator.ts)
│       │   ├── filters/       (all-exceptions.filter.ts)
│       │   └── dto/           (pagination.dto.ts)
│       ├── auth/             # §6
│       ├── license/          # §7.2
│       ├── business/         # §7.3
│       ├── inspection/       # §7.4
│       ├── user/             # §7.5
│       ├── zone/             # §7.5
│       ├── notification/     # §7.6
│       ├── sync/             # §7.7
│       ├── export/           # §7.8
│       ├── admin/            # §7.9
│       ├── storage/          # MinIO service wrapper
│       └── external/         # mock providers: tangrat.provider.ts, gdx.provider.ts, dbd.provider.ts
├── app/                      # Next.js 15
│   ├── Dockerfile
│   └── src/app/...           # §8.1
└── admin/                    # Nuxt 4 (Vue 3)
    ├── Dockerfile
    └── ...                   # §8.2
```

---

## 3. PRISMA SCHEMA (FINAL — copy verbatim)

> 17 tables. PostgreSQL 16. All IDs `uuid`. All timestamps `timestamptz`. Soft delete via `deletedAt` where present. Field names in Prisma camelCase map to snake_case columns via `@map`.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ───────────────────────── ENUMS ─────────────────────────

enum TaskStatus {
  ASSIGNED
  IN_PROGRESS
  PENDING_REVIEW
  APPROVED
  RETURNED
  CANCELLED
}

enum LicenseStatus {
  ACTIVE
  SUSPENDED
  EXPIRED
  REVOKED
  PENDING
}

enum ReportResult {
  PASSED
  FAILED
}

enum AuthProvider {
  self
  tang_rat
}

enum ClientType {
  app
  web_admin
}

enum NotificationChannel {
  IN_APP
  LINE
  SMS
}

enum SyncStatus {
  RUNNING
  SUCCESS
  FAILED
}

enum Agency {
  DIW
  ACFS
}

// ───────────────────────── USER / AUTH ─────────────────────────

model SystemUser {
  id                 String    @id @default(uuid()) @db.Uuid
  username           String?   @unique @db.VarChar(50)   // null for tang_rat-only users
  passwordHash       String?   @map("password_hash") @db.VarChar(255) // bcrypt cost 12; null for tang_rat-only
  email              String?   @db.VarChar(150)
  fullName           String    @map("full_name") @db.VarChar(200)
  phone              String?   @db.VarChar(20)
  roles              String[]  @default(["public"])      // values: public|inspector|supervisor|admin
  agency             Agency?                              // null = ADMIN or PUBLIC
  isActive           Boolean   @default(true) @map("is_active")
  juristicPersonId   String?   @map("juristic_person_id") @db.Uuid
  lastLoginAt        DateTime? @map("last_login_at") @db.Timestamptz()
  failedLoginCount   Int       @default(0) @map("failed_login_count")
  lockedUntil        DateTime? @map("locked_until") @db.Timestamptz()
  totpSecret         String?   @map("totp_secret") @db.VarChar(64)    // encrypted at rest
  mustChangePassword Boolean   @default(false) @map("must_change_password")
  deletedAt          DateTime? @map("deleted_at") @db.Timestamptz()
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt          DateTime  @updatedAt @map("updated_at") @db.Timestamptz()

  juristicPerson  JuristicPerson?    @relation(fields: [juristicPersonId], references: [id])
  userZones       UserZone[]
  sessions        UserSession[]
  providerLinks   AuthProviderLink[]
  resetTokens     PasswordResetToken[]
  ownedBusinesses Business[]         @relation("BusinessOwner")
  assignedTasks   InspectionTask[]   @relation("TaskAssignee")
  createdTasks    InspectionTask[]   @relation("TaskCreator")
  reports         InspectionReport[] @relation("ReportInspector")
  reviewedReports InspectionReport[] @relation("ReportReviewer")
  auditLogs       AuditLog[]
  notifications   Notification[]
  syncLogs        SyncLog[]

  @@index([agency])
  @@map("system_users")
}

model Zone {
  id          String    @id @default(uuid()) @db.Uuid
  code        String    @unique @db.VarChar(20)       // e.g. Z-BKK
  nameTh      String    @map("name_th") @db.VarChar(200)
  province    String    @db.VarChar(100)
  boundary    Json?                                    // GeoJSON polygon (mock)
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  userZones  UserZone[]
  businesses Business[]
  tasks      InspectionTask[]

  @@map("zones")
}

model UserZone {
  userId     String   @map("user_id") @db.Uuid
  zoneId     String   @map("zone_id") @db.Uuid
  assignedAt DateTime @default(now()) @map("assigned_at") @db.Timestamptz()

  user SystemUser @relation(fields: [userId], references: [id], onDelete: Cascade)
  zone Zone       @relation(fields: [zoneId], references: [id], onDelete: Cascade)

  @@id([userId, zoneId])
  @@map("user_zones")
}

model UserSession {
  id                String       @id @default(uuid()) @db.Uuid
  userId            String       @map("user_id") @db.Uuid
  refreshTokenHash  String       @unique @map("refresh_token_hash") @db.VarChar(255) // SHA-256
  accessTokenJti    String       @unique @default(uuid()) @map("access_token_jti") @db.Uuid
  authProvider      AuthProvider @map("auth_provider")
  clientType        ClientType   @default(app) @map("client_type")
  tangRatSub        String?      @map("tang_rat_sub") @db.VarChar(200)
  tangRatToken      String?      @map("tang_rat_token") @db.Text   // AES-256 encrypted; MOCK in prototype
  ipAddress         String?      @map("ip_address") @db.VarChar(45)
  userAgent         String?      @map("user_agent") @db.Text
  deviceFingerprint String?      @map("device_fingerprint") @db.VarChar(255)
  expiresAt         DateTime     @map("expires_at") @db.Timestamptz()
  lastUsedAt        DateTime     @default(now()) @map("last_used_at") @db.Timestamptz()
  isRevoked         Boolean      @default(false) @map("is_revoked")
  revokedAt         DateTime?    @map("revoked_at") @db.Timestamptz()
  revokeReason      String?      @map("revoke_reason") @db.VarChar(50) // LOGOUT|FORCED|EXPIRED|SUSPICIOUS|ROTATED
  createdAt         DateTime     @default(now()) @map("created_at") @db.Timestamptz()

  user SystemUser @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRevoked])
  @@map("user_sessions")
}

model AuthProviderLink {
  id            String       @id @default(uuid()) @db.Uuid
  userId        String       @map("user_id") @db.Uuid
  provider      AuthProvider
  providerSub   String       @map("provider_sub") @db.VarChar(200)
  providerEmail String?      @map("provider_email") @db.VarChar(150)
  providerName  String?      @map("provider_name") @db.VarChar(200)
  linkedAt      DateTime     @default(now()) @map("linked_at") @db.Timestamptz()
  lastLoginAt   DateTime?    @map("last_login_at") @db.Timestamptz()
  isActive      Boolean      @default(true) @map("is_active")

  user SystemUser @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerSub])
  @@index([userId])
  @@map("auth_provider_links")
}

model PasswordResetToken {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  tokenHash String    @unique @map("token_hash") @db.VarChar(255)
  expiresAt DateTime  @map("expires_at") @db.Timestamptz()
  usedAt    DateTime? @map("used_at") @db.Timestamptz()
  ipAddress String?   @map("ip_address") @db.VarChar(45)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  user SystemUser @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("password_reset_tokens")
}

// ───────────────────────── BUSINESS / LICENSE ─────────────────────────

model JuristicPerson {
  id             String    @id @default(uuid()) @db.Uuid
  registrationId String    @unique @map("registration_id") @db.VarChar(20) // DBD เลขทะเบียนนิติบุคคล
  nameTh         String    @map("name_th") @db.VarChar(300)
  nameEn         String?   @map("name_en") @db.VarChar(300)
  juristicType   String?   @map("juristic_type") @db.VarChar(50)
  address        String?   @db.Text
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  users      SystemUser[]
  businesses Business[]

  @@map("juristic_persons")
}

model Business {
  id               String    @id @default(uuid()) @db.Uuid
  nameTh           String    @map("name_th") @db.VarChar(300)
  juristicPersonId String?   @map("juristic_person_id") @db.Uuid
  ownerUserId      String?   @map("owner_user_id") @db.Uuid   // conflict-of-interest check
  zoneId           String    @map("zone_id") @db.Uuid
  address          String    @db.Text
  province         String    @db.VarChar(100)
  latitude         Decimal?  @db.Decimal(9, 6)                 // MOCK coords in seed
  longitude        Decimal?  @db.Decimal(9, 6)
  geocodedAt       DateTime? @map("geocoded_at") @db.Timestamptz()
  phone            String?   @db.VarChar(20)
  deletedAt        DateTime? @map("deleted_at") @db.Timestamptz()
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt        DateTime  @updatedAt @map("updated_at") @db.Timestamptz()

  juristicPerson JuristicPerson? @relation(fields: [juristicPersonId], references: [id])
  owner          SystemUser?     @relation("BusinessOwner", fields: [ownerUserId], references: [id])
  zone           Zone            @relation(fields: [zoneId], references: [id])
  licenses       License[]
  tasks          InspectionTask[]

  @@index([zoneId])
  @@index([province])
  @@map("businesses")
}

model LicenseType {
  id                     String   @id @default(uuid()) @db.Uuid
  code                   String   @unique @db.VarChar(20)   // RNG4|HAZMAT|ACFS_MANDATORY|ACFS_GENERAL|ACFS_GAP_HACCP
  nameTh                 String   @map("name_th") @db.VarChar(200)
  nameEn                 String?  @map("name_en") @db.VarChar(200)
  agency                 Agency
  validityYears          Int      @default(1) @map("validity_years")  // RNG4: ignored (no expiry)
  feeThb                 Decimal? @map("fee_thb") @db.Decimal(10, 2)
  renewalFeeThb          Decimal? @map("renewal_fee_thb") @db.Decimal(10, 2)
  requiresInspection     Boolean  @default(true) @map("requires_inspection")
  suspendedOnNonpayment  Boolean  @default(false) @map("suspended_on_nonpayment") // true for RNG4
  requiredDocuments      Json?    @map("required_documents")  // [{code,name,required}]
  prerequisiteTypeIds    String[] @map("prerequisite_type_ids") @db.Uuid
  description            String?  @db.Text
  isActive               Boolean  @default(true) @map("is_active")

  licenses           License[]
  checklistTemplates ChecklistTemplate[]

  @@map("license_types")
}

model License {
  id               String        @id @default(uuid()) @db.Uuid
  licenseNo        String        @unique @map("license_no") @db.VarChar(50)
  businessId       String        @map("business_id") @db.Uuid
  licenseTypeId    String        @map("license_type_id") @db.Uuid
  status           LicenseStatus @default(ACTIVE)
  issueDate        DateTime      @map("issue_date") @db.Date
  expireDate       DateTime?     @map("expire_date") @db.Date   // NULL for RNG4 (never expires by date)
  suspendedAt      DateTime?     @map("suspended_at") @db.Timestamptz()
  suspensionReason String?       @map("suspension_reason") @db.Text
  renewedFromId    String?       @map("renewed_from_id") @db.Uuid // renewal chain
  deletedAt        DateTime?     @map("deleted_at") @db.Timestamptz()
  createdAt        DateTime      @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt        DateTime      @updatedAt @map("updated_at") @db.Timestamptz()

  business    Business     @relation(fields: [businessId], references: [id])
  licenseType LicenseType  @relation(fields: [licenseTypeId], references: [id])
  renewedFrom License?     @relation("RenewalChain", fields: [renewedFromId], references: [id])
  renewals    License[]    @relation("RenewalChain")
  documents   LicenseDocument[]
  tasks       InspectionTask[]

  @@index([businessId])
  @@index([licenseTypeId])
  @@index([status, expireDate])
  @@map("licenses")
}

model LicenseDocument {
  id                 String    @id @default(uuid()) @db.Uuid
  licenseId          String?   @map("license_id") @db.Uuid
  inspectionReportId String?   @map("inspection_report_id") @db.Uuid // evidence photos
  docType            String    @map("doc_type") @db.VarChar(30)
  // doc_type values: certified_image | license_pdf | evidence_photo | inspection_form | other
  fileName           String    @map("file_name") @db.VarChar(255)
  objectKey          String    @map("object_key") @db.VarChar(500)   // MinIO key
  mimeType           String    @map("mime_type") @db.VarChar(100)
  fileSizeBytes      Int       @map("file_size_bytes")
  uploadedBy         String?   @map("uploaded_by") @db.Uuid
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  license          License?          @relation(fields: [licenseId], references: [id])
  inspectionReport InspectionReport? @relation(fields: [inspectionReportId], references: [id])

  @@index([licenseId])
  @@index([inspectionReportId])
  @@map("license_documents")
}

// ───────────────────────── INSPECTION ─────────────────────────

model ChecklistTemplate {
  id            String   @id @default(uuid()) @db.Uuid
  licenseTypeId String   @map("license_type_id") @db.Uuid
  version       Int      @default(1)
  nameTh        String   @map("name_th") @db.VarChar(200)
  items         Json     // [{no, question_th, weight, required}]
  passingScore  Int      @default(70) @map("passing_score")
  isActive      Boolean  @default(true) @map("is_active")
  createdBy     String?  @map("created_by") @db.Uuid
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz()

  licenseType LicenseType @relation(fields: [licenseTypeId], references: [id])
  reports     InspectionReport[]

  @@unique([licenseTypeId, version])
  @@map("checklist_templates")
}

model InspectionTask {
  id           String     @id @default(uuid()) @db.Uuid
  taskNo       String     @unique @map("task_no") @db.VarChar(30)  // T-2026-0001
  businessId   String     @map("business_id") @db.Uuid
  licenseId    String?    @map("license_id") @db.Uuid
  zoneId       String     @map("zone_id") @db.Uuid
  assignedTo   String     @map("assigned_to") @db.Uuid
  createdBy    String     @map("created_by") @db.Uuid
  status       TaskStatus @default(ASSIGNED)
  dueDate      DateTime?  @map("due_date") @db.Date
  startedAt    DateTime?  @map("started_at") @db.Timestamptz()
  completedAt  DateTime?  @map("completed_at") @db.Timestamptz()
  cancelReason String?    @map("cancel_reason") @db.Text
  createdAt    DateTime   @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt    DateTime   @updatedAt @map("updated_at") @db.Timestamptz()

  business Business    @relation(fields: [businessId], references: [id])
  license  License?    @relation(fields: [licenseId], references: [id])
  zone     Zone        @relation(fields: [zoneId], references: [id])
  assignee SystemUser  @relation("TaskAssignee", fields: [assignedTo], references: [id])
  creator  SystemUser  @relation("TaskCreator", fields: [createdBy], references: [id])
  reports  InspectionReport[]

  @@index([assignedTo, status])
  @@index([zoneId, status])
  @@map("inspection_tasks")
}

model InspectionReport {
  id                  String        @id @default(uuid()) @db.Uuid
  taskId              String        @map("task_id") @db.Uuid
  inspectorId         String        @map("inspector_id") @db.Uuid
  checklistTemplateId String?       @map("checklist_template_id") @db.Uuid
  result              ReportResult?
  score               Int?
  findings            Json?         // checklist answers [{no, answer, note}]
  summaryNote         String?       @map("summary_note") @db.Text
  isDraft             Boolean       @default(true) @map("is_draft")
  submittedAt         DateTime?     @map("submitted_at") @db.Timestamptz()
  reviewComment       String?       @map("review_comment") @db.Text       // supervisor return reason
  reviewedBy          String?       @map("reviewed_by") @db.Uuid
  reviewedAt          DateTime?     @map("reviewed_at") @db.Timestamptz()
  pdfObjectKey        String?       @map("pdf_object_key") @db.VarChar(500)
  createdAt           DateTime      @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt           DateTime      @updatedAt @map("updated_at") @db.Timestamptz()

  task              InspectionTask     @relation(fields: [taskId], references: [id])
  inspector         SystemUser         @relation("ReportInspector", fields: [inspectorId], references: [id])
  reviewer          SystemUser?        @relation("ReportReviewer", fields: [reviewedBy], references: [id])
  checklistTemplate ChecklistTemplate? @relation(fields: [checklistTemplateId], references: [id])
  documents         LicenseDocument[]

  @@index([taskId])
  @@map("inspection_reports")
}

// ───────────────────────── SUPPORT ─────────────────────────

model Notification {
  id          String              @id @default(uuid()) @db.Uuid
  recipientId String              @map("recipient_id") @db.Uuid
  channel     NotificationChannel @default(IN_APP)
  type        String              @db.VarChar(40) // TASK_ASSIGNED|REPORT_RETURNED|REPORT_APPROVED|LICENSE_EXPIRING|LICENSE_EXPIRED|LICENSE_SUSPENDED
  titleTh     String              @map("title_th") @db.VarChar(200)
  bodyTh      String              @map("body_th") @db.Text
  refType     String?             @map("ref_type") @db.VarChar(40)  // entity table name
  refId       String?             @map("ref_id") @db.Uuid
  isRead      Boolean             @default(false) @map("is_read")
  readAt      DateTime?           @map("read_at") @db.Timestamptz()
  createdAt   DateTime            @default(now()) @map("created_at") @db.Timestamptz()

  recipient SystemUser @relation(fields: [recipientId], references: [id], onDelete: Cascade)

  @@index([recipientId, isRead])
  @@map("notifications")
}

model AuditLog {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String?  @map("user_id") @db.Uuid
  action      String   @db.VarChar(30)  // LOGIN|LOGOUT|CREATE|UPDATE|DELETE|APPROVE|RETURN|EXPORT|SYNC|CSV_IMPORT|SUSPEND
  entityType  String   @map("entity_type") @db.VarChar(50)
  entityId    String?  @map("entity_id") @db.Uuid
  beforeValue Json?    @map("before_value")
  afterValue  Json?    @map("after_value")
  ipAddress   String?  @map("ip_address") @db.VarChar(45)
  userAgent   String?  @map("user_agent") @db.Text
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz()

  user SystemUser? @relation(fields: [userId], references: [id])

  @@index([userId, createdAt])
  @@index([entityType, entityId])
  @@map("audit_logs")
}

model SyncLog {
  id             String     @id @default(uuid()) @db.Uuid
  agency         Agency
  triggeredBy    String?    @map("triggered_by") @db.Uuid
  status         SyncStatus @default(RUNNING)
  recordsUpdated Int        @default(0) @map("records_updated")
  startedAt      DateTime   @default(now()) @map("started_at") @db.Timestamptz()
  finishedAt     DateTime?  @map("finished_at") @db.Timestamptz()
  errorMessage   String?    @map("error_message") @db.Text

  triggerUser SystemUser? @relation(fields: [triggeredBy], references: [id])

  @@index([agency, startedAt])
  @@map("sync_logs")
}
```

---

## 4. AUTH SPECIFICATION

### 4.1 mToken flow (PUBLIC / INSPECTOR / SUPERVISOR)

```
POST /api/auth/tang-rat   body: { mToken: string }
```

1. Call `TangRatProvider.verify(mToken)` → returns `{ sub, fullName, email?, phone? }`.
   - **MOCK**: provider returns deterministic fake data keyed by mToken string (so seeded users can log in: mToken `"mock-inspector-1"` → seeded inspector's sub).
2. `AuthProviderLink` lookup by `(provider='tang_rat', providerSub=sub)`.
3. Found → load user. Not found → create `SystemUser` (`roles=['public']`, no password) + link. Auto-promotion to juristic features happens at "my licenses" time, not at login.
4. Reject if `isActive=false` or `deletedAt != null`.
5. Build JWT claims: `{ sub: userId, jti, roles, agency, zoneIds: string[] }` — `zoneIds` loaded from `UserZone`. RS256, **15 min** TTL.
6. Generate opaque refresh token: 64 random bytes hex. Store **SHA-256 hash** in `UserSession` (`authProvider='tang_rat'`, `clientType='app'`, `expiresAt = now + 7d`).
7. Response: `{ accessToken, refreshToken, user: { id, fullName, roles, agency } }`.
8. AuditLog `LOGIN`.

### 4.2 Self login (ADMIN only — admin portal)

```
POST /api/auth/self   body: { username, password, totpCode }
```

1. Lockout check: `lockedUntil > now()` → 423 Locked.
2. bcrypt compare (cost 12). Fail → `failedLoginCount++`; at 5 → `lockedUntil = now + 15min`; return generic 401 ("invalid credentials" — never reveal which field failed).
3. TOTP verify (`otplib`, window 1). **MOCK**: seed users use secret `JBSWY3DPEHPK3PXP`; accept code `"000000"` in `NODE_ENV=development` only.
4. Reset `failedLoginCount=0`. Session: `authProvider='self'`, `clientType='web_admin'`.
5. If `mustChangePassword=true` → return `{ requiresPasswordChange: true, tempToken }` (tempToken: 5 min JWT with single claim `pwc=true`, only valid on `POST /api/auth/change-password`).
6. JWT claims: `{ sub, jti, roles:['admin'], agency:null, zoneIds:[] }`.

### 4.3 Refresh rotation

```
POST /api/auth/refresh   body: { refreshToken }
```

1. Hash incoming token → find session. Not found → 401.
2. If session `isRevoked=true` → **token reuse attack**: revoke ALL sessions of that user (`revokeReason='SUSPICIOUS'`), AuditLog, return 401.
3. If `expiresAt < now()` → 401.
4. Rotate: mark old session `isRevoked=true, revokeReason='ROTATED'`; create new session (same provider/clientType); issue new access + refresh tokens.

### 4.4 Guards (NestJS, applied in this order)

| Guard | Behavior |
|---|---|
| `JwtAuthGuard` | Verify RS256 signature + expiry; check `jti` exists in a non-revoked session (1 indexed query); attach `req.user = claims`. |
| `ClientTypeGuard` | If `roles` includes `admin` and route is not under `/api/admin-portal` namespace **or** session `clientType != 'web_admin'` → 403. (Enforces D3.) |
| `RolesGuard` | `@Roles('supervisor')` decorator check against `req.user.roles`. |
| `ScopeGuard` | For INSPECTOR/SUPERVISOR: attach `req.scope = { zoneIds, agency }`. Services MUST apply: `zoneId IN scope.zoneIds` and license-type `agency = scope.agency` on every scoped query. PUBLIC/ADMIN → `req.scope = null` (no filter). |

### 4.5 Audit interceptor

Global interceptor on POST/PUT/PATCH/DELETE. Skips routes tagged `@SkipAudit()` (e.g. `/auth/refresh`). Writes `AuditLog` after handler success: `{ userId, action (mapped from method+route), entityType, entityId (from response), afterValue (response body, redact tokens/passwords) }`. Read endpoints log only `EXPORT`.

---

## 5. API ENDPOINTS (full contract)

> All routes prefixed `/api`. Pagination: `?page=1&limit=20` → `{ data, meta: { page, limit, total } }`. Errors: `{ statusCode, message, error }` (NestJS default). Validation: `class-validator` DTOs; reject unknown fields (`whitelist: true, forbidNonWhitelisted: true`).

### 5.1 Auth
| Method | Route | Roles | Notes |
|---|---|---|---|
| POST | `/auth/tang-rat` | public | §4.1 |
| POST | `/auth/self` | public | §4.2; rate-limit 10/min/IP |
| POST | `/auth/refresh` | public | §4.3 |
| POST | `/auth/logout` | any | revoke current session (`revokeReason='LOGOUT'`) |
| POST | `/auth/change-password` | tempToken or any self user | bcrypt new hash; revoke all other sessions |
| POST | `/auth/forgot-password` | public | rate-limit 3/hour/user; create PasswordResetToken (15 min); MOCK: log link to console |
| POST | `/auth/reset-password` | public | single-use token check |

### 5.2 License & public search (no auth needed unless noted)
| Method | Route | Roles | Notes |
|---|---|---|---|
| GET | `/license-types` | public | master data |
| GET | `/businesses` | public | `?q=&province=&page=` — ILIKE search on nameTh |
| GET | `/businesses/:id` | public | include active licenses |
| GET | `/businesses/map` | public | `?province=&typeCode=&status=` → GeoJSON FeatureCollection `{ id, nameTh, lat, lng, licenseStatus }`; exclude rows with null coords |
| GET | `/licenses/:id` | public | include type, business, documents (presigned URLs, 10 min TTL) |
| GET | `/licenses/:id/qr-verify` | public | same as above, minimal payload; rate-limit 60/min/IP |
| GET | `/my/licenses` | any authed | `?mode=personal\|juristic`; personal: `business.ownerUserId=me`; juristic: `DbdProvider.lookup(citizenSub)` → MOCK → match `JuristicPerson.registrationId` → licenses; 404 body `{ found:false }` if no juristic match |
| GET | `/my/notifications` | any authed | paginated, newest first |
| PATCH | `/notifications/:id/read` | any authed | own only |
| PATCH | `/notifications/read-all` | any authed | own only |

### 5.3 Inspection
| Method | Route | Roles | Notes |
|---|---|---|---|
| GET | `/inspection-tasks` | inspector, supervisor | inspector: `assignedTo=me`; supervisor: zone+agency scope; `?status=` filter |
| GET | `/inspection-tasks/:id` | inspector(own), supervisor(scope) | include business, license, latest report |
| POST | `/inspection-tasks` | supervisor | body `{ businessId, licenseId?, assignedTo, dueDate? }`. **Conflict-of-interest: reject if `assignee.id == business.ownerUserId` (409)**. Assignee must hold `inspector` role, share ≥1 zone with the business zone, same agency. taskNo: `T-YYYY-NNNN` sequential. Notify assignee (`TASK_ASSIGNED`). |
| PATCH | `/inspection-tasks/:id/start` | inspector (assignee only) | ASSIGNED→IN_PROGRESS; set `startedAt`; create draft report if none |
| PATCH | `/inspection-tasks/:id/cancel` | supervisor (scope) | only from ASSIGNED/IN_PROGRESS; body `{ reason }` |
| PUT | `/inspection-reports/:id` | inspector (owner) | only when `isDraft=true` OR task status RETURNED; body `{ result, score, findings, summaryNote, checklistTemplateId }` |
| POST | `/inspection-reports/:id/evidence` | inspector (owner) | multipart; max 10 MB; mime whitelist `image/jpeg,image/png,application/pdf`; → MinIO `evidence-photos/{reportId}/{uuid}.{ext}` → LicenseDocument(`docType='evidence_photo'`) |
| DELETE | `/inspection-reports/:id/evidence/:docId` | inspector (owner) | draft/RETURNED only |
| PATCH | `/inspection-reports/:id/submit` | inspector (owner) | require `result` non-null; set `isDraft=false, submittedAt`; task→PENDING_REVIEW; notify supervisors in zone+agency |
| PATCH | `/inspection-reports/:id/approve` | supervisor (scope) | task→APPROVED, `completedAt`; **side effect**: if `result=FAILED` → license `status=SUSPENDED, suspendedAt, suspensionReason='Failed inspection {taskNo}'`; if PASSED and license was SUSPENDED → `ACTIVE`. Notify inspector. |
| PATCH | `/inspection-reports/:id/return` | supervisor (scope) | body `{ reviewComment }` (required); task→RETURNED; notify inspector (`REPORT_RETURNED`) |

### 5.4 Dashboards
| Method | Route | Roles | Payload |
|---|---|---|---|
| GET | `/dashboard/inspector` | inspector | `{ pendingTasks, inProgress, returnedToFix, completedThisMonth, recentTasks[5] }` |
| GET | `/dashboard/supervisor` | supervisor | `{ zoneSummary[], pendingReviewCount, taskCountsByStatus, complianceRate }` — complianceRate = APPROVED÷(APPROVED+CANCELLED+RETURNED-resubmitted) per zone; simple ratio acceptable in prototype, comment the formula |
| GET | `/dashboard/admin` | admin | `{ userCounts byRole, zoneCount, licenseCounts byStatus, lastSync per agency }` |

### 5.5 User / Zone management
| Method | Route | Roles | Notes |
|---|---|---|---|
| GET | `/users` | supervisor(scope: own agency only), admin(all) | `?role=&zoneId=&status=&q=` |
| POST | `/users` | **admin only** | create SUPERVISOR/INSPECTOR; generate temp password; `mustChangePassword=true` if self-login user; for mToken users create with placeholder providerSub (MOCK) |
| PATCH | `/users/:id/roles` | **admin only** (D1) | body `{ roles: string[] }` |
| PATCH | `/users/:id/agency` | supervisor (same-agency only) or admin | supervisor: `req.user.agency === target.agency` else 403 |
| POST | `/users/:id/zones` | supervisor (own zones only) or admin | replace UserZone set |
| PATCH | `/users/:id/suspend` | admin | `isActive=false`; revoke all sessions |
| DELETE | `/users/:id` | admin | soft delete + revoke sessions; confirm handled client-side |
| GET/POST/PUT | `/zones` | supervisor(read own), admin(all) | CRUD; supervisor cannot create |

### 5.6 Sync / Audit / Export
| Method | Route | Roles | Notes |
|---|---|---|---|
| POST | `/sync/trigger?agency=ACFS` | supervisor(own agency), admin | create SyncLog RUNNING → `GdxProvider.fetchAcfsLicenses()` (MOCK: returns 5 fake records) → upsert by licenseNo → SUCCESS + recordsUpdated. Rate-limit 1/5min/agency. |
| POST | `/sync/import/diw` | admin | multipart CSV; columns: `license_no,business_name,type_code,issue_date,status`; validate then upsert; SyncLog action via `CSV_IMPORT` audit |
| GET | `/sync/status` | supervisor, admin | latest SyncLog per agency |
| GET | `/audit-logs` | supervisor(scope), admin(all) | `?userId=&entityType=&dateFrom=&dateTo=` |
| GET | `/audit-logs/export?format=pdf\|xlsx` | admin | stream file |
| GET | `/inspection-reports/:id/export?format=pdf\|xlsx` | supervisor(scope), admin | pdf: Puppeteer renders internal HTML template → MinIO → presigned URL; xlsx: `xlsx` package stream |

---

## 6. CRON JOBS (`@nestjs/schedule`)

```ts
// api/src/license/license.cron.ts
@Cron('0 8 * * *', { timeZone: 'Asia/Bangkok' })  // daily 08:00 ICT
async licenseExpiryCheck() {
  // 1. expiring in exactly 90 / 30 days (expireDate IS NOT NULL — RNG4 excluded automatically)
  //    → Notification LICENSE_EXPIRING to business.ownerUserId (if set)
  //    → at 30 days also notify inspectors holding the business zone
  // 2. expireDate < today AND status=ACTIVE → status=EXPIRED + notify supervisors (zone+agency)
  // 3. Deduplicate: skip if same-type notification for same license sent within 7 days
}

@Cron('30 8 * * *', { timeZone: 'Asia/Bangkok' })
async rng4FeeCheck() {
  // MOCK: prototype has no fee-payment table.
  // Read licenses where licenseType.suspendedOnNonpayment=true.
  // MOCK rule: licenses seeded with suspensionReason='MOCK_OVERDUE' get status=SUSPENDED + suspendedAt.
  // TODO(schema): LICENSE_FEE_PAYMENT table in Phase 2.
}
```

Session cleanup: hourly cron deletes sessions `expiresAt < now() - 30d`.

---

## 7. FRONTEND SPECS

### 7.1 `app/` — Next.js 15 (App Router)

- TypeScript strict. TailwindCSS. `next-intl` not required (Thai only).
- State: React Query (TanStack) for server state; zustand for auth store only.
- Auth: store access token in memory (zustand); refresh token in `httpOnly` cookie set by API (`SameSite=Lax, Secure`). Axios interceptor: on 401 → call `/auth/refresh` once → retry → else redirect to login.
- mToken entry: route `/auth/callback?mtoken=...` → POST `/auth/tang-rat` → role-based redirect: public→`/`, inspector→`/dashboard`, supervisor→`/supervisor/dashboard`.
- **MOCK login page** `/dev-login` (only when `NEXT_PUBLIC_ENV=development`): buttons "Login as Public / Inspector 1 / Supervisor DIW" that post fixed mock mTokens.

Routes:
```
/                       3 tabs: ตรวจสอบใบอนุญาต | e-Map | ใบอนุญาตของฉัน
/search                 text search + QR scan button (html5-qrcode lib)
/map                    Mapbox GL JS; cluster layer; filter drawer (province/type/status);
                        pin popup → link /businesses/[id]; "นำทาง" button →
                        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`)
/businesses/[id]        business detail + licenses list
/licenses/[id]          license detail + status badge + documents (presigned)
/my                     personal|juristic toggle; juristic not-found state
/notifications          list + read-all
/dashboard              INSPECTOR home (guard: role)
/tasks/[id]             task detail + start button
/tasks/[id]/report      report form: checklist (from template items), PASSED/FAILED,
                        photo upload (max 10MB each), submit
/supervisor/dashboard   stats + compliance rate
/supervisor/tasks       list + /create (assignee dropdown excludes business owner — also enforced server-side)
/supervisor/reports     PENDING_REVIEW queue; [id]/review → approve / return+comment modal
/supervisor/manage      users (agency-scoped), zones
```

Mapbox: `NEXT_PUBLIC_MAPBOX_TOKEN`; init map only client-side (`'use client'` + dynamic import, `ssr:false`).

### 7.2 `admin/` — Nuxt 4 (Vue 3)

- `<script setup lang="ts">` everywhere. Pinia for auth store. Nuxt server routes NOT used for API (talk directly to NestJS).
- UI lib: PrimeVue 4 (DataTable fits admin CRUD) or Nuxt UI — pick one, stay consistent.
- Auth: same token strategy as app. Route middleware `auth.global.ts`: no token → `/login`; token without `admin` role → logout + error.
- Layout: left sidebar (per user requirement): Dashboard | จัดการ Admin | รายชื่อ Admin | Audit Log | System Status. Sidebar items render by role detection (future-proof even though only ADMIN uses this portal).

Routes:
```
/login                  username+password+totp; must-change-password interstitial
/dashboard              cards: users by role, zones, licenses by status, sync per agency
/admins                 DataTable: filter role/zone/status/q; row → /admins/[id]
/admins/create          form; on success show temp password ONCE (copy button)
/admins/[id]            detail; suspend/unsuspend; delete (confirm dialog typed-name pattern)
/audit-log              DataTable + date range + user filter; export buttons
/system                 sync status per agency; trigger ACFS sync; DIW CSV upload dropzone
```

---

## 8. DOCKER (optimized)

### 8.1 docker-compose.yml (dev)

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: elicense
      POSTGRES_USER: elicense
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U elicense"], interval: 5s, retries: 10 }

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    volumes: [miniodata:/data]
    healthcheck: { test: ["CMD", "mc", "ready", "local"], interval: 10s, retries: 5 }

  api:
    build: { context: ./api, target: development }
    env_file: .env
    depends_on: { db: { condition: service_healthy }, minio: { condition: service_healthy } }
    volumes: [./api:/usr/src/app, /usr/src/app/node_modules]

  app:
    build: { context: ./app, target: development }
    environment: { NEXT_PUBLIC_API_URL: http://localhost/api }
    volumes: [./app:/usr/src/app, /usr/src/app/node_modules]

  admin:
    build: { context: ./admin, target: development }
    volumes: [./admin:/usr/src/app, /usr/src/app/node_modules]

  nginx:
    image: nginx:1.24-alpine
    ports: ["80:80"]
    volumes: [./nginx/nginx.conf:/etc/nginx/nginx.conf:ro]
    depends_on: [api, app, admin]

volumes: { pgdata: {}, miniodata: {} }
```

**No service except nginx publishes ports in prod.** Dev may expose 5432/9001 for tooling — remove in `docker-compose.prod.yml`.

### 8.2 API Dockerfile (multi-stage pattern — replicate idea for app/admin)

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /usr/src/app

FROM base AS development
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
CMD ["npm", "run", "start:dev"]

FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:20-alpine AS production
WORKDIR /usr/src/app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=app:app /usr/src/app/dist ./dist
COPY --from=build --chown=app:app /usr/src/app/prisma ./prisma
USER app
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

Rules: alpine images, multi-stage, non-root user, `npm ci` (never `npm install`), `.dockerignore` includes `node_modules,.git,.env,dist`.

### 8.3 nginx.conf essentials

```nginx
# rate limit zones
limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;
limit_req_zone $binary_remote_addr zone=qr:10m   rate=60r/m;

server {
  listen 80;
  client_max_body_size 12m;

  # security headers
  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options DENY always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;

  location /api/auth/ { limit_req zone=auth burst=5 nodelay; proxy_pass http://api:3001; }
  location ~ ^/api/licenses/.+/qr-verify { limit_req zone=qr burst=20 nodelay; proxy_pass http://api:3001; }
  location /api/    { proxy_pass http://api:3001; }
  location /admin   { proxy_pass http://admin:3002; }
  location /        { proxy_pass http://app:3000; }
  # standard proxy headers (Host, X-Real-IP, X-Forwarded-For/Proto) on every proxy_pass block
}
```

---

## 9. SEED DATA (`api/prisma/seed.ts`) — ALL MOCK

Seed order (FK-safe): LicenseType → Zone → SystemUser → UserZone → JuristicPerson → Business → License → ChecklistTemplate → InspectionTask → InspectionReport → AuthProviderLink → Notification (optional) → SyncLog.

| Entity | Spec |
|---|---|
| LicenseType (5) | `RNG4` (DIW, suspendedOnNonpayment=true, validityYears ignored, feeThb 500/yr), `HAZMAT` (DIW, 3y), `ACFS_MANDATORY` (1y), `ACFS_GENERAL` (1y), `ACFS_GAP_HACCP` (3y) |
| Zone (6) | BKK, Chiang Mai, Chonburi, Khon Kaen, Songkhla, Nakhon Ratchasima — codes `Z-BKK`… mock GeoJSON rectangle boundary |
| SystemUser (8) | 1 ADMIN (`username=superadmin`, temp password printed at seed, `mustChangePassword=true`, TOTP secret `JBSWY3DPEHPK3PXP`); 2 SUPERVISOR (`roles=['supervisor','inspector']`, agency DIW / ACFS); 4 INSPECTOR (2 per agency, 1–2 zones each); 1 PUBLIC user who owns a business (for conflict-of-interest test) |
| AuthProviderLink | every non-admin user gets `providerSub = 'mock-sub-{username}'`; mTokens `mock-inspector-1` etc. map to these in TangRatProvider |
| Business (20) | distributed across 6 zones; mock lat/lng inside each province (hardcode realistic coords); 1 business has `ownerUserId` = the PUBLIC user |
| License (30) | cover all 5 types; mix: 20 ACTIVE / 4 SUSPENDED (1 RNG4 with `suspensionReason='MOCK_OVERDUE'`) / 4 EXPIRED / 2 expiring within 30 days (for cron demo); **every RNG4 row: `expireDate=null`** |
| ChecklistTemplate (2) | DIW factory checklist (8 items), ACFS GAP checklist (6 items); weights sum 100; passingScore 70 |
| InspectionTask (10) | states: 3 ASSIGNED, 2 IN_PROGRESS, 2 PENDING_REVIEW (with submitted reports), 2 APPROVED, 1 RETURNED (report has reviewComment) |
| SyncLog (2) | ACFS SUCCESS yesterday (recordsUpdated 5); DIW FAILED with errorMessage 'DIW API not available — use CSV import' |

Print seeded credentials to console at end of seed. Never seed in production (`if (process.env.NODE_ENV === 'production') throw`).

---

## 10. SECURITY CHECKLIST (verify before calling any phase done)

- [ ] bcrypt cost ≥ 12; passwords never logged/returned
- [ ] JWT RS256; private key only in api container env; 15-min TTL; `jti` revocation works
- [ ] Refresh rotation + reuse detection (test: replay old refresh token → all sessions revoked)
- [ ] ADMIN cannot authenticate via `/auth/tang-rat` path, and admin JWT rejected when session `clientType != 'web_admin'`
- [ ] ScopeGuard: write integration test — inspector from Zone A requests Zone B task → 403/404; DIW supervisor cannot read ACFS license rows
- [ ] Conflict-of-interest: POST task with assignee == business owner → 409
- [ ] File upload: mime whitelist + size cap + random object keys; MinIO buckets private; access only via presigned URL (10-min TTL)
- [ ] Helmet enabled in NestJS; CORS allowlist = app + admin origins only
- [ ] `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` global
- [ ] Prisma parameterized only (no `$queryRawUnsafe`)
- [ ] Rate limits live at nginx (auth 10/min, qr 60/min) and `@nestjs/throttler` as second layer
- [ ] AuditLog redacts: password, tokens, totpSecret
- [ ] Soft-deleted rows excluded by global Prisma middleware

## 11. PERFORMANCE CHECKLIST

- [ ] Indexes exist as in schema §3 (Prisma generates them) — verify with `EXPLAIN` on map + task list queries
- [ ] `/businesses/map`: select only `id,nameTh,latitude,longitude,status` via Prisma `select`; no relation joins beyond license status
- [ ] Dashboard aggregates: single `groupBy` queries, not N+1 loops
- [ ] React Query: staleTime 30s for lists; Mapbox GeoJSON cached client-side per filter combo
- [ ] Next.js: dynamic import Mapbox + QR scanner (both are heavy); public pages SSR
- [ ] Pagination capped `limit ≤ 100`
- [ ] Puppeteer: launch once (singleton), reuse browser, new page per export

## 12. IMPLEMENTATION ORDER (do not reorder)

```
P0  scaffold monorepo → docker-compose up (db+minio) → prisma schema (§3 verbatim)
    → migrate → seed → verify with prisma studio
P1  api: auth module (§4) + guards + audit interceptor → license/business public endpoints
    → app: dev-login + search + map + license detail + my licenses
    → TEST: security checklist auth items
P2  api: inspection module (full state machine §5.3) + dashboards + export
    → app: inspector pages + supervisor pages
    → TEST: scope + conflict-of-interest items
P3  admin (Nuxt 4): all routes §7.2 → api: admin module + sync module + cron jobs (§6)
    → TEST: full checklist pass → done
```

Definition of done per phase: all listed endpoints return correct data against seed; checklists for that phase pass; `docker compose up` from clean clone works with only `.env` created from `.env.example`.
