import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AgencyApiStatus,
  AgencyDataSource,
  AuthProvider,
  Business,
  JuristicRole,
  License,
  LicenseStatus,
  Prisma,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtClaims } from '../../common/auth.types';
import { AuthService } from '../auth/auth.service';
import { DBD_PROVIDER, TANG_RAT_PROVIDER } from '../external/external.module';
import type { DbdProvider } from '../external/dbd.provider';
import type { TangRatProvider } from '../external/tangrat.provider';
import { PrismaService } from '../../prisma/prisma.service';
import { buildLicenseOwnership } from '../license/license-ownership';
import { StorageService } from '../storage/storage.service';

const LICENSE_INCLUDE = {
  licenseType: { include: { agency: { select: { code: true } } } },
  business: {
    include: {
      owner: { select: { fullName: true } },
      juristicPerson: { select: { nameTh: true, registrationId: true } },
    },
  },
  documents: {
    where: { docType: 'LICENSE_CERTIFICATE' },
    select: { objectKey: true },
    orderBy: { createdAt: 'asc' },
    take: 1,
  },
} as const;

type MyLicenseRow = Prisma.LicenseGetPayload<{
  include: typeof LICENSE_INCLUDE;
}>;

const JURISTIC_LICENSE_GROUP_INCLUDE = {
  juristicPerson: {
    select: {
      id: true,
      nameTh: true,
      nameEn: true,
      registrationId: true,
      businesses: {
        where: { deletedAt: null },
        include: {
          licenses: {
            where: { deletedAt: null },
            include: {
              licenseType: {
                include: { agency: { select: { code: true } } },
              },
              documents: {
                where: { docType: 'LICENSE_CERTIFICATE' },
                select: { objectKey: true },
                orderBy: { createdAt: 'asc' },
                take: 1,
              },
            },
            orderBy: { licenseNo: 'asc' },
          },
        },
        orderBy: { nameTh: 'asc' },
      },
      licenses: {
        where: { deletedAt: null },
        include: {
          licenseType: {
            include: { agency: { select: { code: true } } },
          },
          documents: {
            where: { docType: 'LICENSE_CERTIFICATE' },
            select: { objectKey: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
        orderBy: { licenseNo: 'asc' },
      },
    },
  },
} as const;

type JuristicLicenseGroupRow = Prisma.JuristicMemberGetPayload<{
  include: typeof JURISTIC_LICENSE_GROUP_INCLUDE;
}>;

type DevSeedUser = {
  id: string;
  fullName: string;
};

const DEMO_TEMPLATE_INCLUDE = {
  business: {
    select: {
      id: true,
      nameTh: true,
      address: true,
      province: true,
      latitude: true,
      longitude: true,
      phone: true,
    },
  },
  documents: {
    where: { docType: 'LICENSE_CERTIFICATE' },
    select: {
      docType: true,
      fileName: true,
      objectKey: true,
      mimeType: true,
      fileSizeBytes: true,
    },
    orderBy: { createdAt: 'asc' },
  },
} as const;

type DemoLicenseTemplateRow = Prisma.LicenseGetPayload<{
  include: typeof DEMO_TEMPLATE_INCLUDE;
}>;

type DemoLicenseTemplate = DemoLicenseTemplateRow & {
  business: NonNullable<DemoLicenseTemplateRow['business']>;
};

type DevCoordinatePoolItem = {
  key: string;
  weight: number;
  province: string;
  amphoeTh: string;
  tambonTh: string;
  postalCode: string;
  addressBase: string;
  lat: number;
  lng: number;
  bbox: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
};

const THAILAND_BOUNDS = {
  minLat: 5.6,
  maxLat: 20.5,
  minLng: 97.3,
  maxLng: 105.7,
} as const;

// MOCK: replace in UAT — pre-vetted Thai business/industrial anchors for demo pins.
const DEV_COORDINATE_POOL: DevCoordinatePoolItem[] = [
  {
    key: 'bkk-bang-rak',
    weight: 6,
    province: 'กรุงเทพมหานคร',
    amphoeTh: 'เขตบางรัก',
    tambonTh: 'แขวงสีลม',
    postalCode: '10500',
    addressBase: 'ถนนสีลม',
    lat: 13.7279,
    lng: 100.5241,
    bbox: {
      minLat: 13.7205,
      maxLat: 13.7352,
      minLng: 100.5165,
      maxLng: 100.5328,
    },
  },
  {
    key: 'bkk-khlong-toei',
    weight: 6,
    province: 'กรุงเทพมหานคร',
    amphoeTh: 'เขตคลองเตย',
    tambonTh: 'แขวงคลองเตย',
    postalCode: '10110',
    addressBase: 'ถนนสุขุมวิท',
    lat: 13.7223,
    lng: 100.5606,
    bbox: {
      minLat: 13.7098,
      maxLat: 13.7335,
      minLng: 100.5482,
      maxLng: 100.5755,
    },
  },
  {
    key: 'samut-prakan-bangpoo',
    weight: 7,
    province: 'สมุทรปราการ',
    amphoeTh: 'อำเภอเมืองสมุทรปราการ',
    tambonTh: 'ตำบลแพรกษา',
    postalCode: '10280',
    addressBase: 'นิคมอุตสาหกรรมบางปู',
    lat: 13.5456,
    lng: 100.6517,
    bbox: { minLat: 13.525, maxLat: 13.565, minLng: 100.628, maxLng: 100.675 },
  },
  {
    key: 'pathum-thani-bang-kadi',
    weight: 7,
    province: 'ปทุมธานี',
    amphoeTh: 'อำเภอเมืองปทุมธานี',
    tambonTh: 'ตำบลบางกะดี',
    postalCode: '12120',
    addressBase: 'สวนอุตสาหกรรมบางกะดี',
    lat: 13.9827,
    lng: 100.5482,
    bbox: { minLat: 13.963, maxLat: 14.002, minLng: 100.529, maxLng: 100.568 },
  },
  {
    key: 'nonthaburi-pakkret',
    weight: 4,
    province: 'นนทบุรี',
    amphoeTh: 'อำเภอปากเกร็ด',
    tambonTh: 'ตำบลบางตลาด',
    postalCode: '11120',
    addressBase: 'ถนนแจ้งวัฒนะ',
    lat: 13.9142,
    lng: 100.5371,
    bbox: { minLat: 13.895, maxLat: 13.928, minLng: 100.518, maxLng: 100.555 },
  },
  {
    key: 'samut-sakhon-krathum-baen',
    weight: 5,
    province: 'สมุทรสาคร',
    amphoeTh: 'อำเภอกระทุ่มแบน',
    tambonTh: 'ตำบลอ้อมน้อย',
    postalCode: '74130',
    addressBase: 'ถนนเศรษฐกิจ',
    lat: 13.7052,
    lng: 100.3065,
    bbox: { minLat: 13.688, maxLat: 13.724, minLng: 100.284, maxLng: 100.328 },
  },
  {
    key: 'nakhon-pathom-sampran',
    weight: 4,
    province: 'นครปฐม',
    amphoeTh: 'อำเภอสามพราน',
    tambonTh: 'ตำบลไร่ขิง',
    postalCode: '73210',
    addressBase: 'ถนนเพชรเกษม',
    lat: 13.7416,
    lng: 100.2768,
    bbox: { minLat: 13.724, maxLat: 13.758, minLng: 100.258, maxLng: 100.296 },
  },
  {
    key: 'chonburi-amata',
    weight: 3,
    province: 'ชลบุรี',
    amphoeTh: 'อำเภอเมืองชลบุรี',
    tambonTh: 'ตำบลดอนหัวฬ่อ',
    postalCode: '20000',
    addressBase: 'นิคมอุตสาหกรรมอมตะซิตี้ ชลบุรี',
    lat: 13.4179,
    lng: 101.0214,
    bbox: { minLat: 13.394, maxLat: 13.438, minLng: 100.998, maxLng: 101.044 },
  },
  {
    key: 'rayong-map-ta-phut',
    weight: 3,
    province: 'ระยอง',
    amphoeTh: 'อำเภอเมืองระยอง',
    tambonTh: 'ตำบลมาบตาพุด',
    postalCode: '21150',
    addressBase: 'นิคมอุตสาหกรรมมาบตาพุด',
    lat: 12.7078,
    lng: 101.1708,
    bbox: { minLat: 12.685, maxLat: 12.731, minLng: 101.146, maxLng: 101.196 },
  },
  {
    key: 'ayutthaya-ro-jana',
    weight: 3,
    province: 'พระนครศรีอยุธยา',
    amphoeTh: 'อำเภออุทัย',
    tambonTh: 'ตำบลคานหาม',
    postalCode: '13210',
    addressBase: 'สวนอุตสาหกรรมโรจนะ',
    lat: 14.3564,
    lng: 100.6373,
    bbox: { minLat: 14.335, maxLat: 14.379, minLng: 100.612, maxLng: 100.662 },
  },
  {
    key: 'nakhon-ratchasima-suranaree',
    weight: 2,
    province: 'นครราชสีมา',
    amphoeTh: 'อำเภอเมืองนครราชสีมา',
    tambonTh: 'ตำบลสุรนารี',
    postalCode: '30000',
    addressBase: 'เขตอุตสาหกรรมสุรนารี',
    lat: 14.8792,
    lng: 102.0246,
    bbox: { minLat: 14.858, maxLat: 14.902, minLng: 101.998, maxLng: 102.049 },
  },
  {
    key: 'songkhla-hat-yai',
    weight: 2,
    province: 'สงขลา',
    amphoeTh: 'อำเภอหาดใหญ่',
    tambonTh: 'ตำบลคอหงส์',
    postalCode: '90110',
    addressBase: 'ถนนกาญจนวนิช',
    lat: 7.0076,
    lng: 100.4981,
    bbox: { minLat: 6.987, maxLat: 7.029, minLng: 100.477, maxLng: 100.519 },
  },
];

@Injectable()
export class MyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DBD_PROVIDER) private readonly dbd: DbdProvider,
    @Inject(TANG_RAT_PROVIDER) private readonly tangRat: TangRatProvider,
    private readonly auth: AuthService, // for reusable D5 link/merge (Tang Rat canonical always wins)
    private readonly storage: StorageService,
  ) {}

  async getLicensesPersonal(userId: string) {
    const rows = await this.prisma.license.findMany({
      where: {
        deletedAt: null,
        business: {
          ownerUserId: userId,
          juristicPersonId: null,
          deletedAt: null,
        },
      },
      include: LICENSE_INCLUDE,
    });
    return Promise.all(rows.map((r) => this.toLicenseDto(r)));
  }

  async getLicensesByJuristicId(juristicPersonId: string) {
    const rows = await this.prisma.license.findMany({
      where: {
        deletedAt: null,
        business: {
          deletedAt: null,
          juristicPersonId,
        },
      },
      include: LICENSE_INCLUDE,
    });
    return Promise.all(rows.map((r) => this.toLicenseDto(r)));
  }

  async getLicensesJuristic(user: JwtClaims) {
    const match = await this.dbd.lookup(user.citizenSub ?? '');
    if (!match) throw new NotFoundException({ found: false });
    const juristicPerson = await this.prisma.juristicPerson.findUnique({
      where: { registrationId: match.registrationId },
    });
    if (!juristicPerson) throw new NotFoundException({ found: false });
    const rows = await this.prisma.license.findMany({
      where: {
        deletedAt: null,
        business: { deletedAt: null, juristicPersonId: juristicPerson.id },
      },
      include: LICENSE_INCLUDE,
    });
    return Promise.all(rows.map((r) => this.toLicenseDto(r)));
  }

  async getJuristicLicenseGroups(userId: string) {
    const memberships = await this.prisma.juristicMember.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: JURISTIC_LICENSE_GROUP_INCLUDE,
      orderBy: { juristicPerson: { nameTh: 'asc' } },
    });

    return Promise.all(
      memberships.map((membership) =>
        this.toJuristicLicenseGroupDto(membership),
      ),
    );
  }

  async getJuristicBusinessDetail(userId: string, businessId: string) {
    const business = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        deletedAt: null,
        juristicPersonId: { not: null },
      },
      include: {
        juristicPerson: {
          select: {
            id: true,
            nameTh: true,
            nameEn: true,
            registrationId: true,
          },
        },
        licenses: {
          where: { deletedAt: null },
          include: {
            licenseType: {
              include: { agency: { select: { code: true } } },
            },
            documents: {
              where: { docType: 'LICENSE_CERTIFICATE' },
              select: { objectKey: true },
              orderBy: { createdAt: 'asc' },
              take: 1,
            },
          },
          orderBy: { licenseNo: 'asc' },
        },
      },
    });
    if (!business?.juristicPersonId || !business.juristicPerson) {
      throw new NotFoundException();
    }

    const membership = await this.prisma.juristicMember.findUnique({
      where: {
        juristicPersonId_userId: {
          juristicPersonId: business.juristicPersonId,
          userId,
        },
      },
      select: { role: true, isActive: true },
    });
    if (!membership?.isActive) throw new NotFoundException();

    const licenses = await Promise.all(
      business.licenses.map(async (license) => ({
        id: license.id,
        licenseNumber: license.licenseNo,
        issuedAt: license.issueDate.toISOString(),
        expiresAt: license.expireDate ? license.expireDate.toISOString() : null,
        status: license.status,
        suspendedAt: license.suspendedAt?.toISOString() ?? null,
        suspensionReason: license.suspensionReason,
        licenseType: {
          id: license.licenseType.id,
          code: license.licenseType.code,
          nameTh: license.licenseType.nameTh,
          nameEn: license.licenseType.nameEn ?? '',
          agency: license.licenseType.agency.code,
        },
        previewUrl: await this.certificatePreviewUrl(license.documents),
      })),
    );

    return {
      id: business.id,
      nameTh: business.nameTh,
      address: business.address,
      province: business.province,
      latitude: business.latitude?.toString() ?? null,
      longitude: business.longitude?.toString() ?? null,
      phone: business.phone,
      email: this.mockBusinessEmail(business.id),
      juristic: {
        id: business.juristicPerson.id,
        nameTh: business.juristicPerson.nameTh,
        nameEn: business.juristicPerson.nameEn ?? undefined,
        registrationId: business.juristicPerson.registrationId,
        myRole: membership.role,
      },
      licenseSummary: this.buildLicenseSummary(licenses),
      licenses,
    };
  }

  // MOCK: replace in UAT — dev-only endpoint to seed a near-expiry license
  async createDevLicense(userId: string) {
    this.assertDemoDataEnabled();
    const user = await this.devSeedUser(userId);
    const license = await this.prisma.$transaction(async (tx) => {
      const seeded = await this.seedPersonalDevData(tx, user);
      return seeded.license;
    });

    return this.toLicenseDto(license);
  }

  // MOCK: replace in UAT — prototype helper that seeds both personal and juristic demo data.
  async createDevDemoData(userId: string) {
    this.assertDemoDataEnabled();

    const user = await this.devSeedUser(userId);
    const seeded = await this.prisma.$transaction(async (tx) => {
      const personal = await this.seedPersonalDevData(tx, user);
      const juristic = await this.seedJuristicDevData(tx, user);
      return {
        personal: {
          businessId: personal.businessId,
          licenseIds: [personal.license.id],
        },
        juristic,
      };
    });
    const groups = await this.getJuristicLicenseGroups(user.id);

    return {
      success: true,
      personal: seeded.personal,
      juristic: seeded.juristic,
      messageTh: 'สร้างข้อมูลตัวอย่างของคุณจากชุดใบอนุญาตแล้ว',
      groups,
    };
  }

  // MOCK: replace in UAT — prototype-only helper for frontend demo data.
  async createDevJuristicLicenseDemo(userId: string) {
    this.assertDemoDataEnabled();

    const user = await this.devSeedUser(userId);
    const demo = await this.prisma.$transaction(async (tx) => {
      const seeded = await this.seedJuristicDevData(tx, user);
      return { id: seeded.juristicId };
    });

    const groups = await this.getJuristicLicenseGroups(user.id);
    return {
      success: true,
      juristicId: demo.id,
      messageTh: 'สร้างข้อมูลนิติบุคคลตัวอย่างเรียบร้อย',
      groups,
    };
  }

  private async devSeedUser(userId: string) {
    const user = await this.prisma.systemUser.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, fullName: true },
    });
    if (!user) throw new NotFoundException();
    return user;
  }

  private assertDemoDataEnabled() {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.DEMO_DATA_ENABLED !== 'true'
    ) {
      throw new ForbiddenException('Demo data is disabled');
    }
  }

  private async seedPersonalDevData(
    tx: Prisma.TransactionClient,
    user: DevSeedUser,
  ) {
    const token = this.devToken(user.id);
    const [template] = await this.pickDemoTemplates(tx, user.id, 1);
    const location = this.templateLocation(template, user.id, 'personal', 0);
    const business = await this.upsertPersonalDevBusiness(tx, {
      ownerUserId: user.id,
      nameTh: `กิจการตัวอย่างของ ${user.fullName} (${token})`,
      address: template.business.address,
      province: template.business.province,
      latitude: location.latitude,
      longitude: location.longitude,
      phone: this.devPhone(token, 1),
    });

    const license = await this.cloneDemoLicense(
      tx,
      template,
      { businessId: business.id },
      token,
      'P1',
    );
    const includedLicense = await tx.license.findUniqueOrThrow({
      where: { id: license.id },
      include: LICENSE_INCLUDE,
    });

    return { businessId: business.id, license: includedLicense };
  }

  private async seedJuristicDevData(
    tx: Prisma.TransactionClient,
    user: DevSeedUser,
  ) {
    const token = this.devToken(user.id);
    const registrationId = `DEV${token.slice(0, 10)}`.padEnd(13, '0');
    const templates = await this.pickDemoTemplates(tx, user.id, 3, 1);

    const juristicPerson = await tx.juristicPerson.upsert({
      where: { registrationId },
      create: {
        registrationId,
        nameTh: `บริษัท ตัวอย่างของ ${user.fullName} จำกัด`,
        nameEn: `Demo Company ${token} Co., Ltd.`,
        juristicType: 'บริษัทจำกัด',
        address: templates[0].business.address,
      },
      update: {
        nameTh: `บริษัท ตัวอย่างของ ${user.fullName} จำกัด`,
        nameEn: `Demo Company ${token} Co., Ltd.`,
        juristicType: 'บริษัทจำกัด',
        address: templates[0].business.address,
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

    const businesses: Array<{ business: Business; license: License }> = [];
    for (const [index, template] of templates.entries()) {
      const location = this.templateLocation(
        template,
        user.id,
        'juristic',
        index,
      );
      const business = await this.upsertDevBusiness(tx, {
        nameTh: `สถานประกอบการตัวอย่าง ${index + 1} - ${template.business.nameTh}`,
        juristicPersonId: juristicPerson.id,
        address: template.business.address,
        province: template.business.province,
        latitude: location.latitude,
        longitude: location.longitude,
        phone: this.devPhone(token, index + 2),
      });
      const license = await this.cloneDemoLicense(
        tx,
        template,
        { businessId: business.id },
        token,
        `J${index + 1}`,
      );
      businesses.push({ business, license });
    }
    const corporateTemplates = [
      ...(await this.pickDemoTemplates(tx, user.id, 1, 4, ['ACFS_EXPORTER'])),
      ...(await this.pickDemoTemplates(tx, user.id, 1, 5, ['ACFS_IMPORTER'])),
    ];
    const corporateLicenses: License[] = [];
    for (const [index, template] of corporateTemplates.entries()) {
      corporateLicenses.push(
        await this.cloneDemoLicense(
          tx,
          template,
          { juristicPersonId: juristicPerson.id },
          token,
          `C${index + 1}`,
        ),
      );
    }

    return {
      juristicId: juristicPerson.id,
      businessIds: businesses.map((item) => item.business.id),
      licenseIds: businesses.map((item) => item.license.id),
      corporateLicenseIds: corporateLicenses.map((license) => license.id),
    };
  }

  private async pickDemoTemplates(
    tx: Prisma.TransactionClient,
    userId: string,
    count: number,
    offset = 0,
    typeCodes?: string[],
  ) {
    const templateRows = await tx.license.findMany({
      where: {
        deletedAt: null,
        licenseNo: { not: { startsWith: 'DEMO-' } },
        licenseType: typeCodes ? { code: { in: typeCodes } } : undefined,
        business: {
          deletedAt: null,
          latitude: { not: null },
          longitude: { not: null },
        },
        documents: { some: { docType: 'LICENSE_CERTIFICATE' } },
      },
      include: DEMO_TEMPLATE_INCLUDE,
      orderBy: { licenseNo: 'asc' },
    });
    const templates = templateRows.filter(
      (template): template is DemoLicenseTemplate => !!template.business,
    );
    if (!templates.length) {
      throw new UnprocessableEntityException(
        'Demo certificate templates are not available',
      );
    }

    const selected: DemoLicenseTemplate[] = [];
    const selectedBusinessIds = new Set<string>();
    const start =
      (this.devHash(`${userId}:demo-template`) + offset) % templates.length;
    for (
      let index = 0;
      index < templates.length && selected.length < count;
      index += 1
    ) {
      const template = templates[(start + index) % templates.length];
      if (!template || selectedBusinessIds.has(template.business.id)) continue;
      selected.push(template);
      selectedBusinessIds.add(template.business.id);
    }
    if (selected.length < count) {
      throw new UnprocessableEntityException(
        'Not enough demo certificate templates are available',
      );
    }
    return selected;
  }

  private async cloneDemoLicense(
    tx: Prisma.TransactionClient,
    template: DemoLicenseTemplate,
    subject: { businessId?: string; juristicPersonId?: string },
    token: string,
    slot: string,
  ) {
    const license = await this.upsertDevLicense(tx, {
      licenseNo:
        `DEMO-${token.slice(0, 6)}-${slot}-${template.licenseNo}`.slice(0, 50),
      businessId: subject.businessId,
      juristicPersonId: subject.juristicPersonId,
      licenseTypeId: template.licenseTypeId,
      status: template.status,
      issueDate: template.issueDate,
      expireDate: template.expireDate,
      suspendedAt: template.suspendedAt ?? undefined,
      suspensionReason: template.suspensionReason ?? undefined,
    });
    const existingDocuments = await tx.licenseDocument.findMany({
      where: { licenseId: license.id },
      select: { objectKey: true },
    });
    const existingObjectKeys = new Set(
      existingDocuments.map((document) => document.objectKey),
    );
    const newDocuments = template.documents.filter(
      (document) => !existingObjectKeys.has(document.objectKey),
    );
    if (newDocuments.length) {
      await tx.licenseDocument.createMany({
        data: newDocuments.map((document) => ({
          licenseId: license.id,
          docType: document.docType,
          fileName: document.fileName,
          objectKey: document.objectKey,
          mimeType: document.mimeType,
          fileSizeBytes: document.fileSizeBytes,
        })),
      });
    }
    return license;
  }

  private templateLocation(
    template: DemoLicenseTemplate,
    userId: string,
    flow: string,
    slot: number,
  ) {
    if (!template.business.latitude || !template.business.longitude) {
      throw new UnprocessableEntityException(
        'Demo template has no map coordinate',
      );
    }
    const latitudeJitter =
      (this.devRatio(`${userId}:${flow}:${slot}:lat`) - 0.5) * 0.006;
    const longitudeJitter =
      (this.devRatio(`${userId}:${flow}:${slot}:lng`) - 0.5) * 0.006;
    return {
      latitude: new Prisma.Decimal(
        this.clamp(
          Number(template.business.latitude) + latitudeJitter,
          THAILAND_BOUNDS.minLat,
          THAILAND_BOUNDS.maxLat,
        ).toFixed(6),
      ),
      longitude: new Prisma.Decimal(
        this.clamp(
          Number(template.business.longitude) + longitudeJitter,
          THAILAND_BOUNDS.minLng,
          THAILAND_BOUNDS.maxLng,
        ).toFixed(6),
      ),
    };
  }

  private devToken(userId: string) {
    return userId.replace(/-/g, '').slice(0, 10).toUpperCase();
  }

  private devLocation(userId: string, flow: string, slot: number) {
    const totalWeight = DEV_COORDINATE_POOL.reduce(
      (total, item) => total + item.weight,
      0,
    );
    const point = this.devHash(`${userId}:${flow}`) % totalWeight;
    let cursor = 0;
    const selected =
      DEV_COORDINATE_POOL.find((item) => {
        cursor += item.weight;
        return point < cursor;
      }) ?? DEV_COORDINATE_POOL[0];

    const latRatio = this.devRatio(`${userId}:${flow}:${slot}:lat`);
    const lngRatio = this.devRatio(`${userId}:${flow}:${slot}:lng`);
    const latitude =
      selected.bbox.minLat +
      (selected.bbox.maxLat - selected.bbox.minLat) * latRatio;
    const longitude =
      selected.bbox.minLng +
      (selected.bbox.maxLng - selected.bbox.minLng) * lngRatio;

    return {
      ...selected,
      latitude: this.clamp(
        this.clamp(latitude, selected.bbox.minLat, selected.bbox.maxLat),
        THAILAND_BOUNDS.minLat,
        THAILAND_BOUNDS.maxLat,
      ),
      longitude: this.clamp(
        this.clamp(longitude, selected.bbox.minLng, selected.bbox.maxLng),
        THAILAND_BOUNDS.minLng,
        THAILAND_BOUNDS.maxLng,
      ),
    };
  }

  private devAddress(
    location: DevCoordinatePoolItem,
    number: number,
    placeName: string,
  ) {
    return `${number}/${this.devHash(location.key + placeName) % 90} ${placeName} ${location.addressBase} ${location.tambonTh} ${location.amphoeTh} ${location.province} ${location.postalCode}`;
  }

  private devPhone(token: string, slot: number) {
    const suffix = String(
      this.devHash(`${token}:${slot}`) % 10_000_000,
    ).padStart(7, '0');
    return `02${suffix}`;
  }

  private devRatio(input: string) {
    return (this.devHash(input) % 10_000) / 10_000;
  }

  private devHash(input: string) {
    let hash = 0;
    for (const char of input) {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    return hash;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  private async toLicenseDto(license: MyLicenseRow) {
    if (!license.business) throw new NotFoundException();
    return {
      id: license.id,
      licenseNumber: license.licenseNo,
      issuedAt: license.issueDate.toISOString(),
      expiresAt: license.expireDate ? license.expireDate.toISOString() : null,
      status: license.status as string,
      licenseType: {
        id: license.licenseType.id,
        code: license.licenseType.code,
        nameTh: license.licenseType.nameTh,
        nameEn: license.licenseType.nameEn ?? '',
        agency: license.licenseType.agency?.code ?? '',
      },
      business: {
        id: license.business.id,
        nameTh: license.business.nameTh,
        province: license.business.province,
        registrationId:
          (license.business.juristicPerson?.registrationId as string) ?? null,
      },
      ownership: buildLicenseOwnership(license.business, {
        exposeIndividualContext: true,
      }),
      previewUrl: await this.certificatePreviewUrl(license.documents),
    };
  }

  private async toJuristicLicenseGroupDto(membership: JuristicLicenseGroupRow) {
    const corporateLicenses = await Promise.all(
      membership.juristicPerson.licenses.map(async (license) => ({
        id: license.id,
        licenseNumber: license.licenseNo,
        issuedAt: license.issueDate.toISOString(),
        expiresAt: license.expireDate ? license.expireDate.toISOString() : null,
        status: license.status,
        licenseType: {
          id: license.licenseType.id,
          code: license.licenseType.code,
          nameTh: license.licenseType.nameTh,
          nameEn: license.licenseType.nameEn ?? '',
          agency: license.licenseType.agency.code,
        },
        previewUrl: await this.certificatePreviewUrl(license.documents),
      })),
    );
    const businesses = await Promise.all(
      membership.juristicPerson.businesses.map(async (business) => {
        const licenses = await Promise.all(
          business.licenses.map(async (license) => ({
            id: license.id,
            licenseNumber: license.licenseNo,
            issuedAt: license.issueDate.toISOString(),
            expiresAt: license.expireDate
              ? license.expireDate.toISOString()
              : null,
            status: license.status,
            licenseType: {
              id: license.licenseType.id,
              code: license.licenseType.code,
              nameTh: license.licenseType.nameTh,
              nameEn: license.licenseType.nameEn ?? '',
              agency: license.licenseType.agency.code,
            },
            previewUrl: await this.certificatePreviewUrl(license.documents),
          })),
        );

        return {
          id: business.id,
          nameTh: business.nameTh,
          province: business.province,
          licenseCount: licenses.length,
          licenses,
        };
      }),
    );

    const businessLicenseCount = businesses.reduce(
      (total, business) => total + business.licenseCount,
      0,
    );

    return {
      juristicId: membership.juristicPersonId,
      nameTh: membership.juristicPerson.nameTh,
      nameEn: membership.juristicPerson.nameEn ?? undefined,
      registrationId: membership.juristicPerson.registrationId,
      myRole: membership.role,
      businessCount: businesses.length,
      corporateLicenseCount: corporateLicenses.length,
      businessLicenseCount,
      licenseCount: corporateLicenses.length + businessLicenseCount,
      corporateLicenses,
      businesses,
    };
  }

  private certificatePreviewUrl(documents: Array<{ objectKey: string }>) {
    const document = documents[0];
    return document ? this.storage.presign(document.objectKey) : null;
  }

  private buildLicenseSummary(licenses: Array<{ status: LicenseStatus }>) {
    return {
      total: licenses.length,
      active: licenses.filter(
        (license) => license.status === LicenseStatus.ACTIVE,
      ).length,
      suspended: licenses.filter(
        (license) => license.status === LicenseStatus.SUSPENDED,
      ).length,
      expired: licenses.filter(
        (license) => license.status === LicenseStatus.EXPIRED,
      ).length,
      pending: licenses.filter(
        (license) => license.status === LicenseStatus.PENDING,
      ).length,
      revoked: licenses.filter(
        (license) => license.status === LicenseStatus.REVOKED,
      ).length,
    };
  }

  private mockBusinessEmail(businessId: string) {
    // MOCK: replace in UAT when Business has a persisted contact email field.
    return `contact-${businessId.replace(/-/g, '').slice(0, 10)}@demo.elicense.local`;
  }

  private async ensureDevLicenseTypes(tx: Prisma.TransactionClient) {
    const [diwAgency, acfsAgency] = await Promise.all([
      tx.agency.upsert({
        where: { code: 'DIW' },
        create: {
          code: 'DIW',
          nameTh: 'กรมโรงงานอุตสาหกรรม',
          nameEn: 'Department of Industrial Works',
          dataSource: AgencyDataSource.MANUAL_IMPORT,
          apiStatus: AgencyApiStatus.MANUAL,
        },
        update: {},
      }),
      tx.agency.upsert({
        where: { code: 'ACFS' },
        create: {
          code: 'ACFS',
          nameTh: 'สำนักงานมาตรฐานสินค้าเกษตรและอาหารแห่งชาติ',
          nameEn:
            'National Bureau of Agricultural Commodity and Food Standards',
          dataSource: AgencyDataSource.API,
          apiStatus: AgencyApiStatus.CONNECTED,
        },
        update: {},
      }),
    ]);

    const [diwType, hazmatType, acfsType] = await Promise.all([
      tx.licenseType.upsert({
        where: { code: 'RNG4' },
        create: {
          code: 'RNG4',
          nameTh: 'ใบอนุญาตประกอบกิจการโรงงาน ร.ง.4',
          nameEn: 'Factory Operation License',
          agencyId: diwAgency.id,
          validityYears: 1,
          feeThb: new Prisma.Decimal('500'),
          renewalFeeThb: new Prisma.Decimal('500'),
          suspendedOnNonpayment: true,
          prerequisiteTypeIds: [],
          requiredDocuments: [
            { code: 'FACTORY_PLAN', name: 'แผนผังโรงงาน', required: true },
          ] as Prisma.InputJsonValue,
        },
        update: { agencyId: diwAgency.id, isActive: true },
      }),
      tx.licenseType.upsert({
        where: { code: 'HAZMAT' },
        create: {
          code: 'HAZMAT',
          nameTh: 'ใบอนุญาตวัตถุอันตราย',
          nameEn: 'Hazardous Substance License',
          agencyId: diwAgency.id,
          validityYears: 3,
          feeThb: new Prisma.Decimal('3000'),
          prerequisiteTypeIds: [],
        },
        update: { agencyId: diwAgency.id, isActive: true },
      }),
      tx.licenseType.upsert({
        where: { code: 'ACFS_GAP_HACCP' },
        create: {
          code: 'ACFS_GAP_HACCP',
          nameTh: 'ใบรับรอง GAP/HACCP',
          nameEn: 'GAP/HACCP Certificate',
          agencyId: acfsAgency.id,
          validityYears: 3,
          prerequisiteTypeIds: [],
        },
        update: { agencyId: acfsAgency.id, isActive: true },
      }),
    ]);

    return { diwType, hazmatType, acfsType };
  }

  private async upsertDevBusiness(
    tx: Prisma.TransactionClient,
    data: {
      nameTh: string;
      juristicPersonId: string;
      address: string;
      province: string;
      latitude: Prisma.Decimal;
      longitude: Prisma.Decimal;
      phone: string;
    },
  ) {
    const existing = await tx.business.findFirst({
      where: {
        nameTh: data.nameTh,
        juristicPersonId: data.juristicPersonId,
        deletedAt: null,
      },
    });
    if (existing) {
      return tx.business.update({
        where: { id: existing.id },
        data: {
          address: data.address,
          province: data.province,
          latitude: data.latitude,
          longitude: data.longitude,
          geocodedAt: new Date(),
          phone: data.phone,
        },
      });
    }

    return tx.business.create({
      data: {
        nameTh: data.nameTh,
        juristicPersonId: data.juristicPersonId,
        ownerUserId: null,
        address: data.address,
        province: data.province,
        latitude: data.latitude,
        longitude: data.longitude,
        geocodedAt: new Date(),
        phone: data.phone,
      },
    });
  }

  private async upsertPersonalDevBusiness(
    tx: Prisma.TransactionClient,
    data: {
      ownerUserId: string;
      nameTh: string;
      address: string;
      province: string;
      latitude: Prisma.Decimal;
      longitude: Prisma.Decimal;
      phone: string;
    },
  ) {
    const existing = await tx.business.findFirst({
      where: {
        nameTh: data.nameTh,
        ownerUserId: data.ownerUserId,
        juristicPersonId: null,
        deletedAt: null,
      },
    });
    if (existing) {
      return tx.business.update({
        where: { id: existing.id },
        data: {
          address: data.address,
          province: data.province,
          latitude: data.latitude,
          longitude: data.longitude,
          geocodedAt: new Date(),
          phone: data.phone,
        },
      });
    }

    return tx.business.create({
      data: {
        nameTh: data.nameTh,
        ownerUserId: data.ownerUserId,
        juristicPersonId: null,
        address: data.address,
        province: data.province,
        latitude: data.latitude,
        longitude: data.longitude,
        geocodedAt: new Date(),
        phone: data.phone,
      },
    });
  }

  private upsertDevLicense(
    tx: Prisma.TransactionClient,
    data: {
      licenseNo: string;
      businessId?: string;
      juristicPersonId?: string;
      licenseTypeId: string;
      status: LicenseStatus;
      issueDate: Date;
      expireDate: Date | null;
      suspendedAt?: Date;
      suspensionReason?: string;
    },
  ) {
    return tx.license.upsert({
      where: { licenseNo: data.licenseNo },
      create: {
        licenseNo: data.licenseNo,
        businessId: data.businessId,
        juristicPersonId: data.juristicPersonId,
        licenseTypeId: data.licenseTypeId,
        status: data.status,
        issueDate: data.issueDate,
        expireDate: data.expireDate,
        suspendedAt: data.suspendedAt ?? null,
        suspensionReason: data.suspensionReason ?? null,
      },
      update: {
        businessId: data.businessId,
        juristicPersonId: data.juristicPersonId,
        licenseTypeId: data.licenseTypeId,
        status: data.status,
        issueDate: data.issueDate,
        expireDate: data.expireDate,
        suspendedAt: data.suspendedAt ?? null,
        suspensionReason: data.suspensionReason ?? null,
        deletedAt: null,
      },
    });
  }

  // ───────────────────────── D5 (Tang Rat primary) profile & binding ─────────────────────────

  async getProfile(user: JwtClaims) {
    const dbUser = await this.prisma.systemUser.findUnique({
      where: { id: user.sub, deletedAt: null },
      include: { providerLinks: true },
    });
    if (!dbUser) throw new NotFoundException();

    const identities = dbUser.providerLinks
      .filter((l) => l.isActive)
      .map((l) => ({
        provider: l.provider,
        username:
          l.provider === AuthProvider.self ? dbUser.username : undefined,
        verified: !!l.verifiedAt,
        email: l.providerEmail ?? undefined,
        linkedAt: l.linkedAt?.toISOString(),
        lastLoginAt: l.lastLoginAt?.toISOString(),
        providerPhone: l.providerPhone ?? undefined,
      }));

    return {
      id: dbUser.id,
      displayName: dbUser.fullName,
      email: dbUser.email ?? undefined,
      phone: dbUser.phone ?? undefined,
      roles: dbUser.roles,
      agencyId: dbUser.agencyId,
      citizenIdVerified: !!dbUser.citizenId,
      citizenIdLast4: dbUser.citizenIdLast4 ?? undefined,
      primaryChannel: dbUser.primaryChannel,
      identities,
      canAddPassword: !dbUser.passwordHash,
      canLinkTangRat: !dbUser.providerLinks.some(
        (l) => l.provider === AuthProvider.tang_rat && l.isActive,
      ),
    };
  }

  async updateProfile(
    user: JwtClaims,
    dto: { displayName?: string; email?: string; phone?: string },
  ) {
    const dbUser = await this.prisma.systemUser.findUnique({
      where: { id: user.sub, deletedAt: null },
      include: { providerLinks: true },
    });
    if (!dbUser) throw new NotFoundException();

    const knownEmails = new Set(
      [
        dbUser.email,
        ...dbUser.providerLinks.map((l) => l.providerEmail),
      ].filter(Boolean) as string[],
    );

    const updateData: {
      fullName?: string;
      email?: string;
      phone?: string | null;
    } = {};
    if (dto.displayName) updateData.fullName = dto.displayName;
    if (dto.email) {
      if (!knownEmails.has(dto.email)) {
        // allow setting a brand new email (user choice) — still accepted
      }
      updateData.email = dto.email;
    }
    if (dto.phone !== undefined) updateData.phone = dto.phone || null;

    await this.prisma.systemUser.update({
      where: { id: user.sub },
      data: updateData,
    });
    return this.getProfile(user);
  }

  async addCredentials(
    user: JwtClaims,
    dto: { username: string; password: string },
  ) {
    // Primary happy path: Tang Rat user adds password for web fallback.
    const dbUser = await this.prisma.systemUser.findUnique({
      where: { id: user.sub, deletedAt: null },
    });
    if (!dbUser) throw new NotFoundException();
    if (dbUser.passwordHash) {
      throw new ConflictException('Password already set; use change-password');
    }
    // username unique check (clean 409)
    const exists = await this.prisma.systemUser.findUnique({
      where: { username: dto.username },
      select: { id: true },
    });
    if (exists) throw new ConflictException('Username is already taken');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.systemUser.update({
      where: { id: user.sub },
      data: { username: dto.username, passwordHash },
    });
    // Audit via global interceptor on the PATCH-like; or explicit
    return { success: true };
  }

  async linkTangRat(user: JwtClaims, mToken: string) {
    // Delegate to AuthService (single place for Tang Rat proof verification + D5 merge rules).
    // Always absorbs domain/non-Tang side into Tang Rat canonical; primary Tang Rat flows unaffected.
    await this.auth.linkOrMergeTangRatProof(user.sub, mToken);
    return this.getProfile(user);
  }

  async unlinkTangRat(user: JwtClaims) {
    const links = await this.prisma.authProviderLink.findMany({
      where: {
        userId: user.sub,
        provider: AuthProvider.tang_rat,
        isActive: true,
      },
    });
    if (!links.length) return { success: true };

    const dbUser = await this.prisma.systemUser.findUnique({
      where: { id: user.sub },
      select: { passwordHash: true },
    });
    const remainingAfter = dbUser?.passwordHash ? true : false; // after remove tang, need pw or other tang
    if (!remainingAfter && links.length === 1 /* last one */) {
      // would leave zero methods
      throw new UnprocessableEntityException(
        'Must keep at least one sign-in method',
      );
    }

    await this.prisma.authProviderLink.updateMany({
      where: { id: { in: links.map((l) => l.id) } },
      data: { isActive: false },
    });
    return { success: true };
  }
}
