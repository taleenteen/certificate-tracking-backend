# E-License Verification Platform - Deployment Guide (คู่มือการติดตั้งระบบ)

เอกสารนี้จัดทำขึ้นเพื่อแนะนำขั้นตอนการเตรียมการติดตั้งระบบ (Deployment) ทั้งสำหรับเครื่องคอมพิวเตอร์ทั่วไป (Local Development) และการนำขึ้นใช้งานจริงบนระบบคลาวด์/เซิร์ฟเวอร์ระบบปฏิบัติการ Ubuntu (Production) สำหรับโครงการ E-License Verification Platform

---

## 📂 1. โครงสร้างโฟลเดอร์หลัก (Project Directory Structure)

ในการจัดเตรียมซอร์สโค้ดเพื่อส่งต่อหรือติดตั้งบนเซิร์ฟเวอร์ จะแบ่งออกเป็น 2 ส่วนหลัก โดยหลังจากแตกไฟล์ Zip (frontend.zip และ backend.zip) จะต้องจัดวางโฟลเดอร์ให้คู่ขนานอยู่ภายใต้โฟลเดอร์หลักเดียวกันดังภาพด้านล่าง:

```text
/your-project-root-dir/
├── certificate-tracking-backend/  (โฟลเดอร์ API Backend - พัฒนาด้วย NestJS 11)
└── certificate-tracking/          (โฟลเดอร์ หน้าบ้าน Frontend - พัฒนาด้วย Next.js)
```

> ⚠️ **ข้อควรระวังสำคัญ:** การตั้งค่าการทำงานร่วมกันอัตโนมัติบนเซิร์ฟเวอร์จริง (ผ่าน Docker Compose) จะเรียกใช้โฟลเดอร์ฝั่งหน้าบ้านจากโฟลเดอร์คู่ขนาน `../certificate-tracking` ดังนั้นห้ามเปลี่ยนโครงสร้างการจัดวางเด็ดขาด

---

## ⚙️ 2. การเตรียมตัวแปรสภาพแวดล้อม (Environment Variables)

มีตัวอย่างไฟล์การตั้งค่าสภาพแวดล้อม `.env` ให้เลือกใช้งานตามความเหมาะสม 3 รูปแบบ:

1. **สำหรับรันระบบเฉพาะฐานข้อมูลและ Storage บน Docker แต่รันโค้ดหลักบนเครื่องจริง (Local):**
   * ให้คัดลอกไฟล์ฝั่ง Backend: `cp .env.local.example .env` (ไฟล์นี้จะชี้ฐานข้อมูลไปที่ `localhost:5432` และ MinIO ไปที่ `localhost:9000`)
2. **สำหรับรันแบบคอนเทนเนอร์ทั้งหมด (Docker Dev):**
   * ให้คัดลอกไฟล์ฝั่ง Backend: `cp .env.example .env` (ไฟล์นี้จะระบุฐานข้อมูลไปที่บริการย่อยภายใน `db` และ MinIO ไปที่ `minio:9000`)
3. **สำหรับระบบงานจริง (Production):**
   * ให้คัดลอกไฟล์ฝั่ง Backend: `cp .env.deploy.example .env.deploy` และนำค่าคีย์ที่เจเนอเรตใหม่กับพาสเวิร์ดมาแก้ไขในไฟล์นี้

---

## 🚀 3. คำสั่งและขั้นตอนการทำงาน (Commands)

### 📌 A. สำหรับพัฒนาระบบเครื่องคอมพิวเตอร์ทั่วไป (Local Host OS Dev)

หากต้องการพัฒนาหรือทดสอบการแก้ไขโค้ดสดบนเครื่อง Local:

**วิธีสตาร์ทแบบรวดเร็วอัตโนมัติ (One-shot Script):**
```bash
cd certificate-tracking-backend
chmod +x dev.sh
./dev.sh
```
สคริปต์นี้จะรันกระบวนการตั้งแต่ติดตั้ง npm packages, รันฐานข้อมูลบน Docker, Migrate Schema, Seed ข้อมูล และเปิด API Watch mode ให้อัตโนมัติ

**วิธีควบคุมด้วยตนเองทีละขั้นตอน:**
1. **ติดตั้ง Dependencies:**
   ```bash
   npm ci
   ```
2. **สตาร์ทเฉพาะ Database และ MinIO (ผ่าน Docker):**
   ```bash
   docker compose -f docker-compose.infra.yml up -d
   ```
3. **ตั้งค่าตารางและข้อมูลจำลองบน Database:**
   ```bash
   npx prisma migrate dev
   npm run prisma:seed
   ```
4. **เปิดใช้งาน API:**
   ```bash
   npm run start:dev
   ```
5. **สตาร์ทระบบหน้าบ้าน (Frontend - Next.js):**
   เปิด Terminal บล็อกใหม่แล้วเปลี่ยนไปที่โฟลเดอร์หน้าบ้าน:
   ```bash
   cd ../certificate-tracking
   npm install
   npm run dev
   ```

---

### 📌 B. สำหรับคอมไพล์งานจริง (Build & Run Node.js)

1. **คอมไพล์โค้ด NestJS ไปเป็น JavaScript ในโฟลเดอร์ `/dist`:**
   ```bash
   npm run build
   ```
