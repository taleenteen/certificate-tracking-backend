import {
  AgencyApiStatus,
  AgencyDataSource,
  AuthProvider,
  Business,
  InspectionTask,
  JuristicRole,
  License,
  LicenseStatus,
  PrismaClient,
  ProfileChannel,
  ReportResult,
  SyncStatus,
  TaskStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const adminPassword = 'ChangeMe-2026!';
const mockBucket = process.env.MINIO_BUCKET ?? 'elicense-private';
const mockStorage = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
  region: process.env.MINIO_REGION ?? 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'elicense',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'change-me',
  },
});

const normalizeCitizenId = (raw: string) => raw.replace(/[\s-]/g, '');

const isValidThaiCitizenId = (raw: string) => {
  const normalized = normalizeCitizenId(raw);
  if (!/^\d{13}$/.test(normalized)) return false;
  const digits = normalized.split('').map(Number);
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += digits[index] * (13 - index);
  }
  const check = (11 - (sum % 11)) % 10;
  return check === digits[12];
};

const storeCitizenId = (raw: string) => {
  const normalized = normalizeCitizenId(raw);
  if (!isValidThaiCitizenId(raw)) {
    throw new Error('Invalid Thai citizen ID (checksum failed)');
  }
  return normalized;
};

const last4 = (raw: string) => normalizeCitizenId(raw).slice(-4);

const addDays = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

async function ensureMockBucket() {
  try {
    await mockStorage.send(new HeadBucketCommand({ Bucket: mockBucket }));
  } catch {
    await mockStorage.send(new CreateBucketCommand({ Bucket: mockBucket }));
  }
}

async function attachMockCertificate(licenseId: string, fileName: string) {
  const filePath = resolve(process.cwd(), 'src/assets/pdf', fileName);
  const body = readFileSync(filePath);
  const objectKey = `mock-license-certificates/${fileName}`;
  await mockStorage.send(
    new PutObjectCommand({
      Bucket: mockBucket,
      Key: objectKey,
      Body: body,
      ContentType: 'application/pdf',
    }),
  );
  await prisma.licenseDocument.create({
    data: {
      licenseId,
      docType: 'LICENSE_CERTIFICATE',
      fileName,
      objectKey,
      mimeType: 'application/pdf',
      fileSizeBytes: body.length,
    },
  });
}

async function resetDatabase() {
  await prisma.$transaction(async (tx) => {
    await tx.licenseDocumentExportItem.deleteMany();
    await tx.licenseDocumentExport.deleteMany();
    await tx.licenseDocument.deleteMany();
    await tx.officerInspectionEvidence.deleteMany();
    await tx.officerInspectionItem.deleteMany();
    await tx.officerPublicProfileScanLog.deleteMany();
    await tx.officerInspection.deleteMany();
    await tx.notification.deleteMany();
    await tx.auditLog.deleteMany();
    await tx.inspectionReport.deleteMany();
    await tx.inspectionTask.deleteMany();
    await tx.checklistTemplate.deleteMany();
    await tx.license.deleteMany();
    await tx.business.deleteMany();
    await tx.passwordResetToken.deleteMany();
    await tx.userSession.deleteMany();
    await tx.authProviderLink.deleteMany();
    await tx.syncLog.deleteMany();
    await tx.accountLinkChallenge.deleteMany();
    await tx.juristicJoinRequest.deleteMany();
    await tx.juristicInvite.deleteMany();
    await tx.juristicMember.deleteMany();
    await tx.systemUser.deleteMany();
    await tx.juristicPerson.deleteMany();
    await tx.licenseType.deleteMany();
    await tx.agency.deleteMany();
  });
}

