# E-License Verification API (ระบบหลังบ้านสำหรับแพลตฟอร์มตรวจสอบใบอนุญาต)

NestJS 11 API Backend สำหรับแพลตฟอร์มตรวจสอบใบอนุญาตอิเล็กทรอนิกส์ของประเทศไทย (E-Licensing Platform) ที่เชื่อมต่อกับแอปพลิเคชันทางรัฐ (Tang Rat) ในรูปแบบของ Mock Providers ระบบนี้สร้างขึ้นด้วย PostgreSQL 16 + Prisma 7 + MinIO และใช้ระบบการจัดเก็บข้อมูลแบบ Multi-tenant สำหรับนิติบุคคล (Juristic Person)

---

## 📂 โครงสร้างโปรเจค (Project Structure)

โครงสร้างโฟลเดอร์หลักของโปรเจคถูกแบ่งออกเป็นโมดูลและส่วนกลางที่ชัดเจนตามมาตรฐานของ NestJS:

```
├── prisma/                      # การตั้งค่าฐานข้อมูลด้วย Prisma ORM
│   ├── migrations/              # ไฟล์ประวัติการ Migrate ฐานข้อมูล
│   ├── schema.prisma            # โครงสร้างตารางและแบบจำลองข้อมูล (Database Schema)
│   └── seed.ts                  # ไฟล์สคริปต์การจำลองข้อมูลเริ่มต้น (Mock Database Seed)
├── src/                         # ซอร์สโค้ดหลักของแอปพลิเคชัน
│   ├── main.ts                  # จุดเริ่มต้นเข้าสู่แอปพลิเคชัน (Entry Point) และการตั้งค่า Global Middleware
│   ├── swagger.ts               # การกำหนดค่า OpenAPI / Swagger UI สำหรับ API Documentation
│   ├── app.module.ts            # Root Module ที่รวบรวมโมดูลและ Configuration ทั้งหมด
│   ├── app.controller.ts        # Controller หลักของระบบ (Health Check)
│   ├── app.service.ts           # Service หลักของระบบ
│   ├── common/                  # โฟลเดอร์รวม Utilities, Guards, Decorators และ Interceptors ส่วนกลาง
│   │   ├── auth.roles.ts        # ลำดับสิทธิ์ (Hierarchical Roles) และ Helper ตรวจสอบสิทธิ์
│   │   ├── auth.types.ts        # ไทป์ที่ใช้ในระบบยืนยันตัวตน
│   │   ├── crypto/              # ฟังก์ชันเข้ารหัสและแฮชข้อมูล
│   │   ├── decorators/          # Custom Decorators (เช่น @SkipAudit, @CurrentUser)
│   │   ├── dto/                 # Data Transfer Objects ส่วนกลาง
│   │   ├── filters/             # Exception Filters ในการดักจับข้อผิดพลาด
│   │   ├── guards/              # Guards ตรวจสอบสิทธิ์ (RolesGuard, ScopeGuard, ClientTypeGuard)
│   │   └── interceptors/        # Interceptors ส่วนกลาง (เช่น AuditInterceptor สำหรับบันทึกประวัติการกระทำ)
│   └── modules/                 # โมดูลฟังก์ชันการทำงานหลัก (Feature Modules)
│       ├── agency/              # การจัดการหน่วยงานผู้ออกใบอนุญาต
│       ├── audit/               # การบันทึกและตรวจสอบประวัติการทำงาน (Audit Logs)
│       ├── auth/                # การยืนยันตัวตน (Tang Rat Login, Portal Login, TOTP, Refresh Tokens)
│       ├── business/            # ข้อมูลใบอนุญาตของธุรกิจและระบบทะเบียน
│       ├── dashboard/           # สถิติและหน้าแสดงผลข้อมูลเชิงบริหาร
│       ├── export/              # การส่งออกรายงานในรูปแบบ PDF / CSV
│       ├── external/            # Mock Providers สำหรับเชื่อมต่อภายนอก (Tang Rat API, DBD API, etc.)
│       ├── inspection/          # ระบบงานตรวจพื้นที่ (Field Inspections) และการลงพื้นที่ตรวจ
│       ├── juristic/            # พอร์ทัลระบบสมาชิกนิติบุคคลแบบ Multi-tenant (Juristic Memberships & Join Requests)
│       ├── license/             # ระบบการสร้างและจัดการสถานะใบอนุญาต (เช่น RNG4 licenses ที่ไม่มีวันหมดอายุ)
│       ├── my/                  # ข้อมูลส่วนตัวของผู้ใช้ และการผูกบัญชีตรวจสอบตัวตน (Identity Linking)
│       ├── notification/        # ระบบส่งข้อความแจ้งเตือนภายใน
│       ├── officer/             # รายงานผลตรวจของเจ้าหน้าที่, export, และ QR profile
│       ├── storage/             # โมดูลจัดการไฟล์อัปโหลดร่วมกับ MinIO S3 Object Storage
│       ├── sync/                # การซิงค์และกำหนดรอบการทำงาน (Cron / Schedule Tasks)
│       └── user/                # การจัดการบัญชีผู้ใช้งานระบบภายใน
├── docs/                        # เอกสารข้อกำหนดของระบบและการออกแบบระบบ (Implementation Guides)
├── nginx/                       # การตั้งค่า Nginx Reverse Proxy สำหรับ Docker Dev
└── scripts/                     # สคริปต์ช่วยอำนวยความสะดวกในระหว่างการพัฒนาและทดสอบ
```

