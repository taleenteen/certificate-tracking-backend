import {
  Agency,
  AuthProvider,
  Business,
  InspectionTask,
  License,
  LicenseStatus,
  PrismaClient,
  ReportResult,
  SyncStatus,
  TaskStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

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
    prisma.systemUser.deleteMany(),
    prisma.juristicPerson.deleteMany(),
    prisma.zone.deleteMany(),
    prisma.licenseType.deleteMany(),
  ]);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed production');
  }

  await resetDatabase();

  const licenseTypes = await Promise.all([
    prisma.licenseType.create({
      data: {
        code: 'RNG4',
        nameTh: 'ใบอนุญาตประกอบกิจการโรงงาน ร.ง.4',
        nameEn: 'Factory Operation License',
        agency: Agency.DIW,
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
        agency: Agency.DIW,
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
          agency: Agency.ACFS,
          validityYears: Number(validityYears),
          prerequisiteTypeIds: [],
        },
      }),
    ),
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
        mustChangePassword: true,
      },
    }),
    prisma.systemUser.create({
      data: {
        username: 'supervisor-diw',
        fullName: 'หัวหน้าผู้ตรวจ DIW',
        roles: ['supervisor', 'inspector'],
        agency: Agency.DIW,
      },
    }),
    prisma.systemUser.create({
      data: {
        username: 'supervisor-acfs',
        fullName: 'หัวหน้าผู้ตรวจ ACFS',
        roles: ['supervisor', 'inspector'],
        agency: Agency.ACFS,
      },
    }),
    prisma.systemUser.create({
      data: {
        username: 'inspector-1',
        fullName: 'ผู้ตรวจ DIW หนึ่ง',
        roles: ['inspector'],
        agency: Agency.DIW,
      },
    }),
    prisma.systemUser.create({
      data: {
        username: 'inspector-2',
        fullName: 'ผู้ตรวจ DIW สอง',
        roles: ['inspector'],
        agency: Agency.DIW,
      },
    }),
    prisma.systemUser.create({
      data: {
        username: 'inspector-3',
        fullName: 'ผู้ตรวจ ACFS หนึ่ง',
        roles: ['inspector'],
        agency: Agency.ACFS,
      },
    }),
    prisma.systemUser.create({
      data: {
        username: 'inspector-4',
        fullName: 'ผู้ตรวจ ACFS สอง',
        roles: ['inspector'],
        agency: Agency.ACFS,
      },
    }),
    prisma.systemUser.create({
      data: {
        username: 'public-owner',
        fullName: 'เจ้าของกิจการตัวอย่าง',
        roles: ['public'],
      },
    }),
  ]);
  const [
    admin,
    diwSupervisor,
    acfsSupervisor,
    diwInspector1,
    diwInspector2,
    acfsInspector1,
    acfsInspector2,
    publicOwner,
  ] = users;

  // A plain ADMIN account (below super_admin) for testing the role hierarchy.
  // Admins can assign supervisor/inspector roles but not create other admins.
  await prisma.systemUser.create({
    data: {
      username: 'admin',
      passwordHash: await bcrypt.hash(adminPassword, 12),
      fullName: 'ผู้ดูแลระบบ',
      roles: ['admin'],
      totpSecret: 'JBSWY3DPEHPK3PXP',
      mustChangePassword: false,
    },
  });

  await prisma.userZone.createMany({
    data: [
      [diwSupervisor.id, zones[0].id],
      [diwSupervisor.id, zones[2].id],
      [acfsSupervisor.id, zones[1].id],
      [acfsSupervisor.id, zones[3].id],
      [diwInspector1.id, zones[0].id],
      [diwInspector1.id, zones[2].id],
      [diwInspector2.id, zones[2].id],
      [diwInspector2.id, zones[5].id],
      [acfsInspector1.id, zones[1].id],
      [acfsInspector1.id, zones[3].id],
      [acfsInspector2.id, zones[3].id],
      [acfsInspector2.id, zones[4].id],
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
    const assignee = isDiw ? diwInspector1 : acfsInspector1;
    const creator = isDiw ? diwSupervisor : acfsSupervisor;
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

  for (let index = 3; index < tasks.length; index += 1) {
    const submitted = tasks[index].status !== TaskStatus.IN_PROGRESS;
    const reviewed = (<TaskStatus[]>[
      TaskStatus.APPROVED,
      TaskStatus.RETURNED,
    ]).includes(tasks[index].status);
    await prisma.inspectionReport.create({
      data: {
        taskId: tasks[index].id,
        inspectorId: tasks[index].assignedTo,
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
    data: users.slice(1).map((user) => ({
      userId: user.id,
      provider: AuthProvider.tang_rat,
      providerSub: `mock-sub-${user.username}`,
      providerName: user.fullName,
    })),
  });

  await prisma.notification.createMany({
    data: [
      {
        recipientId: diwInspector1.id,
        type: 'TASK_ASSIGNED',
        titleTh: 'ได้รับมอบหมายงานตรวจ',
        bodyTh: `งาน ${tasks[0].taskNo}`,
        refType: 'inspection_tasks',
        refId: tasks[0].id,
      },
      {
        recipientId: acfsInspector1.id,
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
        agency: Agency.ACFS,
        triggeredBy: acfsSupervisor.id,
        status: SyncStatus.SUCCESS,
        recordsUpdated: 5,
        startedAt: addDays(-1),
        finishedAt: addDays(-1),
      },
      {
        agency: Agency.DIW,
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
    'mTokens: mock-inspector-1, mock-inspector-3, mock-supervisor-diw, mock-supervisor-acfs, mock-public-owner',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
