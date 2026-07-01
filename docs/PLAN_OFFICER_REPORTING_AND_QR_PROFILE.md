# Plan — Officer License Reporting, Export, and QR Profile Verification

> Status: implemented 2026-07-01. Frontend contract:
> `docs/FRONTEND_OFFICER_REPORTING_API.md`.
>
> Context: the app direction changed. Officers are scoped by agency only, not
> by fixed operating areas. An officer's primary mobile workflow is to look up licenses, inspect
> selected licenses under a juristic person/business, save a report containing
> multiple license-level report items, attach evidence, export the result, and
> leave an auditable trail for admin/super_admin review.

## 1. Current State and Gap

Current backend has an inspection module, but it is built around assigned tasks:

- `InspectionTask` with `assignedTo`, task status, due date.
- `InspectionReport` tied to one task, with one `result`, `findings`, and
  evidence documents.
- Officer scope is agency-only after the 2026-07-01 zone removal.

That does not match the new app workflow:

- Officer opens license/business data directly.
- Officer selects multiple licenses under a juristic/business context.
- One save action submits an array of license-level report items.
- Each item has its own notes/details and evidence files.
- Admin/super_admin must later inspect logs of officer actions.
- Officers need a public QR profile that citizens can scan to verify identity
  and authority.

Recommendation: build a new field-reporting surface instead of forcing the
task-based inspection tables to fit this workflow.

## 2. Proposed Data Model

Requires a Prisma migration after approval.

### `OfficerInspection`

Parent record for one field visit / one saved report batch.

Fields:

- `id`
- `inspectionNo` unique, e.g. `IR-2026-000001`
- `officerId` FK `SystemUser`
- `businessId` FK `Business`
- `juristicPersonId` FK `JuristicPerson`, nullable for individual businesses
- `agencyId` FK `Agency`
- `status`: `SUBMITTED | EXPORTED | VOIDED`
- `summaryNote`
- `inspectedAt`
- `submittedAt`
- `exportedAt`
- `pdfObjectKey`, nullable
- `xlsxObjectKey`, nullable
- `createdAt`, `updatedAt`, `deletedAt`

Rules:

- Officer must have role `officer`.
- Officer authority comes from `SystemUser.agencyId`.
- No zone requirement. Officer reporting can select licenses across agencies.
- The report still stores the submitting officer's `agencyId` for audit and
  officer identity, but license visibility/submission is not blocked by license
  agency.
- `businessId` determines juristic/business context; client does not choose
  `juristicPersonId` directly.

### `OfficerInspectionItem`

One object inside the frontend report array.

Fields:

- `id`
- `inspectionId` FK `OfficerInspection`
- `licenseId` FK `License`
- `sequence`
- `detailNote`
- `findings` JSON
- `licenseSnapshot` JSON
- `createdAt`, `updatedAt`

Rules:

- Every `licenseId` must belong to the parent `businessId`.
- Licenses do not have to belong to the submitting officer's agency.
- Store `licenseSnapshot` at submit time so exports remain stable even if the
  license changes later.

### `OfficerInspectionEvidence`

Evidence files attached to one item.

Fields:

- `id`
- `inspectionItemId` FK `OfficerInspectionItem`
- `fileName`
- `objectKey`
- `mimeType`
- `fileSizeBytes`
- `uploadedBy`
- `createdAt`

Rules:

- MIME whitelist: `image/jpeg`, `image/png`, `application/pdf`.
- Max file size: 10 MB.
- Object key: `officer-inspections/{inspectionId}/{itemId}/{uuid}.{ext}`.
- Bucket remains private; clients receive presigned URLs only.

### `OfficerPublicProfileScanLog`

Public QR verification log.

Fields:

- `id`
- `officerId` FK `SystemUser`
- `scannedAt`
- `ipAddress`
- `userAgent`
- `qrTokenId`, nullable
- `result`: `VALID | INACTIVE | NOT_OFFICER | EXPIRED_TOKEN`

Rules:

- No citizen identity is required to scan.
- Do not store scanner PII beyond IP/user-agent unless later approved.
- Admin/super_admin can review scan counts and scan history.

## 3. Proposed APIs

### Read data for officer workflow

```http
GET /api/officer/licenses?q=&agencyId=&status=&juristicId=&businessId=
Authorization: Bearer <accessToken>
```

Purpose: officer searches licenses available for report submission.

Backend rules:

- `@Roles('officer')`.
- `agencyId` is an optional license-agency filter. Omit it to show all agencies.
- Return license, business, juristic, and license type summary.
- No agency scope block for this reporting workflow.

### Create or submit field report batch