---

## ⚙️ การตั้งค่า Environment Variables (`.env`)

มีไฟล์ตัวอย่างการตั้งค่าให้เลือกตามสภาพแวดล้อมที่เหมาะสม 3 รูปแบบ:

### 1. `.env.local.example` (สำหรับรันตรงบนเครื่อง Host - Local)
ใช้เมื่อต้องการรัน Node.js API บนเครื่องคอมพิวเตอร์ของคุณโดยตรง และเรียกใช้งานฐานข้อมูลกับ MinIO ที่รันอยู่ใน Docker
*คัดลอกไฟล์นี้โดยใช้คำสั่ง:* `cp .env.local.example .env`

### 2. `.env.example` (สำหรับรันทุกอย่างใน Docker Compose)
ใช้เมื่อต้องการรันฐานข้อมูล, MinIO และ API ทุกอย่างให้อยู่ภายในระบบ Docker คอนเทนเนอร์ทั้งหมด
*คัดลอกไฟล์นี้โดยใช้คำสั่ง:* `cp .env.example .env`

### 3. `.env.deploy.example` (สำหรับสภาพแวดล้อมจริง / Production)
ใช้บนเซิร์ฟเวอร์สำหรับการนำขึ้นระบบจริง โดยใช้ร่วมกับ `docker-compose.deploy.yml`
*คัดลอกไฟล์นี้โดยใช้คำสั่งบนเซิร์ฟเวอร์:* `cp .env.deploy.example .env.deploy`

### คำอธิบายตัวแปรที่สำคัญใน `.env`
*   `DATABASE_URL`: URL สำหรับเชื่อมต่อฐานข้อมูล PostgreSQL (กำหนดไอพีให้ถูกต้องตามโหมดการรัน เช่น `localhost` หรือชื่อบริการของ Docker `db`)
*   `JWT_PRIVATE_KEY_BASE64` & `JWT_PUBLIC_KEY_BASE64`: คีย์ RS256 เข้ารหัสลับ JWT ที่เข้ารหัสเป็น Base64 (หากเว้นว่างไว้ในโหมดพัฒนา ระบบจะสร้าง Ephemeral Keys ชั่วคราวให้โดยอัตโนมัติเมื่อสตาร์ทเซิร์ฟเวอร์)
*   `MINIO_ENDPOINT`: ลิงก์เชื่อมต่อบริการจัดการไฟล์ MinIO (ใช้ `localhost` สำหรับ Local หรือ `http://minio:9000` สำหรับ Docker)
*   `ALLOW_SEED`: อนุญาตให้สคริปต์ทำการสร้างข้อมูลจำลองบนเซิร์ฟเวอร์ในการบูตครั้งแรกได้เมื่อพบตารางว่าง (`true` / `false`)

