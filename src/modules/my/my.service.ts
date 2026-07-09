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
  JuristicRole,
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

const LICENSE_INCLUDE = {
  licenseType: { include: { agency: { select: { code: true } } } },
  business: {
    include: {
      owner: { select: { fullName: true } },
      juristicPerson: { select: { nameTh: true, registrationId: true } },
    },
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
            },
            orderBy: { licenseNo: 'asc' },
          },
        },
        orderBy: { nameTh: 'asc' },
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
    return rows.map((r) => this.toLicenseDto(r));
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
    return rows.map((r) => this.toLicenseDto(r));
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
    return rows.map((r) => this.toLicenseDto(r));
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

    return memberships.map((membership) =>
      this.toJuristicLicenseGroupDto(membership),
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

    const licenses = business.licenses.map((license) => ({
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
    }));

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
    const user = await this.devSeedUser(userId);
    const license = await this.prisma.$transaction(async (tx) => {
      const seeded = await this.seedPersonalDevData(tx, user);
      return seeded.license;
    });

    return this.toLicenseDto(license);
  }

  // MOCK: replace in UAT — prototype helper that seeds both personal and juristic demo data.
  async createDevDemoData(userId: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev seed is disabled in production');
    }

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
      messageTh: 'สร้างข้อมูลตัวอย่างครบชุดเรียบร้อย',
      groups,
    };
  }

  // MOCK: replace in UAT — prototype-only helper for frontend demo data.
  async createDevJuristicLicenseDemo(userId: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev seed is disabled in production');
    }

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

  private async seedPersonalDevData(
    tx: Prisma.TransactionClient,
    user: DevSeedUser,
  ) {
    const { hazmatType } = await this.ensureDevLicenseTypes(tx);
    const token = this.devToken(user.id);
    const location = this.devLocation(user.id, 'individual', 0);
    const business = await this.upsertPersonalDevBusiness(tx, {
      ownerUserId: user.id,
      nameTh: `กิจการทดสอบบุคคลธรรมดา ${token} - ${location.province}`,
      address: this.devAddress(location, 99, 'อาคารทดสอบบุคคลธรรมดา'),
      province: location.province,
      latitude: new Prisma.Decimal(location.latitude.toFixed(6)),
      longitude: new Prisma.Decimal(location.longitude.toFixed(6)),
      phone: this.devPhone(token, 1),
    });

    const now = new Date();
    const issueDate = new Date(now);
    issueDate.setUTCFullYear(issueDate.getUTCFullYear() - 1);
    const expireDate = new Date(now.getTime() + 14 * 86_400_000);
    const licenseNo = `DEV-${token}-IND-HAZMAT`;

    await this.upsertDevLicense(tx, {
      licenseNo,
      businessId: business.id,
      licenseTypeId: hazmatType.id,
      status: LicenseStatus.ACTIVE,
      issueDate,
      expireDate,
    });

    const license = await tx.license.findUniqueOrThrow({
      where: { licenseNo },
      include: LICENSE_INCLUDE,
    });

    return { businessId: business.id, license };
  }

  private async seedJuristicDevData(
    tx: Prisma.TransactionClient,
    user: DevSeedUser,
  ) {
    const { diwType, hazmatType, acfsType } =
      await this.ensureDevLicenseTypes(tx);
    const token = this.devToken(user.id);
    const registrationId = `DEV${token.slice(0, 10)}`.padEnd(13, '0');
    const companyLocation = this.devLocation(user.id, 'juristic', 0);

    const juristicPerson = await tx.juristicPerson.upsert({
      where: { registrationId },
      create: {
        registrationId,
        nameTh: `บริษัท ทดสอบ ${token} จำกัด`,
        nameEn: `Demo Company ${token} Co., Ltd.`,
        juristicType: 'บริษัทจำกัด',
        address: this.devAddress(companyLocation, 199, 'สำนักงานใหญ่'),
      },
      update: {
        nameTh: `บริษัท ทดสอบ ${token} จำกัด`,
        nameEn: `Demo Company ${token} Co., Ltd.`,
        juristicType: 'บริษัทจำกัด',
        address: this.devAddress(companyLocation, 199, 'สำนักงานใหญ่'),
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

    const factoryLocation = this.devLocation(user.id, 'factory', 1);
    const warehouseLocation = this.devLocation(user.id, 'warehouse', 2);
    const factory = await this.upsertDevBusiness(tx, {
      nameTh: `โรงงานต้นแบบ ${token} - ${factoryLocation.province}`,
      juristicPersonId: juristicPerson.id,
      address: this.devAddress(factoryLocation, 88, 'โรงงานต้นแบบ'),
      province: factoryLocation.province,
      latitude: new Prisma.Decimal(factoryLocation.latitude.toFixed(6)),
      longitude: new Prisma.Decimal(factoryLocation.longitude.toFixed(6)),
      phone: this.devPhone(token, 2),
    });
    const warehouse = await this.upsertDevBusiness(tx, {
      nameTh: `คลังสินค้าต้นแบบ ${token} - ${warehouseLocation.province}`,
      juristicPersonId: juristicPerson.id,
      address: this.devAddress(warehouseLocation, 55, 'คลังสินค้าต้นแบบ'),
      province: warehouseLocation.province,
      latitude: new Prisma.Decimal(warehouseLocation.latitude.toFixed(6)),
      longitude: new Prisma.Decimal(warehouseLocation.longitude.toFixed(6)),
      phone: this.devPhone(token, 3),
    });

    const issueDate = new Date();
    issueDate.setUTCFullYear(issueDate.getUTCFullYear() - 1);
    const hazmatExpire = new Date();
    hazmatExpire.setUTCDate(hazmatExpire.getUTCDate() + 45);
    const acfsExpire = new Date();
    acfsExpire.setUTCFullYear(acfsExpire.getUTCFullYear() + 1);

    const rng4License = await this.upsertDevLicense(tx, {
      licenseNo: `DEV-${token}-RNG4`,
      businessId: factory.id,
      licenseTypeId: diwType.id,
      status: LicenseStatus.ACTIVE,
      issueDate,
      expireDate: null,
    });
    const hazmatLicense = await this.upsertDevLicense(tx, {
      licenseNo: `DEV-${token}-HAZMAT`,
      businessId: factory.id,
      licenseTypeId: hazmatType.id,
      status: LicenseStatus.ACTIVE,
      issueDate,
      expireDate: hazmatExpire,
    });
    const acfsLicense = await this.upsertDevLicense(tx, {
      licenseNo: `DEV-${token}-ACFS`,
      businessId: warehouse.id,
      licenseTypeId: acfsType.id,
      status: LicenseStatus.ACTIVE,
      issueDate,
      expireDate: acfsExpire,
    });
    const suspendedLicense = await this.upsertDevLicense(tx, {
      licenseNo: `DEV-${token}-SUSPENDED`,
      businessId: warehouse.id,
      licenseTypeId: hazmatType.id,
      status: LicenseStatus.SUSPENDED,
      issueDate,
      expireDate: hazmatExpire,
      suspendedAt: new Date(),
      suspensionReason: 'ระงับชั่วคราวเพื่อทดสอบ UI',
    });

    return {
      juristicId: juristicPerson.id,
      businessIds: [factory.id, warehouse.id],
      licenseIds: [
        rng4License.id,
        hazmatLicense.id,
        acfsLicense.id,
        suspendedLicense.id,
      ],
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

  private toLicenseDto(license: MyLicenseRow) {
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
    };
  }

  private toJuristicLicenseGroupDto(membership: JuristicLicenseGroupRow) {
    // TODO(schema): support License rows scoped directly to JuristicPerson.
    const corporateLicenses: never[] = [];
    const businesses = membership.juristicPerson.businesses.map((business) => {
      const licenses = business.licenses.map((license) => ({
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
      }));

      return {
        id: business.id,
        nameTh: business.nameTh,
        province: business.province,
        licenseCount: licenses.length,
        licenses,
      };
    });

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
      businessId: string;
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
        licenseTypeId: data.licenseTypeId,
        status: data.status,
        issueDate: data.issueDate,
        expireDate: data.expireDate,
        suspendedAt: data.suspendedAt ?? null,
        suspensionReason: data.suspensionReason ?? null,
      },
      update: {
        businessId: data.businessId,
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
