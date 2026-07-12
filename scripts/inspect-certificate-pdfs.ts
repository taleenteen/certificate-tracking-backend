import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';

type CertificateStatus =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'PENDING';

interface CertificateProfile {
  fileName: string;
  licenseNo: string;
  licenseTypeCode: string;
  businessNameTh: string;
  issueDate: string;
  expireDate: string | null;
  status: CertificateStatus;
}

interface CertificateProfileFile {
  version: number;
  certificates: CertificateProfile[];
}

const root = process.cwd();
const assetDirectory = resolve(root, 'src/assets/pdf');
const profilePath = resolve(root, 'prisma/mock-certificate-profiles.json');
const reportPath = resolve(root, 'tmp/certificate-pdf-report.json');
const stubPath = resolve(root, 'prisma/mock-certificate-profiles.todo.json');
const strict = process.argv.includes('--strict');
const writeStubs = process.argv.includes('--write-stubs');

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function readProfiles(): CertificateProfileFile {
  if (!existsSync(profilePath)) {
    throw new Error(`Missing certificate profile file: ${profilePath}`);
  }
  return JSON.parse(
    readFileSync(profilePath, 'utf8'),
  ) as CertificateProfileFile;
}

function validateProfiles(profiles: CertificateProfile[]) {
  const errors: string[] = [];
  const fileNames = new Set<string>();
  const licenseNumbers = new Set<string>();
  for (const profile of profiles) {
    if (fileNames.has(profile.fileName)) {
      errors.push(`Duplicate fileName in profiles: ${profile.fileName}`);
    }
    fileNames.add(profile.fileName);
    if (licenseNumbers.has(profile.licenseNo)) {
      errors.push(`Duplicate licenseNo in profiles: ${profile.licenseNo}`);
    }
    licenseNumbers.add(profile.licenseNo);
    if (
      !profile.licenseTypeCode ||
      !profile.businessNameTh ||
      !profile.licenseNo
    ) {
      errors.push(`Missing required license fields for ${profile.fileName}`);
    }
    if (!isIsoDate(profile.issueDate)) {
      errors.push(
        `Invalid issueDate for ${profile.fileName}: ${profile.issueDate}`,
      );
    }
    if (profile.expireDate && !isIsoDate(profile.expireDate)) {
      errors.push(
        `Invalid expireDate for ${profile.fileName}: ${profile.expireDate}`,
      );
    }
    if (profile.licenseTypeCode === 'RNG4' && profile.expireDate !== null) {
      errors.push(`RNG4 must have expireDate=null: ${profile.fileName}`);
    }
  }
  return errors;
}

async function inspect() {
  const profileFile = readProfiles();
  const profileErrors = validateProfiles(profileFile.certificates);
  const profilesByFile = new Map(
    profileFile.certificates.map((profile) => [profile.fileName, profile]),
  );
  const files = readdirSync(assetDirectory)
    .filter((fileName) => fileName.toLowerCase().endsWith('.pdf'))
    .sort();
  const rows = await Promise.all(
    files.map(async (fileName) => {
      const bytes = readFileSync(resolve(assetDirectory, fileName));
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const profile = profilesByFile.get(fileName);
      return {
        fileName,
        fileSizeBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        pageCount: pdf.getPageCount(),
        profileStatus: profile ? 'CONFIGURED' : 'UNCONFIGURED',
        profile: profile ?? null,
      };
    }),
  );
  const missingFiles = profileFile.certificates
    .filter((profile) => !files.includes(profile.fileName))
    .map((profile) => profile.fileName);
  const unconfigured = rows.filter(
    (row) => row.profileStatus === 'UNCONFIGURED',
  );
  const report = {
    generatedAt: new Date().toISOString(),
    assetDirectory: 'src/assets/pdf',
    summary: {
      fileCount: rows.length,
      configuredCount: rows.length - unconfigured.length,
      unconfiguredCount: unconfigured.length,
      invalidProfileCount: profileErrors.length,
      missingConfiguredFileCount: missingFiles.length,
    },
    profileErrors,
    missingFiles,
    files: rows,
  };

  mkdirSync(resolve(root, 'tmp'), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (writeStubs && unconfigured.length) {
    writeFileSync(
      stubPath,
      `${JSON.stringify(
        {
          version: 1,
          certificates: unconfigured.map((row) => ({
            fileName: row.fileName,
            licenseNo: '',
            licenseTypeCode: '',
            businessNameTh: '',
            issueDate: '',
            expireDate: null,
            status: 'ACTIVE',
          })),
        },
        null,
        2,
      )}\n`,
    );
  }

  for (const row of rows) {
    console.log(
      `${row.profileStatus.padEnd(12)} ${String(row.pageCount).padStart(2)} pages ${row.fileName}`,
    );
  }
  console.log(`Report: ${reportPath}`);
  if (writeStubs && unconfigured.length) console.log(`Stubs: ${stubPath}`);
  if (
    profileErrors.length ||
    missingFiles.length ||
    (strict && unconfigured.length)
  ) {
    process.exitCode = 1;
  }
}

inspect().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