---

## 🚀 คำสั่งสำหรับรันระบบ (Build, Run Local, Production และ Docker)

### 📌 1. พัฒนาระบบบนเครื่อง Local (Direct Local Dev)

หากต้องการรัน API บนเครื่องคอมพิวเตอร์หลัก (ไม่ผ่าน Docker API) แต่ใช้งาน DB ใน Docker ให้ทำตามขั้นตอนนี้:

**ขั้นตอนแบบรวดเร็วรอบเดียวจบ (One-shot Dev Setup):**
```bash
./dev.sh
```
สคริปต์ `dev.sh` จะทำหน้าที่ติดตั้ง npm packages, สร้างไฟล์ `.env`, เปิดบริการฐานข้อมูล PostgreSQL + MinIO ใน Docker, ทำการ Migrate โครงสร้างฐานข้อมูล, Seed ข้อมูลเริ่มต้น และรันระบบขึ้นในโหมด Watch อัตโนมัติ

**ขั้นตอนแบบควบคุมเองทีละส่วน:**
1. ติดตั้ง Packages และ generate Prisma client:
   ```bash
   npm ci
   ```
2. สตาร์ทฐานข้อมูล Postgres และ MinIO ขึ้นมาหลังบ้าน:
   ```bash
   docker compose -f docker-compose.infra.yml up -d
   ```
3. นำเข้า Schema และทำการ Migrate:
   ```bash
   npx prisma migrate dev
   ```
4. สร้างข้อมูลจำลอง (Seed):
   ```bash
   npm run prisma:seed
   ```
5. รันเซิร์ฟเวอร์ในโหมดพัฒนา (Watch Mode):
   ```bash
   npm run start:dev
   ```

---

### 📌 2. การคอมไพล์ระบบ (Build)

คอมไพล์ TypeScript ไปเป็น JavaScript สำหรับใช้งานบน Production (ไฟล์ผลลัพธ์จะถูกสร้างไว้ที่โฟลเดอร์ `dist/`):
```bash
npm run build
```

---

### 📌 3. การรันบน Production (Production Execution - ไม่ใช้ Docker)

1. ตั้งค่าสถานะ Environment ให้เป็น Production และปิดการ Seed:
   ```bash
   export NODE_ENV=production
   ```
2. สั่งรัน JavaScript ที่คอมไพล์แล้ว:
   ```bash
   npm run start:prod
   ```
   *หมายเหตุ: สคริปต์ Seed จะปฏิเสธการทำงานหากตรวจพบว่ารันอยู่ในโหมด `NODE_ENV=production` เพื่อป้องกันความปลอดภัยของข้อมูล*

---

### 📌 4. การรันระบบผ่าน Docker (Docker Containerization)

#### A. โหมดการพัฒนาในระบบ Docker (Local Development Stack)
รัน NestJS API, PostgreSQL, MinIO และ Nginx ในระบบ Docker คอนเทนเนอร์ทั้งหมด (API รันในโหมดพัฒนา คอยตรวจจับการเปลี่ยนแปลงไฟล์ผ่าน Volume Mount):
```bash
# คัดลอกและแก้ไขตัวแปรสิ่งแวดล้อม
cp .env.example .env

# สตาร์ทคอนเทนเนอร์ทั้งหมด
docker compose up -d

# หากมีการเปลี่ยนแปลงแก้ไข Package หรือต้องการ Build คอนเทนเนอร์ใหม่
docker compose up -d --build
```
ระบบจะเปิดให้บริการผ่าน Reverse Proxy ของ Nginx ที่พอร์ต HTTP ทั่วไป:
*   API Base URL: `http://localhost/api` (หรือเข้าถึงตรงได้ที่ `http://localhost:3001/api`)
*   MinIO Web Console: `http://localhost:9001`

