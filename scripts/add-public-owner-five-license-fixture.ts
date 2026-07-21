/**
 * Idempotently add a juristic mock fixture with five curated license types to
 * the existing public-owner account. This script never calls prisma/seed.ts
 * and therefore never resets the database.
 *
 * Preview only:
 *   npm run fixture:public-owner-five-licenses
 *
 * Apply (production requires the explicit confirmation variable):
 *   CONFIRM_PUBLIC_OWNER_FIXTURE=true \
 *     npm run fixture:public-owner-five-licenses -- --apply
 */

import 'dotenv/config';
import { JuristicRole, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const targetUsername = 'public-owner';
const fixtureRegistrationId = 'MOCKPUBOWNER5LIC';
const fixtureCompanyName = 'บริษัท กรีนฮาร์เวสต์ อะกริ-อินดัสทรี จำกัด';
const fixtureBusinessName = 'โรงงานแปรรูปและส่งออกกรีนฮาร์เวสต์';
const legacyFixtureBusinessName = 'สถานประกอบการตัวอย่าง 5 ใบอนุญาต';
const shouldApply = process.argv.includes('--apply');

const fixtureLicenses = [
  {
    typeCode: 'RNG4',
    sourceLicenseNo: 'กกพ.J02-38/2560',
    targetSuffix: 'RNG4',
  },
  {
    typeCode: 'HAZMAT',
    sourceLicenseNo: 'อก0305023003860',
    targetSuffix: 'HAZMAT',
  },
  {
    typeCode: 'ACFS_PRODUCER',
    sourceLicenseNo: 'ACFS47020200026',
    targetSuffix: 'PRODUCER',
  },
  {
    typeCode: 'ACFS_EXPORTER',
    sourceLicenseNo: 'ACFS47020400004',
    targetSuffix: 'EXPORTER',
  },
  {
    typeCode: 'ACFS_IMPORTER',
    sourceLicenseNo: 'ACFS47020600012',
    targetSuffix: 'IMPORTER',
  },
] as const;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function targetLicenseNo(suffix: string) {
  return `MOCK-PUBLIC-OWNER-${suffix}`;
}

async function main() {
  if (!shouldApply) {
    console.log('Dry run only. Re-run with --apply to write the fixture.');
    console.log(`Target user: ${targetUsername}`);
    console.log(
      `License types: ${fixtureLicenses.map((item) => item.typeCode).join(', ')}`,
    );
    return;
  }

  if (
    process.env.NODE_ENV === 'production' &&
    process.env.CONFIRM_PUBLIC_OWNER_FIXTURE !== 'true'
  ) {
    throw new Error(
      'Refusing production write. Set CONFIRM_PUBLIC_OWNER_FIXTURE=true after reviewing the dry run.',
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.systemUser.findUnique({
      where: { username: targetUsername },
      select: { id: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      throw new Error(`Active user ${targetUsername} was not found`);
    }

    const templates = await tx.license.findMany({
      where: {
        licenseNo: { in: fixtureLicenses.map((item) => item.sourceLicenseNo) },
        deletedAt: null,
      },
      include: {
        licenseType: { select: { id: true, code: true } },
        documents: {
          where: { docType: 'LICENSE_CERTIFICATE' },
          select: {
            docType: true,
            fileName: true,
            objectKey: true,
            mimeType: true,
            fileSizeBytes: true,
          },
        },
      },
    });

    const templateByLicenseNo = new Map(
      templates.map((license) => [license.licenseNo, license]),
    );
    for (const fixture of fixtureLicenses) {
      const template = templateByLicenseNo.get(fixture.sourceLicenseNo);
      if (!template || template.licenseType.code !== fixture.typeCode) {
        throw new Error(`Missing ${fixture.typeCode} source template`);
      }
      if (!template.documents.length) {
        throw new Error(
          `Source template ${fixture.sourceLicenseNo} has no certificate document`,
        );
      }
    }

    const juristicPerson = await tx.juristicPerson.upsert({
      where: { registrationId: fixtureRegistrationId },
      create: {
        registrationId: fixtureRegistrationId,
        nameTh: fixtureCompanyName,
        nameEn: 'Green Harvest Agri-Industry Co., Ltd.',
        juristicType: 'บริษัทจำกัด',
        address: '999 ถนนตัวอย่าง แขวงพระโขนง เขตวัฒนา กรุงเทพมหานคร 10110',
      },
      update: {
        nameTh: fixtureCompanyName,
        nameEn: 'Green Harvest Agri-Industry Co., Ltd.',
        juristicType: 'บริษัทจำกัด',
        address: '999 ถนนตัวอย่าง แขวงพระโขนง เขตวัฒนา กรุงเทพมหานคร 10110',
      },
    });

    await tx.juristicMember.upsert({
      where: {
        juristicPersonId_userId: {
          juristicPersonId: juristicPerson.id,
          userId: user.id,
        },
      },
      create: {
        juristicPersonId: juristicPerson.id,
        userId: user.id,
        role: JuristicRole.OWNER,
        position: 'กรรมการผู้จัดการ',
        isActive: true,
      },
      update: {
        role: JuristicRole.OWNER,
        position: 'กรรมการผู้จัดการ',
        isActive: true,
      },
    });

    const existingBusiness = await tx.business.findFirst({
      where: {
        juristicPersonId: juristicPerson.id,
        nameTh: { in: [fixtureBusinessName, legacyFixtureBusinessName] },
        deletedAt: null,
      },
      select: { id: true },
    });
    const business = existingBusiness
      ? await tx.business.update({
          where: { id: existingBusiness.id },
          data: { nameTh: fixtureBusinessName, ownerUserId: user.id },
        })
      : await tx.business.create({
          data: {
            nameTh: fixtureBusinessName,
            juristicPersonId: juristicPerson.id,
            ownerUserId: user.id,
            address: '999 ถนนตัวอย่าง แขวงพระโขนง เขตวัฒนา กรุงเทพมหานคร 10110',
            province: 'กรุงเทพมหานคร',
            latitude: 13.721428,
            longitude: 100.585972,
            geocodedAt: new Date(),
            phone: '021234567',
          },
        });

    const licenseIds: string[] = [];
    for (const fixture of fixtureLicenses) {
      const template = templateByLicenseNo.get(fixture.sourceLicenseNo)!;
      const licenseNo = targetLicenseNo(fixture.targetSuffix);
      const existingLicense = await tx.license.findUnique({
        where: { licenseNo },
        include: {
          documents: {
            select: { objectKey: true },
          },
        },
      });
      if (
        existingLicense &&
        (existingLicense.businessId !== business.id ||
          existingLicense.licenseTypeId !== template.licenseTypeId)
      ) {
        throw new Error(
          `Existing fixture license ${licenseNo} belongs to a different record`,
        );
      }

      const license =
        existingLicense ??
        (await tx.license.create({
          data: {
            licenseNo,
            businessId: business.id,
            licenseTypeId: template.licenseTypeId,
            status: template.status,
            issueDate: template.issueDate,
            expireDate: template.expireDate,
            suspendedAt: template.suspendedAt,
            suspensionReason: template.suspensionReason,
          },
          include: { documents: { select: { objectKey: true } } },
        }));
      licenseIds.push(license.id);

      const existingObjectKeys = new Set(
        license.documents.map((document) => document.objectKey),
      );
      const documentsToCopy = template.documents.filter(
        (document) => !existingObjectKeys.has(document.objectKey),
      );
      if (documentsToCopy.length) {
        await tx.licenseDocument.createMany({
          data: documentsToCopy.map((document) => ({
            licenseId: license.id,
            docType: document.docType,
            fileName: document.fileName,
            objectKey: document.objectKey,
            mimeType: document.mimeType,
            fileSizeBytes: document.fileSizeBytes,
          })),
        });
      }
    }

    return {
      juristicPersonId: juristicPerson.id,
      businessId: business.id,
      licenseIds,
    };
  });

  console.log('Public-owner five-license fixture is ready:');
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