2. **การรันคำสั่งโหมด Production:**
   ```bash
   export NODE_ENV=production
   npm run start:prod
   ```

---

### 📌 C. สำหรับการรันใช้งานจริงบนเซิร์ฟเวอร์ Ubuntu (Ubuntu Production Deployment)

สถาปัตยกรรมระบบออกแบบมาให้สร้างและจัดการ Container ผ่าน Docker Compose เพื่อการติดตั้งที่สะดวกรวดเร็ว

#### 1. เตรียมระบบและเครื่องมือล่วงหน้าบน Ubuntu:
*   ทำการติดตั้ง Docker และ Docker Compose v2 บนเครื่องเซิร์ฟเวอร์
*   ติดตั้งและตั้งค่า Nginx เพื่อควบคุมช่องทางเข้า-ออกของพอร์ต
*   เปิดพอร์ตไฟร์วอลล์ (UFW / Security Group): พอร์ต `80`, `443` และพอร์ต `9000` (สำหรับเรียกใช้ไฟล์อัปโหลดจากเบราว์เซอร์ผ่าน S3)

#### 2. เจเนอเรตคีย์เข้ารหัสแบบคู่ (RS256 Private/Public Keys)
เพื่อเพิ่มระดับการรักษาความปลอดภัยของระบบลงชื่อเข้าใช้งาน JWT ให้เจเนอเรตรหัสคีย์ Base64 บนเครื่อง Ubuntu:
```bash
# เจเนอเรต Private Key
openssl genrsa -out jwt_private.pem 2048

# สกัดเอา Public Key ออกมา
openssl rsa -in jwt_private.pem -pubout -out jwt_public.pem

# เข้ารหัสให้เป็น Base64 แบบไม่มีการแบ่งบรรทัดใหม่
export JWT_PRIVATE_KEY_BASE64=$(base64 -w0 jwt_private.pem)
export JWT_PUBLIC_KEY_BASE64=$(base64 -w0 jwt_public.pem)

# ก๊อปปี้ค่า Base64 ที่แสดงผลลัพธ์บนจอภาพไปบันทึก
echo "JWT_PRIVATE_KEY_BASE64=$JWT_PRIVATE_KEY_BASE64"
echo "JWT_PUBLIC_KEY_BASE64=$JWT_PUBLIC_KEY_BASE64"

# ลบไฟล์ pem ชั่วคราวออกจากดิสก์
rm jwt_private.pem jwt_public.pem
```

#### 3. สั่งเริ่มต้นระบบและสร้าง Docker Image
เข้าไปที่โฟลเดอร์ `certificate-tracking-backend` แล้วแก้ไขไฟล์ตัวแปรสภาพแวดล้อม:
```bash
cd certificate-tracking-backend
cp .env.deploy.example .env.deploy
nano .env.deploy
```
*แก้ไขข้อมูล IP/Domain, รหัสผ่านฐานข้อมูล/MinIO และกรอกค่าคีย์ Base64 ที่คัดลอกไว้*

สั่งเริ่มรันแอปพลิเคชันเวอร์ชันจริง:
```bash
docker compose -f docker-compose.deploy.yml --env-file .env.deploy up -d --build
```
*ระบบจะเริ่มสร้างฐานข้อมูล PostgreSQL, MinIO Storage, API หลังบ้าน และทำการดึงชุดหน้าบ้านมาคอมไพล์ใน Production container แล้วรันระบบทั้งหมดไว้ที่พื้นหลังทันที*

#### 4. เชื่อมพอร์ตเข้ากับอินเทอร์เน็ตด้วย Nginx
สร้างไฟล์สำหรับจัดเส้นทางระบบ:
```bash
sudo nano /etc/nginx/sites-available/elicense
```
ระบุการนำทางทราฟฟิกโดเมนไปยังพอร์ต `3005` (พอร์ต Frontend ของระบบ):
```nginx
server {
    listen 80;
    server_name your-domain-or-ip; # กำหนดโดเมนเนมหรือไอพีหลักของเซิร์ฟเวอร์

    client_max_body_size 20m;

    location / {
        proxy_pass         http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```
สั่งเปิดใช้งานไฟล์และรีสตาร์ทบริการ Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/elicense /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 🔑 4. บัญชีสำหรับทดสอบระบบเริ่มต้น (Mock Credentials)

เพื่อความสะดวกในระหว่างการทดสอบประสิทธิภาพการทำงานและการกรอกฟอร์ม ข้อมูล Mock ที่ระบบติดตั้งไว้แต่แรกประกอบไปด้วย:

*   **Super Admin Portal (ใช้รหัสผ่านและ TOTP):**
    *   **Username:** `superadmin`
    *   **Password:** `ChangeMe-2026!`
    *   **TOTP Code:** `000000` (ระบบข้ามการตรวจสอบจริงในโหมดพัฒนา สามารถพิมพ์ศูนย์ 6 ตัวได้เลย)
*   **ระบบตรวจสอบยืนยันตัวตนทางรัฐ (Tang Rat Authentication mToken):**
    *   `mock-inspector-1` (เจ้าหน้าที่ตรวจการพื้นที่กรุงเทพมหานคร โซน 1)
    *   `mock-public-owner` (ประชาชนทั่วไปที่เป็นสมาชิกและเจ้าของนิติบุคคลในการทดสอบพอร์ทัลสมาชิก)