```http
POST /api/officer/inspections
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Request:

```json
{
  "businessId": "business-id",
  "inspectedAt": "2026-07-01T09:00:00.000Z",
  "summaryNote": "ตรวจตามคำร้องของผู้ประกอบการ",
  "items": [
    {
      "licenseId": "license-id-1",
      "detailNote": "เอกสารครบถ้วน สถานที่ตรงตามใบอนุญาต",
      "findings": {
        "locationMatched": true,
        "documentsMatched": true,
        "safetyConcern": false
      }
    },
    {
      "licenseId": "license-id-2",
      "detailNote": "ต้องส่งเอกสารเพิ่มเติม",
      "findings": {
        "missingDocuments": ["ภาพถ่ายพื้นที่จัดเก็บ"]
      }
    }
  ]
}
```

Response:

```json
{
  "id": "inspection-id",
  "inspectionNo": "IR-2026-000001",
  "status": "SUBMITTED",
  "businessId": "business-id",
  "juristicPersonId": "juristic-id",
  "itemCount": 2,
  "createdAt": "2026-07-01T09:05:00.000Z"
}
```

Validation:

- `items` must have 1-50 entries.
- No duplicate `licenseId` inside one submission.
- Every license must belong to the selected business.
- Officer can submit licenses across agencies.
- `summaryNote`, `detailNote`, and `findings` are stored as officer-authored
  evidence, not as authoritative license data.

### Attach evidence to one report item

```http
POST /api/officer/inspections/:inspectionId/items/:itemId/evidence
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data
```

Request:

- `file`: binary, jpeg/png/pdf, max 10 MB.

Response:

```json
{
  "id": "evidence-id",
  "fileName": "photo.jpg",
  "mimeType": "image/jpeg",
  "fileSizeBytes": 123456,
  "url": "presigned-url",
  "urlExpiresInSeconds": 600
}
```

Rules:

- Only the creating officer, admin, or super_admin may add evidence.
- Evidence can be added while inspection is `DRAFT` or `SUBMITTED` if owner
  approves post-submit attachment; default recommendation: allow only `DRAFT`
  before final submit.

### Get inspection detail

```http
GET /api/officer/inspections/:id
Authorization: Bearer <accessToken>
```

Response includes:

- inspection header
- officer summary
- business and juristic summary
- items with license snapshot
- evidence presigned URLs
- audit timestamps

Access:

- creating officer can read their own reports
- admin/super_admin can read all

### Export inspection

```http
GET /api/officer/inspections/:id/export?format=pdf|xlsx
Authorization: Bearer <accessToken>
```

Recommended behavior:

- Generate export from `licenseSnapshot`, report items, notes, and evidence
  metadata.
- Do not embed large original evidence images by default; include thumbnails or
  evidence index unless owner requests full image PDF.
- Store export in MinIO and return a presigned URL, or stream directly if the
  current PDFKit/XLSX pattern is kept.
- Record `EXPORT` audit log with `inspectionId`.

### Admin log review

```http
GET /api/admin/officer-inspection-logs?officerId=&businessId=&licenseId=&dateFrom=&dateTo=&page=&limit=
Authorization: Bearer <accessToken>
```

Access:

- `admin`
- `super_admin`

Response:

```json
{
  "data": [
    {
      "inspectionId": "inspection-id",
      "inspectionNo": "IR-2026-000001",
      "officer": {
        "id": "officer-id",
        "fullName": "เจ้าหน้าที่ตัวอย่าง",
        "agency": "DIW"
      },
      "business": {
        "id": "business-id",
        "nameTh": "โรงงานตัวอย่าง"
      },
      "juristic": {
        "id": "juristic-id",
        "nameTh": "บริษัท ตัวอย่าง จำกัด"
      },
      "itemCount": 2,
      "status": "SUBMITTED",
      "inspectedAt": "2026-07-01T09:00:00.000Z",
      "submittedAt": "2026-07-01T09:05:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

## 4. QR Officer Profile Verification

Goal: citizens scan an officer QR and confirm the officer exists, is active, and
has authority for the claimed agency/license family.

### QR token recommendation

Do not encode raw `officerId` alone in QR.

Use an opaque signed token:

```text
officer-profile-token = signed({ officerId, issuedAt, tokenVersion })
```

Benefits:

- Can rotate token if badge is lost.
- Does not expose internal IDs directly.
- Allows future expiry/versioning.

### Public scan endpoint

```http
GET /api/public/officers/verify/:token
```

No authentication required.

Response:

```json
{
  "valid": true,
  "scannedAt": "2026-07-01T09:15:30.000Z",
  "officer": {
    "fullName": "นายตรวจ ตัวอย่าง",
    "agency": {
      "id": "agency-id",
      "code": "DIW",
      "nameTh": "กรมโรงงานอุตสาหกรรม"
    },
    "permissions": [
      {
        "agency": "DIW",
        "labelTh": "สามารถตรวจใบอนุญาตกรมโรงงานอุตสาหกรรม",
        "licenseTypeCodes": ["RNG4", "HAZMAT"]
      }
    ]
  }
}
```

Invalid response:

```json
{
  "valid": false,
  "scannedAt": "2026-07-01T09:15:30.000Z",
  "reason": "OFFICER_NOT_ACTIVE"
}
```

Rules:

- Return only public-safe fields.
- Do not return phone, email, citizen ID, username, or internal
  admin metadata.
- `scannedAt` must be server time, not client time.
- Create `OfficerPublicProfileScanLog` for every scan attempt.
- Rate limit by IP to reduce scraping.

### Officer QR profile admin endpoint

```http
GET /api/officers/:id/qr-profile
Authorization: Bearer <accessToken>
```

Access:

- officer can get their own QR profile
- admin/super_admin can get any manageable officer profile

Response:

```json
{
  "officerId": "officer-id",
  "qrToken": "opaque-token",
  "verifyUrl": "https://example.go.th/api/public/officers/verify/opaque-token",
  "issuedAt": "2026-07-01T09:15:00.000Z",
  "expiresAt": "2026-07-01T09:16:00.000Z",
  "expiresInSeconds": 60
}
```

Token lifetime:

- QR tokens expire after 60 seconds.
- The app should regenerate the QR every 50-55 seconds while the profile screen is visible.

## 5. Audit and Logging

Every mutating action must be auditable:

- create report batch → `CREATE | officer_inspections`
- upload evidence → `CREATE | officer_inspection_evidence`
- submit/finalize report → `UPDATE | officer_inspections`
- export report → `EXPORT | officer_inspections`
- QR scan → domain log table plus optional audit row if tied to an authenticated
  actor

Admin review should not rely only on generic `AuditLog`. Keep a domain-specific
inspection table because admins need filterable business data, license ids,
officer, and timestamps.

## 6. Frontend Flow

Officer app:

1. Search or open juristic/business/license data.
2. Select one business.
3. Select one or more licenses under that business.
4. Create report array:
   - one object per selected license
   - detail note
   - findings JSON
   - evidence files
5. Save draft or submit.
6. Export PDF/XLSX for external work.

Recommended query keys:

```ts
['officer-licenses', filters]
['officer-inspection', inspectionId]
['officer-inspection-export', inspectionId, format]
['admin-officer-inspection-logs', filters]
['public-officer-verify', token]
```

## 7. Edge Cases and Weak Points

### Authority drift

An officer may submit a report, then their role/agency changes later.

Mitigation:

- Validate role/agency at submit time.
- Store officer/agency snapshot on `OfficerInspection`.
- Admin log displays both current officer state and submitted snapshot.

### License changes after report

License data can change after report submission.

Mitigation:

- Store `licenseSnapshot` per item.
- Exports use snapshots, not live joins only.

### Duplicate submissions

Officer may double-tap submit.

Mitigation:

- Accept an optional `clientRequestId`.
- Add unique `(officerId, clientRequestId)` if approved.
- Otherwise frontend disables submit while pending and backend de-duplicates only
  by exact draft id.

### Evidence abuse

Large files or dangerous MIME spoofing can be uploaded.

Mitigation:

- Validate MIME and extension from MIME mapping.
- Max 10 MB.
- Private bucket.
- Presigned URL expiry 10 minutes.

### Public QR scraping

Public QR endpoint could be scraped for officer names.

Mitigation:

- Opaque token, not sequential id.
- Rate limit by IP.
- Return minimal fields.
- Log scan attempts.
- Token rotation.

### Privacy

Officer public profile must not expose sensitive data.

Never expose:

- citizenId
- email
- phone
- username
- internal roles other than public permission labels

### Offline field work

Officers may work with unstable network.

Mitigation:

- Support draft save.
- Let frontend queue evidence uploads after report draft creation.
- Use `clientRequestId` for retry-safe submit in a later phase.

### Report status ambiguity

If export can happen before final submit, exported documents may not match final
state.

Recommendation:

- Allow export for `SUBMITTED` only in v1.
- Draft preview can be frontend-only or clearly watermarked if implemented.

## 8. Implementation Order

1. Fix role/scope hygiene already approved:
   - `ScopeGuard` public+officer handling.
   - user-management rank checks.
   - role wording docs/Swagger cleanup.
2. Add Prisma migration for officer inspection tables and QR scan log.
3. Add DTOs and controller endpoints under a new `officer` module or extend
   `inspection` only if naming is kept consistent.
4. Add service validation:
   - officer role
   - agency/license type
   - business/license relation
   - no duplicate license ids
5. Add evidence upload.
6. Add export.
7. Add admin log list.
8. Add QR token generation and public verify endpoint.
9. Add unit and e2e coverage.

## 9. Acceptance Criteria

- Officer can submit one inspection containing multiple license-level items.
- Each item stores notes/findings and can have evidence files.
- Officer can export submitted report.
- Admin/super_admin can list and filter officer inspection logs.
- Citizen can scan officer QR and see name, agency, server scan time, and
  public-safe permission labels.
- No citizen ID, officer email, phone, or username is exposed by public QR API.
- Reports remain stable after license data changes because snapshots are stored.
- RNG4 still never expires by date and must render `expiresAt: null`.
