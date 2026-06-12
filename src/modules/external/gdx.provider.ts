import { Injectable } from '@nestjs/common';
import { LicenseStatus } from '@prisma/client';

export interface GdxLicenseRecord {
  licenseNo: string;
  businessName: string;
  typeCode: string;
  issueDate: Date;
  status: LicenseStatus;
}

export interface GdxProvider {
  fetchAcfsLicenses(): Promise<GdxLicenseRecord[]>;
}

@Injectable()
export class MockGdxProvider implements GdxProvider {
  fetchAcfsLicenses() {
    // MOCK: replace in UAT.
    return Promise.resolve(
      Array.from({ length: 5 }, (_, index) => ({
        licenseNo: `GDX-ACFS-${index + 1}`,
        businessName: `กิจการจาก GDX ${index + 1}`,
        typeCode: index % 2 ? 'ACFS_GENERAL' : 'ACFS_MANDATORY',
        issueDate: new Date('2026-01-01'),
        status: LicenseStatus.ACTIVE,
      })),
    );
  }
}
