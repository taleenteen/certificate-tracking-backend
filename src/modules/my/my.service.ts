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
    let business = await this.prisma.business.findFirst({
      where: { ownerUserId: userId, deletedAt: null },
    });

    if (!business) {
      business = await this.prisma.business.create({
        data: {
          nameTh: 'บริษัท ทดสอบระบบ จำกัด',
          ownerUserId: userId,
          address: '99/1 ถ.ทดสอบ แขวงทดสอบ เขตทดสอบ',
          province: 'กรุงเทพมหานคร',
        },
      });
    }

    const types = await this.prisma.licenseType.findMany({
      where: { isActive: true },
      include: { agency: { select: { code: true } } },
    });
    if (!types.length)
      throw new NotFoundException('No active license types — run seed first');
    const lt = types[Math.floor(Math.random() * types.length)];

    const daysLeft = 5 + Math.floor(Math.random() * 20); // 5–24 days — always "expiring soon"
    const now = new Date();
    const expireDate = new Date(now.getTime() + daysLeft * 86_400_000);
    const licenseNo = `DEV-${Date.now().toString(36).toUpperCase()}`;

    const license = await this.prisma.license.create({
      data: {
        licenseNo,
        businessId: business.id,
        licenseTypeId: lt.id,
        status: LicenseStatus.ACTIVE,
        issueDate: now,
        expireDate,
      },
      include: LICENSE_INCLUDE,
    });

    return this.toLicenseDto(license);
  }

  // MOCK: replace in UAT — prototype-only helper for frontend demo data.
  async createDevJuristicLicenseDemo(userId: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev seed is disabled in production');
    }

    const user = await this.prisma.systemUser.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, fullName: true },
    });
    if (!user) throw new NotFoundException();

    const demo = await this.prisma.$transaction(async (tx) => {
      const { diwType, hazmatType, acfsType } =
        await this.ensureDevLicenseTypes(tx);
      const token = user.id.replace(/-/g, '').slice(0, 10).toUpperCase();
      const registrationId = `DEV${token.slice(0, 10)}`.padEnd(13, '0');

      const juristicPerson = await tx.juristicPerson.upsert({
        where: { registrationId },
        create: {
          registrationId,
          nameTh: `บริษัท ทดสอบของ ${user.fullName} จำกัด`,
          nameEn: `Demo Company ${token} Co., Ltd.`,
          juristicType: 'บริษัทจำกัด',
          address:
            '99/99 อาคารทดสอบ ถนนต้นแบบ แขวงทดสอบ เขตทดสอบ กรุงเทพมหานคร',
        },
        update: {
          nameTh: `บริษัท ทดสอบของ ${user.fullName} จำกัด`,
          nameEn: `Demo Company ${token} Co., Ltd.`,
          juristicType: 'บริษัทจำกัด',
          address:
            '99/99 อาคารทดสอบ ถนนต้นแบบ แขวงทดสอบ เขตทดสอบ กรุงเทพมหานคร',
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

      const factory = await this.upsertDevBusiness(tx, {
        nameTh: `โรงงานต้นแบบ ${user.fullName}`,
        juristicPersonId: juristicPerson.id,
        address: '88/8 นิคมอุตสาหกรรมต้นแบบ ถนนอุตสาหกรรม แขวงทดสอบ เขตทดสอบ',
        province: 'กรุงเทพมหานคร',
        latitude: new Prisma.Decimal('13.756300'),
        longitude: new Prisma.Decimal('100.501800'),
        phone: '021234567',
      });
      const warehouse = await this.upsertDevBusiness(tx, {
        nameTh: `คลังสินค้าและศูนย์กระจายสินค้า ${user.fullName}`,
        juristicPersonId: juristicPerson.id,
        address:
          '55/5 โครงการคลังสินค้าต้นแบบ ถนนโลจิสติกส์ แขวงทดสอบ เขตทดสอบ',
        province: 'กรุงเทพมหานคร',
        latitude: new Prisma.Decimal('13.761300'),
        longitude: new Prisma.Decimal('100.509800'),
        phone: '029876543',
      });

      const issueDate = new Date();
      issueDate.setUTCFullYear(issueDate.getUTCFullYear() - 1);
      const hazmatExpire = new Date();
      hazmatExpire.setUTCDate(hazmatExpire.getUTCDate() + 45);
      const acfsExpire = new Date();
      acfsExpire.setUTCFullYear(acfsExpire.getUTCFullYear() + 1);

      await Promise.all([
        this.upsertDevLicense(tx, {
          licenseNo: `DEV-${token}-RNG4`,
          businessId: factory.id,
          licenseTypeId: diwType.id,
          status: LicenseStatus.ACTIVE,
          issueDate,
          expireDate: null,
        }),
        this.upsertDevLicense(tx, {
          licenseNo: `DEV-${token}-HAZMAT`,
          businessId: factory.id,
          licenseTypeId: hazmatType.id,
          status: LicenseStatus.ACTIVE,
          issueDate,
          expireDate: hazmatExpire,
        }),
        this.upsertDevLicense(tx, {
          licenseNo: `DEV-${token}-ACFS`,
          businessId: warehouse.id,
          licenseTypeId: acfsType.id,
          status: LicenseStatus.ACTIVE,
          issueDate,
          expireDate: acfsExpire,
        }),
        this.upsertDevLicense(tx, {
          licenseNo: `DEV-${token}-SUSPENDED`,
          businessId: warehouse.id,
          licenseTypeId: hazmatType.id,
          status: LicenseStatus.SUSPENDED,
          issueDate,
          expireDate: hazmatExpire,
          suspendedAt: new Date(),
          suspensionReason: 'ระงับชั่วคราวเพื่อทดสอบ UI',
        }),
      ]);

      return juristicPerson;
    });

    const groups = await this.getJuristicLicenseGroups(user.id);
    return {
      success: true,
      juristicId: demo.id,
      messageTh: 'สร้างข้อมูลนิติบุคคลตัวอย่างเรียบร้อย',
      groups,
    };
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

    return {
      juristicId: membership.juristicPersonId,
      nameTh: membership.juristicPerson.nameTh,
      nameEn: membership.juristicPerson.nameEn ?? undefined,
      registrationId: membership.juristicPerson.registrationId,
      myRole: membership.role,
      businessCount: businesses.length,
      licenseCount: businesses.reduce(
        (total, business) => total + business.licenseCount,
        0,
      ),
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