async function main() {
  // Production guard: seeding wipes the DB via resetDatabase(). Refuse in
  // production UNLESS explicitly opted in with ALLOW_SEED=true. The Docker
  // entrypoint additionally only runs the seed when system_users is empty,
  // so this combination only ever seeds a truly fresh database.
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_SEED !== 'true'
  ) {
    throw new Error(
      'Refusing to seed production (set ALLOW_SEED=true to override)',
    );
  }

  await resetDatabase();

  const [diwAgency, acfsAgency, dbdAgency, fdaAgency] = await Promise.all([
    prisma.agency.create({
      data: {
        code: 'DIW',
        nameTh: 'กรมโรงงานอุตสาหกรรม',
        nameEn: 'Department of Industrial Works',
        dataSource: AgencyDataSource.MANUAL_IMPORT,
        apiStatus: AgencyApiStatus.MANUAL,
      },
    }),
    prisma.agency.create({
      data: {
        code: 'ACFS',
        nameTh: 'สำนักงานมาตรฐานสินค้าเกษตรและอาหารแห่งชาติ',
        nameEn: 'National Bureau of Agricultural Commodity and Food Standards',
        dataSource: AgencyDataSource.API,
        apiStatus: AgencyApiStatus.CONNECTED,
      },
    }),
    prisma.agency.create({
      data: {
        code: 'DBD',
        nameTh: 'กรมพัฒนาธุรกิจการค้า',
        nameEn: 'Department of Business Development',
        dataSource: AgencyDataSource.MANUAL_IMPORT,
        apiStatus: AgencyApiStatus.MANUAL,
      },
    }),
    prisma.agency.create({
      data: {
        code: 'FDA',
        nameTh: 'สำนักงานคณะกรรมการอาหารและยา',
        nameEn: 'Food and Drug Administration',
        dataSource: AgencyDataSource.MANUAL_IMPORT,
        apiStatus: AgencyApiStatus.DISCONNECTED,
      },
    }),
  ]);

  const licenseTypes = await Promise.all([
    prisma.licenseType.create({
      data: {
        code: 'RNG4',
        nameTh: 'ใบอนุญาตประกอบกิจการโรงงาน ร.ง.4',
        nameEn: 'Factory Operation License',
        agencyId: diwAgency.id,
        validityYears: 1,
        feeThb: 500,
        renewalFeeThb: 500,
        suspendedOnNonpayment: true,
        prerequisiteTypeIds: [],
        requiredDocuments: [
          { code: 'FACTORY_PLAN', name: 'แผนผังโรงงาน', required: true },
        ],
      },
    }),
    prisma.licenseType.create({
      data: {
        code: 'HAZMAT',
        nameTh: 'ใบอนุญาตวัตถุอันตราย',
        nameEn: 'Hazardous Substance License',
        agencyId: diwAgency.id,
        validityYears: 3,
        feeThb: 3000,
        prerequisiteTypeIds: [],
      },
    }),
    ...[
      ['ACFS_PRODUCER', 'ใบอนุญาตเป็นผู้ผลิตสินค้าเกษตร', 3],
      ['ACFS_EXPORTER', 'ใบอนุญาตเป็นผู้ส่งออกสินค้าเกษตร', 3],
      ['ACFS_IMPORTER', 'ใบอนุญาตเป็นผู้นำเข้าสินค้าเกษตร', 3],
      ['ACFS_MANDATORY', 'ใบอนุญาตมาตรฐานบังคับ', 1],
      ['ACFS_GENERAL', 'ใบรับรองมาตรฐานทั่วไป', 1],
      ['ACFS_GAP_HACCP', 'ใบรับรอง GAP/HACCP', 3],
    ].map(([code, nameTh, validityYears]) =>
      prisma.licenseType.create({
        data: {
          code: String(code),
          nameTh: String(nameTh),
          agencyId: acfsAgency.id,
          validityYears: Number(validityYears),
          prerequisiteTypeIds: [],
        },
      }),
    ),
    prisma.licenseType.create({
      data: {
        code: 'DBD_COMMERCE',
        nameTh: 'ใบอนุญาตประกอบธุรกิจ',
        nameEn: 'Business Operation License',
        agencyId: dbdAgency.id,
        validityYears: 3,
        feeThb: 1000,
        prerequisiteTypeIds: [],
      },
    }),
    prisma.licenseType.create({
      data: {
        code: 'DBD_ECOMMERCE',
        nameTh: 'ใบอนุญาตพาณิชย์อิเล็กทรอนิกส์',
        nameEn: 'E-Commerce License',
        agencyId: dbdAgency.id,
        validityYears: 1,
        feeThb: 500,
        prerequisiteTypeIds: [],
      },
    }),
    prisma.licenseType.create({
      data: {
        code: 'FDA_FOOD',
        nameTh: 'ใบอนุญาตผลิตอาหาร',
        nameEn: 'Food Production License',
        agencyId: fdaAgency.id,
        validityYears: 2,
        feeThb: 2000,
        prerequisiteTypeIds: [],
      },
    }),
    prisma.licenseType.create({
      data: {
        code: 'FDA_DRUG',
        nameTh: 'ใบอนุญาตขายยา',
        nameEn: 'Drug Sales License',
        agencyId: fdaAgency.id,
        validityYears: 1,
        feeThb: 1500,
        prerequisiteTypeIds: [],
      },
    }),
  ]);

  const locationSpecs = [
    ['กรุงเทพมหานคร', 13.7563, 100.5018],
    ['เชียงใหม่', 18.7883, 98.9853],
    ['ชลบุรี', 13.3611, 100.9847],
    ['ขอนแก่น', 16.4419, 102.8359],
    ['สงขลา', 7.1898, 100.5954],
    ['นครราชสีมา', 14.9799, 102.0978],
  ] as const;

  const users = await Promise.all([
    prisma.systemUser.create({
      data: {
        username: 'superadmin',
        passwordHash: await bcrypt.hash(adminPassword, 12),
        fullName: 'ผู้ดูแลระบบสูงสุด',
        roles: ['super_admin'],
        totpSecret: 'JBSWY3DPEHPK3PXP',
        mustChangePassword: false,
      },
    }),
    prisma.systemUser.create({
      data: {
        username: 'officer-diw',
        fullName: 'เจ้าหน้าที่อาวุโส DIW',
        roles: ['officer'],
        agencyId: diwAgency.id,
      },
    }),
    prisma.systemUser.create({
      data: {
        username: 'officer-acfs',
        fullName: 'เจ้าหน้าที่อาวุโส ACFS',
        roles: ['officer'],
        agencyId: acfsAgency.id,
      },
    }),
    prisma.systemUser.create({
      data: {
        username: 'officer-1',
        fullName: 'เจ้าหน้าที่ DIW หนึ่ง',
        roles: ['officer'],
        agencyId: diwAgency.id,
      },
    }),
    prisma.systemUser.create({
      data: {
        username: 'officer-2',
        fullName: 'เจ้าหน้าที่ DIW สอง',
        roles: ['officer'],
        agencyId: diwAgency.id,
      },
    }),
    prisma.systemUser.create({
      data: {
        username: 'officer-3',
        fullName: 'เจ้าหน้าที่ ACFS หนึ่ง',
        roles: ['officer'],
        agencyId: acfsAgency.id,
      },
    }),
    prisma.systemUser.create({
      data: {
        username: 'officer-4',
        fullName: 'เจ้าหน้าที่ ACFS สอง',
        roles: ['officer'],
        agencyId: acfsAgency.id,
      },
    }),
    prisma.systemUser.create({
      data: {
        username: 'public-owner',
        passwordHash: await bcrypt.hash('password', 12),
        fullName: 'เจ้าของกิจการตัวอย่าง',
        roles: ['public'],
      },
    }),
    // D7: join-requester has a verified citizenId but no memberships
    prisma.systemUser.create({
      data: {
        username: 'join-requester',
        fullName: 'ผู้ขอเข้าร่วมบริษัท',
        roles: ['public'],
        primaryChannel: ProfileChannel.tang_rat,
      },
    }),
  ]);
  const [
    admin,
    diwOfficerSr,
    acfsOfficerSr,
    diwOfficer1,
    diwOfficer2,
    acfsOfficer1,
    acfsOfficer2,
    publicOwner,
    joinRequester,
  ] = users;

  const officerLogin = await prisma.systemUser.create({
    data: {
      username: 'officer-login',
      passwordHash: await bcrypt.hash('password', 12),
      fullName: 'เจ้าหน้าที่ DIW (Login)',
      roles: ['officer'],
      agencyId: diwAgency.id,
    },
  });

  // A plain ADMIN account (below super_admin) for testing the role hierarchy.
  // Admins can assign officer roles but not create other admins.
  await prisma.systemUser.create({
    data: {
      username: 'admin',
      passwordHash: await bcrypt.hash(adminPassword, 12),
      fullName: 'ผู้ดูแลระบบ',
      roles: ['admin'],
      agencyId: diwAgency.id,
      totpSecret: 'JBSWY3DPEHPK3PXP',
      mustChangePassword: false,
    },
  });

  // D5: assign verified citizen data (Tang Rat primary) to all non-admin-tier users
  // that will receive tang_rat provider links. Use crypto helpers so hashes are
  // reproducible with the dev pepper and only valid IDs are stored. Admin tier
  // never gets citizen identity (D3 + D5).
  const candidateCitizenIds = [
    '1000003703701',
    '1000016049371',
    '1000028395041',
    '1000033333309',
    '1000046913546',
    '1000050617247',
    '1000065432051',
    '1000069135752',
  ]; // pre-validated with isValidThaiCitizenId (Tang Rat primary for D5)

  const tangUsers = [
    diwOfficerSr,
    acfsOfficerSr,
    diwOfficer1,
    diwOfficer2,
    acfsOfficer1,
    acfsOfficer2,
    publicOwner,
    joinRequester,
  ];
  for (let i = 0; i < tangUsers.length; i++) {
    const u = tangUsers[i];
    const cid = candidateCitizenIds[i % candidateCitizenIds.length];
    if (cid) {
      // Store as plaintext (owner decision 2026-06-15): searchability + gov integration.
      // Security via TDE + RBAC + audit (no irreversible hash).
      await prisma.systemUser.update({
        where: { id: u.id },
        data: {
          citizenId: storeCitizenId(cid),
          citizenIdVerifiedAt: new Date(),
          citizenIdLast4: last4(cid),
          primaryChannel: ProfileChannel.tang_rat,
        },
      });
    }
  }

  const juristicPersons = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      prisma.juristicPerson.create({
        data: {
          registrationId: `010556${String(index + 1).padStart(7, '0')}`,
          nameTh: `บริษัท ตัวอย่าง ${index + 1} จำกัด`,
          nameEn: `Mock Company ${index + 1} Co., Ltd.`,
          juristicType: 'บริษัทจำกัด',
          address: `${index + 1} ถนนตัวอย่าง`,
        },
      }),
    ),
  );

  const certificateJuristicPersons = await Promise.all(
    [
      {
        registrationId: '0105559000001',
        nameTh: 'บริษัท กัลฟ์ ผลิต จำกัด',
        nameEn: 'Gulf Production Company Limited',
        address:
          '87 อาคารเอ็มไทย ทาวเวอร์ ออลซีซั่น เพลส ชั้น 11 ถนนวิทยุ กรุงเทพมหานคร',
      },
      {
        registrationId: '0105549000002',
        nameTh: 'บริษัท ทีทีที เอาซี่ เคมิคอล จำกัด',
        nameEn: 'TTT Aussie Chemical Company Limited',
        address: '8 หมู่ 3-1 ตำบลห้วยโป่ง อำเภอเมืองระยอง จังหวัดระยอง 21150',
      },
      {
        registrationId: '0105559000003',
        nameTh: 'บริษัท โรงงานแม่รวย จำกัด',
        nameEn: 'Mae-Ruay Snack Food Factory Company Limited',
        address:
          '11/1-11/2 ถนนบางขุนเทียน-ชายทะเล แขวงแสมดำ เขตบางขุนเทียน กรุงเทพมหานคร 10150',
      },
      {
        registrationId: '0105559000004',
        nameTh: 'บริษัท ไร่ธัญญะ จำกัด',
        nameEn: 'Thanya Farm Company Limited',
        address:
          '62/3, 62/5 หมู่ 3 ตำบลบางใหญ่ อำเภอบางใหญ่ จังหวัดนนทบุรี 11140',
      },
      {
        registrationId: '0105559000005',
        nameTh: 'บริษัท เอ็ม.อาร์.เจ.ฟู้ดส์ จำกัด',
        nameEn: 'M.R.J. Food Company Limited',
        address:
          '24/27 ถนนพระราม 2 หมู่ 1 ตำบลบางน้ำจืด อำเภอเมืองสมุทรสาคร จังหวัดสมุทรสาคร 74000',
      },
    ].map((company) =>
      prisma.juristicPerson.create({
        data: { ...company, juristicType: 'บริษัทจำกัด' },
      }),
    ),
  );

  const additionalCertificateJuristicPersons = await Promise.all(
    [
      {
        registrationId: '0105559000006',
        nameTh: 'บริษัท ขนมสากล จำกัด',
        nameEn: 'Kanom Sakol Company Limited',
        address:
          '43 ชั้น 3 ซอยสุขุมวิท 51 ถนนสุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร 10110',
      },
      {
        registrationId: '0105559000007',
        nameTh: 'บริษัท ชัยศิริ คอมมอดิทิ จำกัด',
        nameEn: 'Chaisiri Commodity Company Limited',
        address: '447 หมู่ 2 ตำบลแม่ตาว อำเภอแม่สอด จังหวัดตาก 63110',
      },
      {
        registrationId: '0105559000008',
        nameTh: 'บริษัท เฮอริเทจ สแน็ค แอนด์ ฟู้ด จำกัด',
        nameEn: 'Heritage Snacks and Food Company Limited',
        address:
          '34/1-34/2 ซอยกระทุ่มล้ม 31 ถนนพุทธมณฑลสาย 4 ตำบลกระทุ่มล้ม อำเภอสามพราน จังหวัดนครปฐม 73220',
      },
      {
        registrationId: '0105559000009',
        nameTh: 'บริษัท อุตสาหกรรมอาหารไทย (1964) จำกัด',
        nameEn: 'Thai Food Industry (1964) Company Limited',
        address:
          '50 ซอยเพชรเกษม 48 แยก 16-2 แขวงบางด้วน เขตภาษีเจริญ กรุงเทพมหานคร 10160',
      },
      {
        registrationId: '0105559000010',
        nameTh: 'บริษัท แม่รวยการเกษตร (โก๋แก่) จำกัด',
        nameEn: 'Mae Ruay Agriculture (Koh-Kae) Company Limited',
        address: '359 หมู่ 1 ตำบลห้วยยาง อำเภอเมืองสกลนคร จังหวัดสกลนคร 47000',
      },
    ].map((company) =>
      prisma.juristicPerson.create({
        data: { ...company, juristicType: 'บริษัทจำกัด' },
      }),
    ),
  );

  // D6: give publicOwner OWNER on company[0] and ADMIN on company[1]
  // so context-switching is demonstrable with one user across two companies.
  await prisma.juristicMember.createMany({
    data: [
      {
        juristicPersonId: juristicPersons[0].id,
        userId: publicOwner.id,
        role: JuristicRole.OWNER,
        position: 'กรรมการผู้จัดการ',
        isActive: true,
      },
      {
        juristicPersonId: juristicPersons[1].id,
        userId: publicOwner.id,
        role: JuristicRole.ADMIN,
        position: 'Compliance Officer',
        isActive: true,
      },
    ],
  });

  const businesses: Business[] = [];
  const certificateBusinesses = await Promise.all(
    [
      {
        nameTh: 'โรงไฟฟ้าปลวกแดง',
        address: 'หมู่ 1, 2, 5 ตำบลมาบยางพร อำเภอปลวกแดง จังหวัดระยอง',
        province: 'ระยอง',
        latitude: 12.994,
        longitude: 101.174,
        phone: '023456789',
      },
      {
        nameTh: 'บริษัท ทีทีที เอาซี่ เคมิคอล จำกัด',
        address: '8 หมู่ 3-1 ตำบลห้วยโป่ง อำเภอเมืองระยอง จังหวัดระยอง 21150',
        province: 'ระยอง',
        latitude: 12.694,
        longitude: 101.181,
        phone: '038974800',
      },
      {
        nameTh: 'บริษัท โรงงานแม่รวย จำกัด',
        address:
          '11/1-11/2 ถนนบางขุนเทียน-ชายทะเล แขวงแสมดำ เขตบางขุนเทียน กรุงเทพมหานคร 10150',
        province: 'กรุงเทพมหานคร',
        latitude: 13.664,
        longitude: 100.451,
        phone: '024160000',
      },
      {
        nameTh: 'บริษัท ไร่ธัญญะ จำกัด',
        address:
          '62/3, 62/5 หมู่ 3 ตำบลบางใหญ่ อำเภอบางใหญ่ จังหวัดนนทบุรี 11140',
        province: 'นนทบุรี',
        latitude: 13.855,
        longitude: 100.409,
        phone: '024030000',
      },
      {
        nameTh: 'บริษัท เอ็ม.อาร์.เจ.ฟู้ดส์ จำกัด',
        address:
          '24/27 ถนนพระราม 2 หมู่ 1 ตำบลบางน้ำจืด อำเภอเมืองสมุทรสาคร จังหวัดสมุทรสาคร 74000',
        province: 'สมุทรสาคร',
        latitude: 13.578,
        longitude: 100.279,
        phone: '034410000',
      },
    ].map((business, index) =>
      prisma.business.create({
        data: {
          ...business,
          juristicPersonId: certificateJuristicPersons[index].id,
          geocodedAt: new Date(),
        },
      }),
    ),
  );
  const additionalCertificateBusinesses = await Promise.all(
    [
      {
        nameTh: 'บริษัท ขนมสากล จำกัด',
        address:
          '43 ชั้น 3 ซอยสุขุมวิท 51 ถนนสุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร 10110',
        province: 'กรุงเทพมหานคร',
        latitude: 13.733,
        longitude: 100.579,
        phone: '022610000',
      },
      {
        nameTh: 'บริษัท ชัยศิริ คอมมอดิทิ จำกัด',
        address: '447 หมู่ 2 ตำบลแม่ตาว อำเภอแม่สอด จังหวัดตาก 63110',
        province: 'ตาก',
        latitude: 16.718,
        longitude: 98.574,
        phone: '055510000',
      },
      {
        nameTh: 'บริษัท เฮอริเทจ สแน็ค แอนด์ ฟู้ด จำกัด',
        address:
          '34/1-34/2 ซอยกระทุ่มล้ม 31 ถนนพุทธมณฑลสาย 4 ตำบลกระทุ่มล้ม อำเภอสามพราน จังหวัดนครปฐม 73220',
        province: 'นครปฐม',
        latitude: 13.718,
        longitude: 100.261,
        phone: '024200000',
      },
      {
        nameTh: 'บริษัท อุตสาหกรรมอาหารไทย (1964) จำกัด',
        address:
          '50 ซอยเพชรเกษม 48 แยก 16-2 แขวงบางด้วน เขตภาษีเจริญ กรุงเทพมหานคร 10160',
        province: 'กรุงเทพมหานคร',
        latitude: 13.717,
        longitude: 100.449,
        phone: '024570000',
      },
      {
        nameTh: 'บริษัท แม่รวยการเกษตร (โก๋แก่) จำกัด',
        address: '359 หมู่ 1 ตำบลห้วยยาง อำเภอเมืองสกลนคร จังหวัดสกลนคร 47000',
        province: 'สกลนคร',
        latitude: 17.159,
        longitude: 104.147,
        phone: '042710000',
      },
    ].map((business, index) =>
      prisma.business.create({
        data: {
          ...business,
          juristicPersonId: additionalCertificateJuristicPersons[index].id,
          geocodedAt: new Date(),
        },
      }),
    ),
  );
  businesses.push(...certificateBusinesses);
  businesses.push(...additionalCertificateBusinesses);
  const genericBusinesses: Business[] = [];
  for (let index = 0; index < 20; index += 1) {
    const locationIndex = index % locationSpecs.length;
    const [province, lat, lng] = locationSpecs[locationIndex];
    const business = await prisma.business.create({
      data: {
        nameTh: `สถานประกอบการตัวอย่าง ${index + 1}`,
        juristicPersonId: juristicPersons[index % juristicPersons.length].id,
        ownerUserId: index === 0 ? publicOwner.id : null,
        address: `${100 + index} ถนนอุตสาหกรรม จังหวัด${province}`,
        province,
        latitude: lat + index * 0.001,
        longitude: lng + index * 0.001,
        geocodedAt: new Date(),
        phone: `02${String(1000000 + index).padStart(7, '0')}`,
      },
    });
    businesses.push(business);
    genericBusinesses.push(business);
  }

  const officerBusiness = await prisma.business.create({
    data: {
      nameTh: 'สถานประกอบการเจ้าหน้าที่ (DIW)',
      juristicPersonId: juristicPersons[0].id,
      ownerUserId: officerLogin.id,
      address: '999 ถนนอุตสาหกรรม จังหวัดกรุงเทพมหานคร',
      province: 'กรุงเทพมหานคร',
      latitude: 13.7563,
      longitude: 100.5018,
      geocodedAt: new Date(),
      phone: '021234567',
    },
  });

  const statusPlan: LicenseStatus[] = [
    ...Array<LicenseStatus>(20).fill(LicenseStatus.ACTIVE),
    ...Array<LicenseStatus>(4).fill(LicenseStatus.SUSPENDED),
    ...Array<LicenseStatus>(4).fill(LicenseStatus.EXPIRED),
    LicenseStatus.ACTIVE,
    LicenseStatus.ACTIVE,
  ];
  const licenses: License[] = [];
  await ensureMockBucket();
  const certificateLicenseSpecs = [
    {
      typeCode: 'RNG4',
      businessId: certificateBusinesses[0].id,
      licenseNo: 'กกพ.J02-38/2560',
      issueDate: new Date('2017-10-02T00:00:00.000Z'),
      expireDate: null,
      status: LicenseStatus.ACTIVE,
      fileName: 'diw.pdf',
    },
    {
      typeCode: 'HAZMAT',
      businessId: certificateBusinesses[1].id,
      licenseNo: 'อก0305023003860',
      issueDate: new Date('2017-01-01T00:00:00.000Z'),
      expireDate: new Date('2019-12-31T00:00:00.000Z'),
      status: LicenseStatus.EXPIRED,
      fileName: 'danger-object.pdf',
    },
    {
      typeCode: 'ACFS_PRODUCER',
      businessId: certificateBusinesses[2].id,
      licenseNo: 'ACFS47020200026',
      issueDate: new Date('2026-01-06T00:00:00.000Z'),
      expireDate: new Date('2029-01-05T00:00:00.000Z'),
      status: LicenseStatus.ACTIVE,
      fileName: 'manufacturer.pdf',
    },
    {
      typeCode: 'ACFS_EXPORTER',
      businessId: certificateBusinesses[3].id,
      licenseNo: 'ACFS47020400004',
      issueDate: new Date('2026-01-12T00:00:00.000Z'),
      expireDate: new Date('2029-01-11T00:00:00.000Z'),
      status: LicenseStatus.ACTIVE,
      fileName: 'exporter.pdf',
    },
    {
      typeCode: 'ACFS_IMPORTER',
      businessId: certificateBusinesses[4].id,
      licenseNo: 'ACFS47020600012',
      issueDate: new Date('2026-01-06T00:00:00.000Z'),
      expireDate: new Date('2029-01-05T00:00:00.000Z'),
      status: LicenseStatus.ACTIVE,
      fileName: 'importer.pdf',
    },
    {
      typeCode: 'ACFS_IMPORTER',
      businessId: additionalCertificateBusinesses[0].id,
      licenseNo: 'ACFS47020600021',
      issueDate: new Date('2026-01-06T00:00:00.000Z'),
      expireDate: new Date('2029-01-05T00:00:00.000Z'),
      status: LicenseStatus.ACTIVE,
      fileName: 'morgorsor-6-1.pdf',
    },
    {
      typeCode: 'ACFS_IMPORTER',
      businessId: certificateBusinesses[2].id,
      licenseNo: 'ACFS47020600022',
      issueDate: new Date('2026-01-06T00:00:00.000Z'),
      expireDate: new Date('2029-01-05T00:00:00.000Z'),
      status: LicenseStatus.ACTIVE,
      fileName: 'morgorsor-6-2.pdf',
    },
    {
      typeCode: 'ACFS_IMPORTER',
      businessId: additionalCertificateBusinesses[1].id,
      licenseNo: 'ACFS47020600023',
      issueDate: new Date('2026-01-06T00:00:00.000Z'),
      expireDate: new Date('2029-01-05T00:00:00.000Z'),
      status: LicenseStatus.ACTIVE,
      fileName: 'morgorsor-6-3.pdf',
    },
    {
      typeCode: 'ACFS_PRODUCER',
      businessId: certificateBusinesses[3].id,
      licenseNo: 'ACFS47020200027',
      issueDate: new Date('2026-01-06T00:00:00.000Z'),
      expireDate: new Date('2029-01-05T00:00:00.000Z'),
      status: LicenseStatus.ACTIVE,
      fileName: 'morgorsor2-1.pdf',
    },
    {
      typeCode: 'ACFS_PRODUCER',
      businessId: additionalCertificateBusinesses[2].id,
      licenseNo: 'ACFS47020200030',
      issueDate: new Date('2026-01-06T00:00:00.000Z'),
      expireDate: new Date('2029-01-05T00:00:00.000Z'),
      status: LicenseStatus.ACTIVE,
      fileName: 'morgorsor2-2.pdf',
    },
    {
      typeCode: 'ACFS_PRODUCER',
      businessId: additionalCertificateBusinesses[3].id,
      licenseNo: 'ACFS47020200033',
      issueDate: new Date('2026-01-06T00:00:00.000Z'),
      expireDate: new Date('2029-01-05T00:00:00.000Z'),
      status: LicenseStatus.ACTIVE,
      fileName: 'morgorsor2-3.pdf',
    },
    {
      typeCode: 'ACFS_PRODUCER',
      businessId: additionalCertificateBusinesses[4].id,
      licenseNo: 'ACFS47020200034',
      issueDate: new Date('2023-01-06T00:00:00.000Z'),
      expireDate: new Date('2026-01-05T00:00:00.000Z'),
      status: LicenseStatus.EXPIRED,
      fileName: 'morgorsor2-4.pdf',
    },
  ];
  for (const spec of certificateLicenseSpecs) {
    const licenseType = licenseTypes.find(
      (type) => type.code === spec.typeCode,
    );
    if (!licenseType) throw new Error(`Missing license type ${spec.typeCode}`);
    const license = await prisma.license.create({
      data: {
        licenseNo: spec.licenseNo,
        businessId: spec.businessId,
        licenseTypeId: licenseType.id,
        status: spec.status,
        issueDate: spec.issueDate,
        expireDate: spec.expireDate,
      },
    });
    licenses.push(license);
    await attachMockCertificate(license.id, spec.fileName);
  }
  for (let index = 0; index < 30; index += 1) {
    const type = licenseTypes[index % licenseTypes.length];
    const isRng4 = type.code === 'RNG4';
    const status = statusPlan[index];
    const issueDate = addDays(-365 - index * 10);
    const expireDate = isRng4
      ? null
      : index === 28
        ? addDays(15)
        : index === 29
          ? addDays(25)
          : status === LicenseStatus.EXPIRED
            ? addDays(-30 - index)
            : addDays(type.validityYears * 365);
    licenses.push(
      await prisma.license.create({
        data: {
          licenseNo: `${type.code}-${String(index + 1).padStart(5, '0')}`,
          businessId: genericBusinesses[index % genericBusinesses.length].id,
          licenseTypeId: type.id,
          status,
          issueDate,
          expireDate,
          suspendedAt: status === LicenseStatus.SUSPENDED ? addDays(-10) : null,
          suspensionReason:
            status === LicenseStatus.SUSPENDED
              ? isRng4 && index === 20
                ? 'MOCK_OVERDUE'
                : 'ระงับชั่วคราวเพื่อทดสอบระบบ'
              : null,
        },
      }),
    );
  }

  const officerLicenseStatuses: LicenseStatus[] = [
    ...Array<LicenseStatus>(9).fill(LicenseStatus.ACTIVE),
    ...Array<LicenseStatus>(3).fill(LicenseStatus.SUSPENDED),
    ...Array<LicenseStatus>(2).fill(LicenseStatus.EXPIRED),
    LicenseStatus.PENDING,
  ];
  const officerLicenses: License[] = [];
  for (let i = 0; i < 15; i++) {
    const type = licenseTypes[i % licenseTypes.length];
    const isRng4 = type.code === 'RNG4';
    const status = officerLicenseStatuses[i];
    const issueDate = addDays(-300 - i * 15);
    const expireDate = isRng4
      ? null
      : i === 13
        ? addDays(10)
        : i === 14
          ? addDays(22)
          : status === LicenseStatus.EXPIRED
            ? addDays(-30 - i)
            : addDays(type.validityYears * 365);
    officerLicenses.push(
      await prisma.license.create({
        data: {
          licenseNo: `OFC-${type.code}-${String(i + 1).padStart(4, '0')}`,
          businessId: officerBusiness.id,
          licenseTypeId: type.id,
          status,
          issueDate,
          expireDate,
          suspendedAt: status === LicenseStatus.SUSPENDED ? addDays(-5) : null,
          suspensionReason:
            status === LicenseStatus.SUSPENDED
              ? 'ระงับชั่วคราวเพื่อทดสอบระบบ'
              : null,
        },
      }),
    );
  }

  const diwChecklist = await prisma.checklistTemplate.create({
    data: {
      licenseTypeId: licenseTypes[0].id,
      nameTh: 'แบบตรวจโรงงาน DIW',
      passingScore: 70,
      items: Array.from({ length: 8 }, (_, index) => ({
        no: index + 1,
        question_th: `รายการตรวจโรงงานข้อ ${index + 1}`,
        weight: index < 4 ? 13 : 12,
        required: true,
      })),
    },
  });
  const acfsChecklist = await prisma.checklistTemplate.create({
    data: {
      licenseTypeId: licenseTypes.find(
        (type) => type.code === 'ACFS_GAP_HACCP',
      )!.id,
      nameTh: 'แบบตรวจ GAP/HACCP',
      passingScore: 70,
      items: Array.from({ length: 6 }, (_, index) => ({
        no: index + 1,
        question_th: `รายการตรวจมาตรฐานข้อ ${index + 1}`,
        weight: index < 4 ? 17 : 16,
        required: true,
      })),
    },
  });

  const taskStatuses = [
    TaskStatus.ASSIGNED,
    TaskStatus.ASSIGNED,
    TaskStatus.ASSIGNED,
    TaskStatus.IN_PROGRESS,
    TaskStatus.IN_PROGRESS,
    TaskStatus.PENDING_REVIEW,
    TaskStatus.PENDING_REVIEW,
    TaskStatus.APPROVED,
    TaskStatus.APPROVED,
    TaskStatus.RETURNED,
  ];
  const tasks: InspectionTask[] = [];
  for (let index = 0; index < taskStatuses.length; index += 1) {
    const isDiw = index % 2 === 0;
    const assignee = isDiw ? diwOfficer1 : acfsOfficer1;
    const creator = isDiw ? diwOfficerSr : acfsOfficerSr;
    const business = isDiw ? businesses[0] : businesses[3];
    tasks.push(
      await prisma.inspectionTask.create({
        data: {
          taskNo: `T-${new Date().getFullYear()}-${String(index + 1).padStart(4, '0')}`,
          businessId: business.id,
          licenseId: licenses.find(
            (license) => license.businessId === business.id,
          )?.id,
          assignedTo: assignee.id,
          createdBy: creator.id,
          status: taskStatuses[index],
          dueDate: addDays(7 + index),
          startedAt:
            taskStatuses[index] === TaskStatus.ASSIGNED ? null : addDays(-3),
          completedAt:
            taskStatuses[index] === TaskStatus.APPROVED ? addDays(-1) : null,
        },
      }),
    );
  }

  // Inspection tasks for officer-login's licenses so the inspection page works
  const officerTaskSpecs: { licenseIdx: number; status: TaskStatus }[] = [
    { licenseIdx: 0, status: TaskStatus.ASSIGNED },
    { licenseIdx: 1, status: TaskStatus.IN_PROGRESS },
    { licenseIdx: 2, status: TaskStatus.PENDING_REVIEW },
    { licenseIdx: 3, status: TaskStatus.APPROVED },
    { licenseIdx: 4, status: TaskStatus.RETURNED },
  ];
  for (let i = 0; i < officerTaskSpecs.length; i++) {
    const { licenseIdx, status } = officerTaskSpecs[i];
    tasks.push(
      await prisma.inspectionTask.create({
        data: {
          taskNo: `T-${new Date().getFullYear()}-${String(taskStatuses.length + i + 1).padStart(4, '0')}`,
          businessId: officerBusiness.id,
          licenseId: officerLicenses[licenseIdx]?.id,
          assignedTo: officerLogin.id,
          createdBy: diwOfficerSr.id,
          status,
          dueDate: addDays(14 + i),
          startedAt: status === TaskStatus.ASSIGNED ? null : addDays(-5),
          completedAt: status === TaskStatus.APPROVED ? addDays(-1) : null,
        },
      }),
    );
  }

  for (let index = 3; index < tasks.length; index += 1) {
    const submitted = tasks[index].status !== TaskStatus.IN_PROGRESS;
    const reviewed = (
      [TaskStatus.APPROVED, TaskStatus.RETURNED] as TaskStatus[]
    ).includes(tasks[index].status);
    await prisma.inspectionReport.create({
      data: {
        taskId: tasks[index].id,
        inspectorId: tasks[index].assignedTo!,
        checklistTemplateId:
          index % 2 === 0 ? diwChecklist.id : acfsChecklist.id,
        result: submitted
          ? index === 6
            ? ReportResult.FAILED
            : ReportResult.PASSED
          : null,
        score: submitted ? (index === 6 ? 55 : 85) : null,
        findings: submitted
          ? [{ no: 1, answer: true, note: 'MOCK: replace in UAT' }]
          : undefined,
        summaryNote: submitted ? 'ผลการตรวจตัวอย่าง' : null,
        isDraft: !submitted,
        submittedAt: submitted ? addDays(-2) : null,
        reviewComment:
          tasks[index].status === TaskStatus.RETURNED
            ? 'กรุณาแนบหลักฐานเพิ่มเติม'
            : null,
        reviewedBy: reviewed ? tasks[index].createdBy : null,
        reviewedAt: reviewed ? addDays(-1) : null,
      },
    });
  }

  await prisma.authProviderLink.createMany({
    data: users.slice(1).map((user, idx) => ({
      userId: user.id,
      provider: AuthProvider.tang_rat,
      providerSub: `mock-sub-${user.username}`,
      providerName: user.fullName,
      providerPhone: `08${String(10000000 + idx).padStart(8, '0')}`,
      verifiedAt: new Date(),
    })),
  });

  await prisma.notification.createMany({
    data: [
      {
        recipientId: diwOfficer1.id,
        type: 'TASK_ASSIGNED',
        titleTh: 'ได้รับมอบหมายงานตรวจ',
        bodyTh: `งาน ${tasks[0].taskNo}`,
        refType: 'inspection_tasks',
        refId: tasks[0].id,
      },
      {
        recipientId: acfsOfficer1.id,
        type: 'REPORT_RETURNED',
        titleTh: 'รายงานถูกส่งกลับ',
        bodyTh: 'กรุณาแก้ไขรายงานและส่งใหม่',
        refType: 'inspection_reports',
      },
    ],
  });

  await prisma.syncLog.createMany({
    data: [
      {
        agencyId: acfsAgency.id,
        triggeredBy: acfsOfficerSr.id,
        status: SyncStatus.SUCCESS,
        recordsUpdated: 5,
        startedAt: addDays(-1),
        finishedAt: addDays(-1),
      },
      {
        agencyId: diwAgency.id,
        triggeredBy: admin.id,
        status: SyncStatus.FAILED,
        errorMessage: 'DIW API not available — use CSV import',
        startedAt: addDays(-1),
        finishedAt: addDays(-1),
      },
    ],
  });

  console.log('MOCK seed complete');
  console.log(
    `Super Admin: superadmin / ${adminPassword} / TOTP 000000 (development only)`,
  );
  console.log(
    `Admin:       admin / ${adminPassword} / TOTP 000000 (development only)`,
  );
  console.log(
    'mTokens: mock-officer-1, mock-officer-3, mock-officer-diw, mock-officer-acfs, mock-public-owner',
  );
  console.log('Officer (Password): officer-login / password');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
