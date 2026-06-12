import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { AuthProvider, ClientType, Prisma, SystemUser } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { authenticator } from 'otplib';
import { JwtClaims } from '../../common/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { TANG_RAT_PROVIDER } from '../external/external.module';
import type { TangRatProvider } from '../external/tangrat.provider';

interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(TANG_RAT_PROVIDER)
    private readonly tangRat: TangRatProvider,
  ) {}

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private async claimsFor(
    user: SystemUser,
    jti: string,
    authProvider: AuthProvider,
    clientType: ClientType,
    citizenSub?: string,
  ): Promise<JwtClaims> {
    const zones = await this.prisma.userZone.findMany({
      where: { userId: user.id },
      select: { zoneId: true },
    });
    return {
      sub: user.id,
      jti,
      roles: user.roles,
      agency: user.agency,
      zoneIds: zones.map(({ zoneId }) => zoneId),
      authProvider,
      clientType,
      citizenSub,
    };
  }

  private async createSession(
    user: SystemUser,
    authProvider: AuthProvider,
    clientType: ClientType,
    metadata: RequestMetadata,
    tangRatSub?: string,
  ) {
    const refreshToken = randomBytes(64).toString('hex');
    const jti = randomUUID();
    const expiresAt = new Date();
    expiresAt.setUTCDate(
      expiresAt.getUTCDate() + Number(process.env.REFRESH_TOKEN_DAYS ?? 7),
    );
    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: this.hash(refreshToken),
        accessTokenJti: jti,
        authProvider,
        clientType,
        tangRatSub,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        expiresAt,
      },
    });
    const claims = await this.claimsFor(
      user,
      jti,
      authProvider,
      clientType,
      tangRatSub,
    );
    const accessToken = await this.jwt.signAsync(claims, {
      algorithm: 'RS256',
      expiresIn: (process.env.ACCESS_TOKEN_TTL ??
        '15m') as JwtSignOptions['expiresIn'],
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        roles: user.roles,
        agency: user.agency,
      },
    };
  }

  private async audit(
    userId: string | null,
    action: string,
    metadata: RequestMetadata,
    afterValue?: Prisma.InputJsonValue,
  ) {
    await this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType: 'auth',
        afterValue,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });
  }

  async tangRatLogin(mToken: string, metadata: RequestMetadata) {
    const identity = await this.tangRat.verify(mToken);
    let link = await this.prisma.authProviderLink.findUnique({
      where: {
        provider_providerSub: {
          provider: AuthProvider.tang_rat,
          providerSub: identity.sub,
        },
      },
      include: { user: true },
    });
    if (!link) {
      const user = await this.prisma.systemUser.create({
        data: {
          fullName: identity.fullName,
          email: identity.email,
          phone: identity.phone,
          roles: ['public'],
        },
      });
      link = await this.prisma.authProviderLink.create({
        data: {
          userId: user.id,
          provider: AuthProvider.tang_rat,
          providerSub: identity.sub,
          providerEmail: identity.email,
          providerName: identity.fullName,
        },
        include: { user: true },
      });
    }
    if (
      !link.isActive ||
      !link.user.isActive ||
      link.user.deletedAt ||
      link.user.roles.includes('admin')
    ) {
      throw new ForbiddenException();
    }
    await this.prisma.$transaction([
      this.prisma.authProviderLink.update({
        where: { id: link.id },
        data: { lastLoginAt: new Date() },
      }),
      this.prisma.systemUser.update({
        where: { id: link.user.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);
    const result = await this.createSession(
      link.user,
      AuthProvider.tang_rat,
      ClientType.app,
      metadata,
      identity.sub,
    );
    await this.audit(link.user.id, 'LOGIN', metadata);
    return result;
  }

  async selfLogin(
    username: string,
    password: string,
    totpCode: string,
    metadata: RequestMetadata,
  ) {
    const user = await this.prisma.systemUser.findUnique({
      where: { username },
    });
    const invalid = () => new UnauthorizedException('Invalid credentials');
    if (
      !user ||
      !user.passwordHash ||
      !user.isActive ||
      user.deletedAt ||
      !user.roles.includes('admin')
    ) {
      throw invalid();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException('Account temporarily locked', HttpStatus.LOCKED);
    }
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    const totpValid =
      (process.env.NODE_ENV === 'development' && totpCode === '000000') ||
      (!!user.totpSecret && authenticator.check(totpCode, user.totpSecret));
    if (!passwordValid || !totpValid) {
      const attempts = user.failedLoginCount + 1;
      await this.prisma.systemUser.update({
        where: { id: user.id },
        data: {
          failedLoginCount: attempts,
          lockedUntil:
            attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null,
        },
      });
      throw invalid();
    }
    await this.prisma.systemUser.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });
    if (user.mustChangePassword) {
      return {
        requiresPasswordChange: true,
        tempToken: await this.jwt.signAsync(
          {
            sub: user.id,
            jti: randomUUID(),
            roles: user.roles,
            agency: null,
            zoneIds: [],
            authProvider: AuthProvider.self,
            clientType: ClientType.web_admin,
            pwc: true,
          } satisfies JwtClaims,
          { algorithm: 'RS256', expiresIn: '5m' },
        ),
      };
    }
    const result = await this.createSession(
      user,
      AuthProvider.self,
      ClientType.web_admin,
      metadata,
    );
    await this.audit(user.id, 'LOGIN', metadata);
    return result;
  }

  async refresh(refreshToken: string, metadata: RequestMetadata) {
    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: this.hash(refreshToken) },
      include: { user: true },
    });
    if (!session) throw new UnauthorizedException();
    if (session.isRevoked) {
      await this.prisma.userSession.updateMany({
        where: { userId: session.userId, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokeReason: 'SUSPICIOUS',
        },
      });
      await this.audit(session.userId, 'SUSPICIOUS_REFRESH', metadata);
      throw new UnauthorizedException();
    }
    if (session.expiresAt < new Date() || !session.user.isActive) {
      throw new UnauthorizedException();
    }
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokeReason: 'ROTATED',
      },
    });
    return this.createSession(
      session.user,
      session.authProvider,
      session.clientType,
      metadata,
      session.tangRatSub ?? undefined,
    );
  }

  async logout(user: JwtClaims, metadata: RequestMetadata) {
    await this.prisma.userSession.updateMany({
      where: { userId: user.sub, accessTokenJti: user.jti },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokeReason: 'LOGOUT',
      },
    });
    await this.audit(user.sub, 'LOGOUT', metadata);
    return { success: true };
  }

  async changePassword(user: JwtClaims, newPassword: string) {
    if (user.authProvider !== AuthProvider.self) {
      throw new ForbiddenException();
    }
    await this.prisma.$transaction([
      this.prisma.systemUser.update({
        where: { id: user.sub },
        data: {
          passwordHash: await bcrypt.hash(newPassword, 12),
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.userSession.updateMany({
        where: {
          userId: user.sub,
          accessTokenJti: { not: user.jti },
          isRevoked: false,
        },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokeReason: 'FORCED',
        },
      }),
    ]);
    return { success: true };
  }

  async forgotPassword(username: string, ipAddress?: string) {
    const user = await this.prisma.systemUser.findUnique({
      where: { username },
    });
    if (!user?.passwordHash || user.deletedAt) return { success: true };
    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + 15 * 60_000),
        ipAddress,
      },
    });
    // MOCK: replace in UAT with a notification provider.
    console.info(`Password reset token for ${username}: ${token}`);
    return { success: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new NotFoundException('Reset token not found or expired');
    }
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.systemUser.update({
        where: { id: record.userId },
        data: {
          passwordHash: await bcrypt.hash(newPassword, 12),
          mustChangePassword: false,
        },
      }),
      this.prisma.userSession.updateMany({
        where: { userId: record.userId, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokeReason: 'FORCED',
        },
      }),
    ]);
    return { success: true };
  }
}