#### B. โหมดขึ้นใช้งานจริง (Production Deploy Stack)
การนำระบบขึ้นเซิร์ฟเวอร์จริง (Production Server) ร่วมกับโค้ดหน้าบ้านที่เป็น Next.js และระบบสมาชิกนิติบุคคล:

1. สร้างคีย์ความปลอดภัย RS256 สำหรับ JWT โดยพิมพ์คำสั่งต่อไปนี้บนเครื่องเซิร์ฟเวอร์:
   ```bash
   openssl genrsa -out jwt_private.pem 2048
   openssl rsa -in jwt_private.pem -pubout -out jwt_public.pem
   export JWT_PRIVATE_KEY_BASE64=$(base64 -w0 jwt_private.pem)
   export JWT_PUBLIC_KEY_BASE64=$(base64 -w0 jwt_public.pem)
   echo "JWT_PRIVATE_KEY_BASE64=$JWT_PRIVATE_KEY_BASE64"
   echo "JWT_PUBLIC_KEY_BASE64=$JWT_PUBLIC_KEY_BASE64"
   ```
2. คัดลอกไฟล์และนำเอาคีย์ความปลอดภัยที่ได้ไปใส่ไว้ในไฟล์การตั้งค่า:
   ```bash
   cp .env.deploy.example .env.deploy
   nano .env.deploy # ใส่ค่าคีย์และรหัสผ่านความปลอดภัยสูง
   ```
3. สั่ง Deploy โครงสร้างระบบ Production ทั้ง Backend (API) และ Frontend (Next.js):
   ```bash
   docker compose -f docker-compose.deploy.yml --env-file .env.deploy up -d --build
   ```

---

## 🧪 การทดสอบและตรวจสอบความถูกต้องของระบบ (Testing & Verification)

ก่อนที่จะ commit หรือผลักดันโค้ดขึ้น Git แนะนำให้รันคำสั่งเหล่านี้เพื่อตรวจสอบมาตรฐานความปลอดภัยและคุณภาพโค้ด:

```bash
# ตรวจสอบไวยากรณ์และความถูกต้องของ Prisma Schema
npx prisma validate

# ตรวจสอบ Format และความระเบียบเรียบร้อยของโค้ด (ESLint)
npm run lint

# รันการทดสอบ Unit Tests
npm test

# รันการทดสอบระบบเสมือนจริง End-to-End Tests (ต้องเปิดใช้งานฐานข้อมูลแบบ Local ก่อน)
npm run test:e2e
```

---

## 🔑 บัญชีเข้าใช้งานสำหรับทดสอบระบบ (Mock Credentials)

*   **สิทธิ์ผู้ดูแลระบบสูงสุด (Super Admin Portal Login):**
    *   **ชื่อผู้ใช้:** `superadmin`
    *   **รหัสผ่าน:** `ChangeMe-2026!`
    *   **TOTP Code (2FA ในโหมดพัฒนา):** `000000` (หรือดูรหัสจริงผ่าน authenticator app ตาม QR Code)
*   **สิทธิ์กลุ่มเจ้าหน้าที่ตรวจการ / ประชาชนทั่วไป (Tang Rat Mock Authentication Tokens):**
    *   ระบบเตรียมข้อมูล Token จำลองเพื่อนำมาทดสอบผ่านการเรียก API `POST /api/auth/tang-rat` ด้วย mToken ได้แก่:
        *   `mock-officer-1` (เจ้าหน้าที่กรมโรงงานอุตสาหกรรม - DIW)
        *   `mock-officer-3` (เจ้าหน้าที่สำนักงานมาตรฐานสินค้าเกษตรและอาหารแห่งชาติ - ACFS)
        *   `mock-officer-diw` (เจ้าหน้าที่อาวุโสกรมโรงงานอุตสาหกรรม - DIW)
        *   `mock-officer-acfs` (เจ้าหน้าที่อาวุโสสำนักงานมาตรฐานสินค้าเกษตรและอาหารแห่งชาติ - ACFS)
        *   `mock-public-owner` (ประชาชนผู้เป็นเจ้าของบริษัทจำลอง)
