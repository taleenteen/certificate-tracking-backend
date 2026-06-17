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
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { storeCitizenId, isValidThaiCitizenId, last4 } from '../src/common/crypto/citizen-id';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const adminPassword = 'ChangeMe-2026!';

const addDays = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

async function resetDatabase() {
  await prisma.$transaction([
    prisma.licenseDocument.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.inspectionReport.deleteMany(),
    prisma.inspectionTask.deleteMany(),
    prisma.checklistTemplate.deleteMany(),
    prisma.license.deleteMany(),
    prisma.business.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.userSession.deleteMany(),
    prisma.authProviderLink.deleteMany(),
    prisma.userZone.deleteMany(),
    prisma.syncLog.deleteMany(),
    prisma.accountLinkChallenge.deleteMany(),
    prisma.juristicJoinRequest.deleteMany(),
    prisma.juristicInvite.deleteMany(),
    prisma.juristicMember.deleteMany(),
    prisma.systemUser.deleteMany(),
    prisma.juristicPerson.deleteMany(),
    prisma.zone.deleteMany(),
    prisma.licenseType.deleteMany(),
    prisma.agency.deleteMany(),
  ]);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed production');
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

  const zoneSpecs = [
    ['Z-BKK', 'เขตกรุงเทพมหานคร', 'กรุงเทพมหานคร', 13.7563, 100.5018],
    ['Z-CMI', 'เขตเชียงใหม่', 'เชียงใหม่', 18.7883, 98.9853],
    ['Z-CBI', 'เขตชลบุรี', 'ชลบุรี', 13.3611, 100.9847],
    ['Z-KKN', 'เขตขอนแก่น', 'ขอนแก่น', 16.4419, 102.8359],
    ['Z-SKA', 'เขตสงขลา', 'สงขลา', 7.1898, 100.5954],
    ['Z-NMA', 'เขตนครราชสีมา', 'นครราชสีมา', 14.9799, 102.0978],
  ] as const;
  const zones = await Promise.all(
    zoneSpecs.map(([code, nameTh, province, lat, lng]) =>
      prisma.zone.create({
        data: {
          code,
          nameTh,
          province,
          // MOCK: replace in UAT with authoritative GeoJSON boundaries.
          boundary: {
            type: 'Polygon',
            coordinates: [
              [
                [lng - 0.1, lat - 0.1],
                [lng + 0.1, lat - 0.1],
                [lng + 0.1, lat + 0.1],
                [lng - 0.1, lat + 0.1],
                [lng - 0.1, lat - 0.1],
              ],
            ],
          },
        },
      }),
    ),
  );

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

  await prisma.userZone.createMany({
    data: [
      [diwOfficerSr.id, zones[0].id],
      [diwOfficerSr.id, zones[2].id],
      [acfsOfficerSr.id, zones[1].id],
      [acfsOfficerSr.id, zones[3].id],
      [diwOfficer1.id, zones[0].id],
      [diwOfficer1.id, zones[2].id],
      [diwOfficer2.id, zones[2].id],
      [diwOfficer2.id, zones[5].id],
      [acfsOfficer1.id, zones[1].id],
      [acfsOfficer1.id, zones[3].id],
      [acfsOfficer2.id, zones[3].id],
      [acfsOfficer2.id, zones[4].id],
      [officerLogin.id, zones[0].id],
    ].map(([userId, zoneId]) => ({ userId, zoneId })),
  });

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
  for (let index = 0; index < 20; index += 1) {
    const zoneIndex = index % zones.length;
    const [, , province, lat, lng] = zoneSpecs[zoneIndex];
    businesses.push(
      await prisma.business.create({
        data: {
          nameTh: `สถานประกอบการตัวอย่าง ${index + 1}`,
          juristicPersonId: juristicPersons[index % juristicPersons.length].id,
          ownerUserId: index === 0 ? publicOwner.id : null,
          zoneId: zones[zoneIndex].id,
          address: `${100 + index} ถนนอุตสาหกรรม จังหวัด${province}`,
          province,
          latitude: lat + index * 0.001,
          longitude: lng + index * 0.001,
          geocodedAt: new Date(),
          phone: `02${String(1000000 + index).padStart(7, '0')}`,
        },
      }),
    );
  }

  const officerBusiness = await prisma.business.create({
    data: {
      nameTh: 'สถานประกอบการเจ้าหน้าที่ (DIW)',
      juristicPersonId: juristicPersons[0].id,
      ownerUserId: officerLogin.id,
      zoneId: zones[0].id,
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
          businessId: businesses[index % businesses.length].id,
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
            status === LicenseStatus.SUSPENDED ? 'ระงับชั่วคราวเพื่อทดสอบระบบ' : null,
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
      licenseTypeId: licenseTypes[4].id,
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
          zoneId: business.zoneId,
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
          zoneId: officerBusiness.zoneId,
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
    const reviewed = (<TaskStatus[]>[
      TaskStatus.APPROVED,
      TaskStatus.RETURNED,
    ]).includes(tasks[index].status);
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
