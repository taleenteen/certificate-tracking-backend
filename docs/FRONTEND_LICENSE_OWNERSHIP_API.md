# Frontend Handoff — License Ownership API

> Purpose: frontend contract for showing licenses held by an individual
> (`บุคคลธรรมดา`) versus a juristic person (`นิติบุคคล`). Use this with
> `docs/FRONTEND_GUIDE_AI.md`.

## 1. Terms and Rules

- Use `บุคคลธรรมดา` for licenses held by the signed-in person.
- Use `นิติบุคคล` for licenses held by a registered juristic person.
- Do not use `บริษัท` as the generic label; a juristic person can be more than a
  limited company.
- `GET /api/my/licenses` is scoped by the active access token:
  - no `activeJuristicId` = personal mode
  - has `activeJuristicId` = juristic mode
- `?mode=personal|juristic` is legacy compatibility. New frontend code should
  switch context with `POST /api/auth/context` instead.
- Never expect or display full citizen ID. The API returns only
  `citizenIdVerified` and `citizenIdLast4` on profile endpoints.

## 2. Context Switching

### List memberships

```http
GET /api/juristic
Authorization: Bearer <accessToken>
```

Response:

```json
[
  {
    "juristicId": "6d0f260a-7c7e-4f0e-9e18-e12777a58fe1",
    "nameTh": "บริษัท ตัวอย่าง จำกัด",
    "nameEn": "Example Co., Ltd.",
    "role": "OWNER"
  }
]
```

### Enter juristic mode

```http
POST /api/auth/context
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "juristicId": "6d0f260a-7c7e-4f0e-9e18-e12777a58fe1" }
```

The response includes a fresh `accessToken`. Replace the stored access token
immediately; the old access-token JTI is revoked.

### Return to personal mode

```http
POST /api/auth/context
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "juristicId": null }
```

## 3. License Endpoints

### Public license search

Use this on citizen-facing search screens. This endpoint is public and does not
apply officer agency scope.

```http
GET /api/licenses/search?q=โรงงาน&licenseNumber=RNG4&page=1&limit=20
```

Query:

- `q`: business / establishment name search (`business.nameTh`)
- `licenseNumber`: optional license number search (`licenseNo`)
- `status`: optional license status
- `page`, `limit`: pagination

Response:

