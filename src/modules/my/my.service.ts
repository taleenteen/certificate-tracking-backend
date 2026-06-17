import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuthProvider } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtClaims } from '../../common/auth.types';
import { AuthService } from '../auth/auth.service';
import { DBD_PROVIDER, TANG_RAT_PROVIDER } from '../external/external.module';
import type { DbdProvider } from '../external/dbd.provider';
import type { TangRatProvider } from '../external/tangrat.provider';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DBD_PROVIDER) private readonly dbd: DbdProvider,
    @Inject(TANG_RAT_PROVIDER) private readonly tangRat: TangRatProvider,
    private readonly auth: AuthService, // for reusable D5 link/merge (Tang Rat canonical always wins)
  ) {}

  getLicensesPersonal(userId: string) {
    return this.prisma.license.findMany({
      where: {
        deletedAt: null,
        business: { ownerUserId: userId, deletedAt: null },
      },
      include: { licenseType: true, business: true },
    });
  }

  getLicensesByJuristicId(juristicPersonId: string) {
    return this.prisma.license.findMany({
      where: {
        deletedAt: null,
        business: { deletedAt: null, juristicPersonId },
      },
      include: { licenseType: true, business: true },
    });
  }

  async getLicensesJuristic(user: JwtClaims) {
    const match = await this.dbd.lookup(user.citizenSub ?? '');
    if (!match) throw new NotFoundException({ found: false });
    const juristicPerson = await this.prisma.juristicPerson.findUnique({
      where: { registrationId: match.registrationId },
    });
    if (!juristicPerson) throw new NotFoundException({ found: false });
    return this.prisma.license.findMany({
      where: {
        deletedAt: null,
        business: { deletedAt: null, juristicPersonId: juristicPerson.id },
      },
      include: { licenseType: true, business: true },
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
