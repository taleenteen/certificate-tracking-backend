import {
  AuthProvider,
  ClientType,
  LicenseDocumentExportFormat,
  LicenseDocumentExportStatus,
} from '@prisma/client';
import { PDFDocument as PdfLibDocument } from 'pdf-lib';
import { LicenseDocumentExportService } from './license-document-export.service';

describe('LicenseDocumentExportService', () => {
  const prisma = {
    business: { findFirst: jest.fn() },
    license: { findMany: jest.fn() },
    juristicMember: { findFirst: jest.fn() },
    licenseDocumentExport: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const storage = { download: jest.fn(), upload: jest.fn() };
  const service = new LicenseDocumentExportService(
    prisma as never,
    storage as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('creates a PDF export record, checksum, and audit row', async () => {
    const issueDate = new Date('2026-01-01T00:00:00.000Z');
    const sourcePdf = await PdfLibDocument.create();
    sourcePdf.addPage();
    storage.download.mockResolvedValue(Buffer.from(await sourcePdf.save()));
    prisma.business.findFirst.mockResolvedValue({
      id: 'b1111111-1111-4111-8111-111111111111',
      nameTh: 'สถานประกอบการทดสอบ',
      address: 'กรุงเทพมหานคร',
      province: 'กรุงเทพมหานคร',
      phone: '020000000',
      ownerUserId: null,
      juristicPersonId: null,
    });
    prisma.license.findMany.mockResolvedValue([
      {
        id: 'a1111111-1111-4111-8111-111111111111',
        licenseNo: 'RNG4-00001',
        status: 'ACTIVE',
        issueDate,
        expireDate: null,
        licenseType: {
          id: 'c1111111-1111-4111-8111-111111111111',
          code: 'RNG4',
          nameTh: 'ใบอนุญาต ร.ง.4',
          agencyId: 'd1111111-1111-4111-8111-111111111111',
          agency: {
            id: 'd1111111-1111-4111-8111-111111111111',
            code: 'DIW',
            nameTh: 'กรมโรงงานอุตสาหกรรม',
          },
        },
        documents: [
          {
            id: 'b1111111-1111-4111-8111-111111111111',
            docType: 'LICENSE_CERTIFICATE',
            fileName: 'issued-license.pdf',
            objectKey: 'mock-license-certificates/issued-license.pdf',
            mimeType: 'application/pdf',
            fileSizeBytes: 1234,
            createdAt: issueDate,
          },
        ],
      },
    ]);
    prisma.licenseDocumentExport.create.mockResolvedValue({
      id: 'e1111111-1111-4111-8111-111111111111',
    });
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<void>) =>
        callback(prisma),
    );
    storage.upload.mockResolvedValue(undefined);

    const file = await service.create(
      'b1111111-1111-4111-8111-111111111111',
      {
        format: 'pdf',
        licenseIds: ['a1111111-1111-4111-8111-111111111111'],
      },
      {
        sub: 'f1111111-1111-4111-8111-111111111111',
        jti: 'f2222222-1111-4111-8111-111111111111',
        roles: ['officer'],
        agencyId: 'd2222222-1111-4111-8111-111111111111',
        authProvider: AuthProvider.tang_rat,
        clientType: ClientType.app,
      },
      '127.0.0.1',
      'jest',
    );

    expect(file.contentType).toBe('application/pdf');
    expect(file.buffer.subarray(0, 4).toString()).toBe('%PDF');
    const exported = await PdfLibDocument.load(file.buffer);
    expect(exported.getPageCount()).toBe(3);
    expect(storage.download).toHaveBeenCalledWith(
      'mock-license-certificates/issued-license.pdf',
    );
    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^license-document-exports\//),
      expect.any(Buffer),
      'application/pdf',
    );
    expect(prisma.licenseDocumentExport.update).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('accepts selected licenses from multiple agencies under one business', async () => {
    const issueDate = new Date('2026-01-01T00:00:00.000Z');
    prisma.business.findFirst.mockResolvedValue({
      id: 'b1111111-1111-4111-8111-111111111111',
      nameTh: 'สถานประกอบการทดสอบ',
      address: 'กรุงเทพมหานคร',
      province: 'กรุงเทพมหานคร',
      phone: '020000000',
      ownerUserId: null,
      juristicPersonId: null,
    });
    prisma.license.findMany.mockResolvedValue([
      {
        id: 'a1111111-1111-4111-8111-111111111111',
        licenseNo: 'RNG4-00001',
        status: 'ACTIVE',
        issueDate,
        expireDate: null,
        licenseType: {
          id: 'c1111111-1111-4111-8111-111111111111',
          code: 'RNG4',
          nameTh: 'ใบอนุญาต ร.ง.4',
          agencyId: 'd1111111-1111-4111-8111-111111111111',
          agency: {
            id: 'd1111111-1111-4111-8111-111111111111',
            code: 'DIW',
            nameTh: 'กรมโรงงานอุตสาหกรรม',
          },
        },
        documents: [],
      },
      {
        id: 'a2222222-1111-4111-8111-111111111111',
        licenseNo: 'ACFS-00001',
        status: 'ACTIVE',
        issueDate,
        expireDate: new Date('2027-01-01T00:00:00.000Z'),
        licenseType: {
          id: 'c2222222-1111-4111-8111-111111111111',
          code: 'ACFS_PRODUCER',
          nameTh: 'ใบอนุญาตผู้ผลิตสินค้าเกษตร',
          agencyId: 'd2222222-1111-4111-8111-111111111111',
          agency: {
            id: 'd2222222-1111-4111-8111-111111111111',
            code: 'ACFS',
            nameTh: 'สำนักงานมาตรฐานสินค้าเกษตรและอาหารแห่งชาติ',
          },
        },
        documents: [],
      },
    ]);

    await expect(
      service['loadSource']('b1111111-1111-4111-8111-111111111111', [
        'a1111111-1111-4111-8111-111111111111',
        'a2222222-1111-4111-8111-111111111111',
      ]),
    ).resolves.toMatchObject({
      licenses: [{ licenseNo: 'RNG4-00001' }, { licenseNo: 'ACFS-00001' }],
      agencies: [{ code: 'ACFS' }, { code: 'DIW' }],
    });
  });

  it('returns only public-safe snapshot fields for a valid verification code', async () => {
    prisma.licenseDocumentExport.findFirst.mockResolvedValue({
      referenceNo: 'LEX-20260711-AB12CD34',
      format: LicenseDocumentExportFormat.PDF,
      sourcePlatform: 'E_LICENSE',
      sha256: 'a'.repeat(64),
      createdAt: new Date('2026-07-11T09:00:00.000Z'),
      completedAt: new Date('2026-07-11T09:01:00.000Z'),
      contentSnapshot: {
        business: { nameTh: 'บริษัททดสอบ', province: 'กรุงเทพมหานคร' },
        licenses: [
          {
            licenseNo: 'RNG4-00001',
            licenseType: { code: 'RNG4', nameTh: 'ใบอนุญาต ร.ง.4' },
            status: 'ACTIVE',
            documents: [{ objectKey: 'must-not-be-returned' }],
          },
        ],
      },
    });

    await expect(service.verify('opaque-code')).resolves.toEqual({
      verified: true,
      referenceNo: 'LEX-20260711-AB12CD34',
      format: 'pdf',
      sourcePlatform: 'E_LICENSE',
      sha256: 'a'.repeat(64),
      createdAt: new Date('2026-07-11T09:00:00.000Z'),
      completedAt: new Date('2026-07-11T09:01:00.000Z'),
      business: { nameTh: 'บริษัททดสอบ', province: 'กรุงเทพมหานคร' },
      licenses: [
        {
          licenseNo: 'RNG4-00001',
          licenseType: { code: 'RNG4', nameTh: 'ใบอนุญาต ร.ง.4' },
          status: 'ACTIVE',
        },
      ],
    });
    expect(prisma.licenseDocumentExport.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          verificationCode: 'opaque-code',
          status: LicenseDocumentExportStatus.COMPLETED,
        },
      }),
    );
  });
});