```json
{
  "data": [
    {
      "id": "license-id",
      "licenseNumber": "DEV-1D24042A8B-RNG4",
      "status": "ACTIVE",
      "issuedAt": "2025-07-01T00:00:00.000Z",
      "expiresAt": null,
      "licenseType": {
        "id": "type-id",
        "code": "RNG4",
        "nameTh": "ใบอนุญาตประกอบกิจการโรงงาน ร.ง.4",
        "agency": {
          "id": "agency-id",
          "code": "DIW",
          "nameTh": "กรมโรงงานอุตสาหกรรม"
        }
      },
      "business": {
        "id": "business-id",
        "nameTh": "โรงงานต้นแบบ นาย ภาณุวิชญ์ กุ๊กู๊",
        "address": "88/8 นิคมอุตสาหกรรมต้นแบบ ถนนอุตสาหกรรม แขวงทดสอบ เขตทดสอบ",
        "province": "กรุงเทพมหานคร",
        "latitude": "13.756300",
        "longitude": "100.501800"
      },
      "juristic": {
        "id": "juristic-id",
        "nameTh": "บริษัท ตัวอย่าง จำกัด",
        "registrationId": "0105566000000"
      },
      "ownership": {
        "mode": "juristic"
      }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

Recommended query key:

```ts
['public-license-search', { q, licenseNumber, status, page, limit }]
```

### Public license search grouped by business

Use this when the design wants search results as establishments first, with
licenses nested under each establishment.

```http
GET /api/licenses/search/grouped-by-business?q=คลัง&licenseNumber=ACFS&page=1&limit=20
```

Query params are the same as `GET /api/licenses/search`, but pagination is at
the business/establishment level.

Response:

```json
{
  "data": [
    {
      "id": "business-id",
      "nameTh": "คลังสินค้าและศูนย์กระจายสินค้า นาย ภาณุวิชญ์ กุ๊กู๊",
      "address": "55/5 โครงการคลังสินค้าต้นแบบ ถนนโลจิสติกส์ แขวงทดสอบ เขตทดสอบ",
      "province": "กรุงเทพมหานคร",
      "latitude": "13.761300",
      "longitude": "100.509800",
      "juristic": {
        "id": "juristic-id",
        "nameTh": "บริษัท ตัวอย่าง จำกัด",
        "registrationId": "0105566000000"
      },
      "ownership": {
        "mode": "juristic"
      },
      "licenseCount": 2,
      "licenses": [
        {
          "id": "license-id",
          "licenseNumber": "DEV-1D24042A8B-ACFS",
          "status": "ACTIVE",
          "issuedAt": "2025-07-01T00:00:00.000Z",
          "expiresAt": "2027-07-01T00:00:00.000Z",
          "licenseType": {
            "id": "type-id",
            "code": "ACFS_GAP_HACCP",
            "nameTh": "ใบรับรอง GAP/HACCP",
            "agency": {
              "id": "agency-id",
              "code": "ACFS",
              "nameTh": "สำนักงานมาตรฐานสินค้าเกษตรและอาหารแห่งชาติ"
            }
          }
        }
      ]
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

Recommended query key:

```ts
['public-license-search-grouped-by-business', { q, licenseNumber, status, page, limit }]
```

### Prototype button: seed juristic demo data

Use this only for prototype/testing screens when the current user has no
juristic data yet. The endpoint is idempotent per user and disabled in
production.

```http
POST /api/my/dev/seed-juristic-license-demo
Authorization: Bearer <accessToken>
```

Request body: none.

Response:

```json
{
  "success": true,
  "juristicId": "6d0f260a-7c7e-4f0e-9e18-e12777a58fe1",
  "messageTh": "สร้างข้อมูลนิติบุคคลตัวอย่างเรียบร้อย",
  "groups": [
    {
      "juristicId": "6d0f260a-7c7e-4f0e-9e18-e12777a58fe1",
      "nameTh": "บริษัท ทดสอบของ สมชาย ใจดี จำกัด",
      "nameEn": "Demo Company ABC123 Co., Ltd.",
      "registrationId": "DEVABC123000",
      "myRole": "OWNER",
      "businessCount": 2,
      "licenseCount": 4,
      "businesses": [
        {
          "id": "f582a1ad-a1ea-4722-84a9-ddd84fd7330d",
          "nameTh": "โรงงานต้นแบบ สมชาย ใจดี",
          "province": "กรุงเทพมหานคร",
          "licenseCount": 2,
          "licenses": [
            {
              "id": "bdf6ccfd-c6b5-4b2b-b5ad-d8cc1c1bd6e4",
              "licenseNumber": "DEV-ABC123-RNG4",
              "issuedAt": "2025-07-01T00:00:00.000Z",
              "expiresAt": null,
              "status": "ACTIVE",
              "licenseType": {
                "id": "9bbdd5ef-c902-471b-90f6-dfb2d06e2c92",
                "code": "RNG4",
                "nameTh": "ใบอนุญาตประกอบกิจการโรงงาน ร.ง.4",
                "nameEn": "Factory Operation License",
                "agency": "DIW"
              }
            }
          ]
        }
      ]
    }
  ]
}
```

Frontend button behavior:

```ts
await http.post('my/dev/seed-juristic-license-demo');
queryClient.invalidateQueries({ queryKey: ['my-juristic-license-groups'] });
queryClient.invalidateQueries({ queryKey: ['juristic-memberships'] });
```

Recommended UI:

- Show this button only in development/prototype builds or when the juristic tab
  is empty.
- Button label: `สร้างข้อมูลนิติบุคคลตัวอย่าง`
- After success, switch to the juristic tab and render `groups` immediately or
  refetch `GET /api/my/juristic-license-groups`.

### Juristic licenses grouped by company

Use this endpoint for the juristic tab with expandable/collapsible company and
business sections. It is read-only and does not switch session context.

```http
GET /api/my/juristic-license-groups
Authorization: Bearer <accessToken>
```

Response:

```json
[
  {
    "juristicId": "6d0f260a-7c7e-4f0e-9e18-e12777a58fe1",
    "nameTh": "บริษัท ตัวอย่าง จำกัด",
    "nameEn": "Example Co., Ltd.",
    "registrationId": "0105559000000",
    "myRole": "OWNER",
    "businessCount": 1,
    "licenseCount": 2,
    "businesses": [
      {
        "id": "f582a1ad-a1ea-4722-84a9-ddd84fd7330d",
        "nameTh": "โรงงานตัวอย่าง",
        "province": "ชลบุรี",
        "licenseCount": 2,
        "licenses": [
          {
            "id": "bdf6ccfd-c6b5-4b2b-b5ad-d8cc1c1bd6e4",
            "licenseNumber": "RNG4-2569-001",
            "issuedAt": "2026-01-01T00:00:00.000Z",
            "expiresAt": null,
            "status": "ACTIVE",
            "licenseType": {
              "id": "9bbdd5ef-c902-471b-90f6-dfb2d06e2c92",
              "code": "RNG4",
              "nameTh": "ร.ง.4",
              "nameEn": "Factory Operation License",
              "agency": "DIW"
            }
          }
        ]
      }
    ]
  }
]
```

- The backend verifies `JuristicMember(userId, juristicId, isActive=true)` for
  every returned company.
- Companies with no businesses are still returned with `businessCount: 0`,
  `licenseCount: 0`, and `businesses: []`.
- Businesses with no licenses are returned with `licenseCount: 0` and
  `licenses: []`.
- Use this for display only. Use `POST /api/auth/context` before juristic
  mutations or management workflows.

### Juristic business detail

Use this when the user taps a business/branch/factory inside the juristic tab.
The frontend only sends `businessId`; the backend derives the juristic owner and
verifies membership.

```http
GET /api/my/juristic-businesses/:id
Authorization: Bearer <accessToken>
```

Response:

```json
{
  "id": "f582a1ad-a1ea-4722-84a9-ddd84fd7330d",
  "nameTh": "โรงงานตัวอย่าง",
  "address": "88/8 นิคมอุตสาหกรรมต้นแบบ ถนนอุตสาหกรรม แขวงทดสอบ เขตทดสอบ",
  "province": "กรุงเทพมหานคร",
  "latitude": "13.756300",
  "longitude": "100.501800",
  "phone": "021234567",
  "juristic": {
    "id": "6d0f260a-7c7e-4f0e-9e18-e12777a58fe1",
    "nameTh": "บริษัท ตัวอย่าง จำกัด",
    "nameEn": "Example Co., Ltd.",
    "registrationId": "0105559000000",
    "myRole": "OWNER"
  },
  "licenseSummary": {
    "total": 4,
    "active": 2,
    "suspended": 1,
    "expired": 0,
    "pending": 1,
    "revoked": 0
  },
  "licenses": [
    {
      "id": "bdf6ccfd-c6b5-4b2b-b5ad-d8cc1c1bd6e4",
      "licenseNumber": "RNG4-2569-001",
      "issuedAt": "2026-01-01T00:00:00.000Z",
      "expiresAt": null,
      "status": "ACTIVE",
      "suspendedAt": null,
      "suspensionReason": null,
      "licenseType": {
        "id": "9bbdd5ef-c902-471b-90f6-dfb2d06e2c92",
        "code": "RNG4",
        "nameTh": "ร.ง.4",
        "nameEn": "Factory Operation License",
        "agency": "DIW"
      }
    }
  ]
}
```

- `404`: business does not exist, is not a juristic business, or the user is
  not an active member of the owning juristic person.
- Use this response for the full business detail page. It includes all license
  statuses, not only active licenses.

### My licenses

```http
GET /api/my/licenses
Authorization: Bearer <accessToken>
```

Personal response:

```json
[
  {
    "id": "8ff2b9e2-ae31-40ef-b9f1-9e6e606c91e8",
    "licenseNumber": "DEV-LX123",
    "issuedAt": "2026-06-15T00:00:00.000Z",
    "expiresAt": "2027-06-15T00:00:00.000Z",
    "status": "ACTIVE",
    "licenseType": {
      "id": "0f2a9c12-0b30-46c1-aad6-9b2a7f6bbd15",
      "code": "HAZMAT",
      "nameTh": "ใบอนุญาตวัตถุอันตราย",
      "nameEn": "Hazardous Substance License",
      "agency": "DIW"
    },
    "business": {
      "id": "90f9c60d-1305-4bc0-8ac3-b8f8eb9450af",
      "nameTh": "กิจการของสมชาย",
      "province": "กรุงเทพมหานคร",
      "registrationId": null
    },
    "ownership": {
      "type": "INDIVIDUAL",
      "labelTh": "บุคคลธรรมดา",
      "contextId": "6b84b886-e71c-4f5a-9c34-376f32e59699",
      "displayNameTh": "สมชาย ใจดี",
      "registrationId": null
    }
  }
]
```

Juristic response:

```json
[
  {
    "id": "bdf6ccfd-c6b5-4b2b-b5ad-d8cc1c1bd6e4",
    "licenseNumber": "RNG4-2569-001",
    "issuedAt": "2026-01-01T00:00:00.000Z",
    "expiresAt": null,
    "status": "ACTIVE",
    "licenseType": {
      "id": "9bbdd5ef-c902-471b-90f6-dfb2d06e2c92",
      "code": "RNG4",
      "nameTh": "ร.ง.4",
      "nameEn": "Factory Operation License",
      "agency": "DIW"
    },
    "business": {
      "id": "f582a1ad-a1ea-4722-84a9-ddd84fd7330d",
      "nameTh": "โรงงานตัวอย่าง",
      "province": "ชลบุรี",
      "registrationId": "0105559000000"
    },
    "ownership": {
      "type": "JURISTIC",
      "labelTh": "นิติบุคคล",
      "contextId": "6d0f260a-7c7e-4f0e-9e18-e12777a58fe1",
      "displayNameTh": "บริษัท ตัวอย่าง จำกัด",
      "registrationId": "0105559000000"
    }
  }
]
```

Empty response:

```json
[]
```

### Public license detail

```http
GET /api/licenses/:id
```

Includes `ownership`, but for `INDIVIDUAL` rows the public response does not
expose a person name, citizen ID, or user id.

### Public business detail

```http
GET /api/businesses/:id
```

Returns active licenses and `ownership`. It does not return raw
`ownerUserId` or `juristicPersonId` fields.

## 4. Errors and Caching

- `403 Juristic membership has been revoked`: clear active company context and
  send the user back to personal mode or the company switcher.
- `404 { "found": false }`: legacy `?mode=juristic` DBD lookup found no
  company. New frontend code should avoid this path.
- Query keys must include active context:

```ts
['my-licenses', activeJuristicId ?? 'personal']
['my-juristic-license-groups']
['my-juristic-business', businessId]
```

- After `POST /api/auth/context`, invalidate:
  - `['my-licenses', ...]`
  - `['notifications', ...]`
  - any task/dashboard queries whose data depends on the active context
