# Frontend Handoff — Officer Reporting, Export, and QR Profile

Base path assumes global API prefix `/api`.

## 1. Search Licenses for Officer Report

```http
GET /api/officer/licenses?q=&licenseNumber=&status=&juristicId=&businessId=&agencyId=&page=1&limit=20
Authorization: Bearer <accessToken>
```

Rules:

- Officer can see licenses across agencies for reporting.
- No zone concept remains in officer reporting.
- `agencyId` is an optional license-agency filter. Omit it to show all agencies.
- Officers may submit inspection reports for licenses from any agency returned by
  this endpoint. The report still records the submitting officer and their own
  agency for audit.
- `q` searches `business.nameTh` only.
- `licenseNumber` optionally searches `licenseNo`.
- If both `q` and `licenseNumber` are sent, both filters must match.
- Do not forward framework-internal query params such as Next.js `_rsc`.
  Backend ignores `_rsc` defensively if it appears, but it is not part of the API contract.

Examples:

```http
GET /api/officer/licenses?q=โรงงานต้นแบบ
GET /api/officer/licenses?q=โรงงานต้นแบบ&licenseNumber=RNG4
```

Response:

```json
{
  "data": [
    {
      "id": "license-id",
      "licenseNumber": "RNG4-00001",
      "status": "ACTIVE",
      "issuedAt": "2025-07-01T00:00:00.000Z",
      "expiresAt": null,
      "licenseType": {
        "id": "type-id",
        "code": "RNG4",
        "nameTh": "ใบอนุญาตประกอบกิจการโรงงาน",
        "agency": {
          "id": "agency-id",
          "code": "DIW",
          "nameTh": "กรมโรงงานอุตสาหกรรม"
        }
      },
      "business": {
        "id": "business-id",
        "nameTh": "โรงงานตัวอย่าง",
        "province": "กรุงเทพมหานคร",
        "juristic": {
          "id": "juristic-id",
          "registrationId": "0105566000000",
          "nameTh": "บริษัท ตัวอย่าง จำกัด"
        }
      }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

Recommended query key:

```ts
['officer-licenses', filters]
```

## 2. Create Officer Inspection Batch

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
        "documentsMatched": true
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

Do not send item-level pass/fail status. The inspection item stores the selected
license, officer-written detail, flexible findings, and evidence only.
If an old frontend still sends `items[].result`, backend accepts it for
compatibility but ignores the value.

Response:

```json
{
  "id": "inspection-id",
  "inspectionNo": "IR-2026-000001",
  "status": "SUBMITTED",
  "businessId": "business-id",
  "juristicPersonId": "juristic-id",
  "itemCount": 2,
  "items": [
    {
      "id": "item-id-1",
      "licenseId": "license-id-1",
      "sequence": 1
    }
  ],
  "createdAt": "2026-07-01T09:05:00.000Z"
}
```

Frontend flow:

1. User selects one business/branch.
2. User selects 1-50 licenses under that business. The selected licenses may
   belong to different agencies.
3. Submit JSON batch.
4. Use returned `items[].id` to upload evidence per license item.

## 3. Upload Evidence Per Item

```http
POST /api/officer/inspections/:inspectionId/items/:itemId/evidence
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data
```

Form data:

- `file`: jpeg/png/pdf, max 10 MB

Response:

```json
{
  "id": "evidence-id",
  "fileName": "photo.jpg",
  "mimeType": "image/jpeg",
  "fileSizeBytes": 123456,
  "url": "https://minio-presigned-url",
  "urlExpiresInSeconds": 600
}
```

## 4. List Own Inspection Reports

```http
GET /api/officer/inspections?q=&businessId=&licenseId=&dateFrom=&dateTo=&page=1&limit=20
Authorization: Bearer <accessToken>
```

Access:

- The officer list is scoped to the logged-in officer.
- Use `/api/admin/officer-inspection-logs` for admin/super_admin review across
  officers.
- Plain `YYYY-MM-DD` date filters are inclusive for the whole day.

Response uses the same item shape as admin logs:

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
        "nameTh": "โรงงานตัวอย่าง",
        "province": "กรุงเทพมหานคร"
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
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

Recommended query key:

```ts
['officer-inspections', filters]
```

## 5. Get Inspection Detail

```http
GET /api/officer/inspections/:id
Authorization: Bearer <accessToken>
```

Access:

- Creating officer can read their own inspections.
- `admin` / `super_admin` can read all.

Response includes:

- inspection header
- officer and agency summary
- business and juristic summary
- items
- current license summary
- immutable `licenseSnapshot`
- evidence with presigned URLs

Recommended query key:

```ts
['officer-inspection', inspectionId]
```

## 6. Export Inspection

```http
GET /api/officer/inspections/:id/export?format=pdf
Authorization: Bearer <accessToken>
```

Formats:

- `pdf`
- `xlsx`

Behavior:

- Response is a binary file attachment.
- Backend also uploads a copy to private MinIO.
- Backend records `EXPORT | officer-inspections` into `AuditLog`.
- Export uses stored report snapshots so later license changes do not rewrite the report history.

## 7. Admin Officer Inspection Logs

```http
GET /api/admin/officer-inspection-logs?officerId=&businessId=&licenseId=&dateFrom=&dateTo=&page=1&limit=20
Authorization: Bearer <admin accessToken>
```

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
        "nameTh": "โรงงานตัวอย่าง",
        "province": "กรุงเทพมหานคร"
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
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

Recommended query key:

```ts
['admin-officer-inspection-logs', filters]
```

## 7. Officer QR Profile

Generate token:

```http
GET /api/officers/:id/qr-profile
Authorization: Bearer <accessToken>
```

Access:

- Officer can generate their own QR profile.
- `admin` / `super_admin` can generate for any officer.

Response:

```json
{
  "officerId": "officer-id",
  "qrToken": "opaque-token",
  "verifyUrl": "http://localhost:3001/api/public/officers/verify/opaque-token",
  "issuedAt": "2026-07-01T09:15:00.000Z",
  "expiresAt": "2026-07-01T09:16:00.000Z",
  "expiresInSeconds": 60
}
```

QR token policy:

- Token is valid for 60 seconds from server `issuedAt`.
- Frontend should call this endpoint again and re-render the QR at least every 60 seconds.
- Recommended refresh interval is 50-55 seconds to avoid showing an expired QR during scan.

Public scan:

```http
GET /api/public/officers/verify/:token
```

Response:

```json
{
  "valid": true,
  "scannedAt": "2026-07-01T09:15:30.000Z",
  "officer": {
    "fullName": "เจ้าหน้าที่ตัวอย่าง",
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
  "reason": "INVALID_TOKEN"
}
```

Possible invalid `reason`:

- `INVALID_TOKEN`
- `EXPIRED_TOKEN`
- `NOT_OFFICER`
- `OFFICER_NOT_ACTIVE`

Security notes:

- Do not display phone, email, username, citizen ID, or internal IDs on the public scan page.
- `scannedAt` comes from server time.
- Public scan endpoint is rate-limited.
- Every scan attempt is stored in `officer_public_profile_scan_logs`.
