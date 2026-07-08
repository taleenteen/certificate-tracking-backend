import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import {
  AuthProvider,
  ClientType,
  JuristicRole,
  Prisma,
  SystemUser,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'crypto';
import { authenticator } from 'otplib';
import { JwtClaims } from '../../common/auth.types';
import { isAdminTier, maxRank } from '../../common/auth.roles'; // for D5 cross-tier guard in merges (Tang Rat primary)
import { PrismaService } from '../../prisma/prisma.service';
import {
  DGA_OIDC_PROVIDER,
  TANG_RAT_PROVIDER,
} from '../external/external.module';
import type { DgaOidcProvider } from '../external/dga-oidc.provider';
import type { TangRatProvider } from '../external/tangrat.provider';
import {
  storeCitizenId,
  isValidThaiCitizenId,
  last4,
} from '../../common/crypto/citizen-id';
import { ProfileChannel } from '@prisma/client';
import { jwtKeys } from './auth.keys';

interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

interface DgaOidcStatePayload {
  nonce?: string;
  exp?: number;
  redirectUri?: string;
  scope?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(TANG_RAT_PROVIDER)
    private readonly tangRat: TangRatProvider,
    @Inject(DGA_OIDC_PROVIDER)
    private readonly dgaOidc: DgaOidcProvider,
  ) {}

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private providerTokenKey() {
    const secret =
      process.env.DGA_OIDC_ID_TOKEN_ENCRYPTION_KEY ??
      process.env.DGA_OIDC_STATE_SECRET ??
      jwtKeys().privateKey;
    return createHash('sha256').update(secret).digest();
  }

  private encryptProviderToken(token: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.providerTokenKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  private decryptProviderToken(value: string | null | undefined) {
    if (!value) return undefined;
    if (!value.startsWith('v1:')) return value;
    const [, iv, tag, encrypted] = value.split(':');
    if (!iv || !tag || !encrypted) throw new UnauthorizedException();
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.providerTokenKey(),
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new UnauthorizedException();
    }
  }

  // D5 helpers (Tang Rat primary).
  // Owner decision: citizen ID is stored as plaintext in `citizenId`.
  // We never rename the Prisma field (Golden Rule).
  private storeCitizenIdSafe(raw?: string): string | null {
    if (!raw || !isValidThaiCitizenId(raw)) return null;
    return storeCitizenId(raw);
  }
  private isValidCitizenId(raw?: string): boolean {
    return !!raw && isValidThaiCitizenId(raw);
  }
  private maskEmail(e: string): string {
    return e.replace(/^(.).+(@.+)$/, '$1***$2');
  }

  private oidcStateSecret() {
    return process.env.DGA_OIDC_STATE_SECRET ?? jwtKeys().privateKey;
  }

  private dgaRedirectUris() {
    const configured = process.env.DGA_OIDC_ALLOWED_REDIRECT_URIS
      ? process.env.DGA_OIDC_ALLOWED_REDIRECT_URIS.split(',')
      : [process.env.DGA_OIDC_REDIRECT_URI].filter(Boolean);
    return configured
      .filter((uri): uri is string => typeof uri === 'string')
      .map((uri) => uri.trim())
      .filter(Boolean);
  }

  private resolveDgaRedirectUri(redirectUri?: string) {
    const allowed = this.dgaRedirectUris();
    const selected = redirectUri ?? allowed[0];
    if (!selected || !allowed.includes(selected)) {
      throw new BadRequestException('Invalid redirect URI');
    }
    return selected;
  }

  private resolveDgaScope(scope?: string) {
    const selected = scope ?? process.env.DGA_OIDC_SCOPE ?? 'openid';
    const allowed = new Set([
      'openid',
      'citizen_id',
      'given_name',
      'family_name',
    ]);
    const values = selected.split(/\s+/).filter(Boolean);
    if (
      !values.includes('openid') ||
      values.some((value) => !allowed.has(value))
    ) {
      throw new BadRequestException('Invalid scope');
    }
    return values.join(' ');
  }

  private signOidcState(payload: Record<string, unknown>) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.oidcStateSecret())
      .update(body)
      .digest('base64url');
    return `${body}.${signature}`;
  }

  private verifyOidcState(state: string) {
    const [body, signature] = state.split('.');
    if (!body || !signature) throw new BadRequestException('Invalid state');
    const expected = createHmac('sha256', this.oidcStateSecret())
      .update(body)
      .digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new BadRequestException('Invalid state');
    }
    let payload: DgaOidcStatePayload;
    try {
      payload = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as DgaOidcStatePayload;
    } catch {
      throw new BadRequestException('Invalid state');
    }
    if (!payload.nonce || !payload.exp || payload.exp < Date.now()) {
      throw new BadRequestException('Expired state');
    }
    return payload;
  }

  private claimsFor(
    user: SystemUser,
    jti: string,
    authProvider: AuthProvider,
    clientType: ClientType,
    citizenSub?: string,
    juristicCtx?: { juristicId: string; role: JuristicRole },
  ): JwtClaims {
    return {
      sub: user.id,
      jti,
      roles: user.roles,
      agencyId: user.agencyId,
      authProvider,
      clientType,
      citizenSub,
      // D5 (Tang Rat primary): flags only, no PII
      hasCitizenId: !!user.citizenId,
      channel: authProvider === AuthProvider.tang_rat ? 'tang_rat' : 'domain',
      // D6: juristic context claims (only when in company mode)
      ...(juristicCtx && {
        activeJuristicId: juristicCtx.juristicId,
        juristicRole: juristicCtx.role,
      }),
    };
  }

  // D6: re-mint the access token for an existing session (context switch or refresh carry-over).
  // Does NOT create a new session row — only rotates the JTI + updates activeJuristicId.
  private async reissueAccessToken(
    sessionId: string,
    user: SystemUser,
    session: {
      authProvider: AuthProvider;
      clientType: ClientType;
      tangRatSub: string | null;
    },
    juristicCtx?: { juristicId: string; role: JuristicRole } | null,
  ): Promise<string> {
    const newJti = randomUUID();
    const claims = this.claimsFor(
      user,
      newJti,
      session.authProvider,
      session.clientType,
      session.tangRatSub ?? undefined,
      juristicCtx ?? undefined,
    );
    const accessToken = await this.jwt.signAsync(claims, {
      algorithm: 'RS256',
      expiresIn: (process.env.ACCESS_TOKEN_TTL ??
        '15m') as JwtSignOptions['expiresIn'],
    });
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: {
        accessTokenJti: newJti,
        activeJuristicId: juristicCtx?.juristicId ?? null,
      },
    });
    return accessToken;
  }

  private async createSession(
    user: SystemUser,
    authProvider: AuthProvider,
    clientType: ClientType,
    metadata: RequestMetadata,
    tangRatSub?: string,
    juristicCtx?: { juristicId: string; role: JuristicRole },
    providerIdToken?: string,
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
        providerIdToken: providerIdToken
          ? this.encryptProviderToken(providerIdToken)
          : undefined,
        activeJuristicId: juristicCtx?.juristicId ?? null,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        expiresAt,
      },
    });
    const claims = this.claimsFor(
      user,
      jti,
      authProvider,
      clientType,
      tangRatSub,
      juristicCtx,
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
        agencyId: user.agencyId,
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

  /**
   * Public self-registration. Creates a read-only `public` account with a
   * bcrypt-hashed password and immediately issues a session (signup logs you
   * in). bcrypt cost 12 — the password is never stored or logged in clear text.
   * Username uniqueness is enforced both by a pre-check (clean 409) and by the
   * DB unique constraint (race-safe via the P2002 catch below).
   */
  async register(
    dto: {
      username: string;
      email: string;
      password: string;
      fullName: string;
      phone?: string;
    },
    metadata: RequestMetadata,
  ) {
    const existing = await this.prisma.systemUser.findUnique({
      where: { username: dto.username },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Username is already taken');

    // bcrypt automatically generates a per-password salt; cost 12 per §12.
    const passwordHash = await bcrypt.hash(dto.password, 12);

    let user: SystemUser;
    try {
      user = await this.prisma.systemUser.create({
        data: {
          username: dto.username,
          email: dto.email,
          fullName: dto.fullName,
          phone: dto.phone,
          passwordHash,
          roles: ['public'],
        },
      });
    } catch (error) {
      // Two concurrent signups racing the same username land here.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Username is already taken');
      }
      throw error;
    }

    const result = await this.createSession(
      user,
      AuthProvider.self,
      ClientType.app,
      metadata,
    );

    // D5 secondary hint (non-blocking): if a verified Tang Rat account already has this email, suggest linking from profile later.
    let suggestion: { type: 'email_match'; maskedEmail: string } | undefined;
    if (dto.email) {
      const candidate = await this.prisma.systemUser.findFirst({
        where: {
          email: dto.email,
          citizenId: { not: null },
          id: { not: user.id },
          deletedAt: null,
        },
        select: { email: true },
      });
      if (candidate?.email) {
        suggestion = {
          type: 'email_match',
          maskedEmail: this.maskEmail(candidate.email),
        };
      }
    }

    await this.audit(user.id, 'REGISTER', metadata);
    if (suggestion) (result as any).linkSuggestion = suggestion; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
    return result;
  }

  /**
   * Password login for NON-admin self-registered users (the `public` app).
   * Admin tier is rejected here and must use {@link selfLogin} (password +
   * TOTP via the web portal, per decision D3). Mirrors selfLogin's lockout
   * (5 failures → 15-min lock) and first-login password-change challenge.
   */
  async passwordLogin(
    username: string,
    password: string,
    metadata: RequestMetadata,
  ) {
    // Accept username or email — users often type their email in the login box.
    const user = await this.prisma.systemUser.findFirst({
      where: { OR: [{ username }, { email: username }], deletedAt: null },
    });
    const invalid = () => new UnauthorizedException('Invalid credentials');
    if (
      !user ||
      !user.passwordHash ||
      !user.isActive ||
      user.deletedAt ||
      isAdminTier(user.roles)
    ) {
      // Admin tier must authenticate via /auth/self (web_admin + TOTP).
      throw invalid();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException('Account temporarily locked', HttpStatus.LOCKED);
    }
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
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
      // Staff seeded with a temp password must rotate it before getting tokens.
      return {
        requiresPasswordChange: true,
        tempToken: await this.jwt.signAsync(
          {
            sub: user.id,
            jti: randomUUID(),
            roles: user.roles,
            agencyId: null,
            authProvider: AuthProvider.self,
            clientType: ClientType.app,
            pwc: true,
          } satisfies JwtClaims,
          { algorithm: 'RS256', expiresIn: '5m' },
        ),
      };
    }
    const result = await this.createSession(
      user,
      AuthProvider.self,
      ClientType.app,
      metadata,
    );
    await this.audit(user.id, 'LOGIN', metadata);
    return result;
  }

  async createDgaOidcAuthorizeUrl(dto: {
    redirectUri?: string;
    scope?: string;
  }) {
    const issuedAt = Date.now();
    const expiresAt = new Date(issuedAt + 10 * 60 * 1000);
    const redirectUri = this.resolveDgaRedirectUri(dto.redirectUri);
    const scope = this.resolveDgaScope(dto.scope);
    const nonce = randomUUID();
    const state = this.signOidcState({
      nonce,
      iat: issuedAt,
      exp: expiresAt.getTime(),
      redirectUri,
      scope,
    });
    await this.prisma.dgaOidcState.create({
      data: {
        nonce,
        stateHash: this.hash(state),
        redirectUri,
        scope,
        expiresAt,
      },
    });
    return {
      authorizeUrl: this.dgaOidc.authorizeUrl({
        state,
        redirectUri,
        scope,
      }),
      state,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async dgaOidcCallback(
    dto: { code: string; state: string; redirectUri?: string },
    metadata: RequestMetadata,
  ) {
    const statePayload = this.verifyOidcState(dto.state);
    const redirectUri = this.resolveDgaRedirectUri(dto.redirectUri);
    if (statePayload.redirectUri !== redirectUri) {
      throw new BadRequestException('Invalid state');
    }
    const consumed = await this.prisma.dgaOidcState.updateMany({
      where: {
        nonce: statePayload.nonce!,
        stateHash: this.hash(dto.state),
        redirectUri,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException('Invalid state');
    }
    const token = await this.dgaOidc.exchangeCode(dto.code, redirectUri);
    const identity = await this.dgaOidc.userInfo(token.accessToken);
    return this.loginTangRatIdentity(identity, metadata, token.idToken);
  }

  async tangRatLogin(mToken: string, metadata: RequestMetadata) {
    const identity = await this.tangRat.verify(mToken);
    return this.loginTangRatIdentity(identity, metadata);
  }

  private async loginTangRatIdentity(
    identity: {
      sub: string;
      fullName: string;
      email?: string;
      phone?: string;
      citizenId?: string;
    },
    metadata: RequestMetadata,
    providerIdToken?: string,
  ) {
    // MOCK: replace in UAT. citizenId (if present) is Tang Rat-verified (primary per D5).
    const link = await this.prisma.authProviderLink.findUnique({
      where: {
        provider_providerSub: {
          provider: AuthProvider.tang_rat,
          providerSub: identity.sub,
        },
      },
      include: { user: true },
    });

    if (link) {
      // Existing tang_rat link.
      if (identity.citizenId && !link.user.citizenId) {
        // Back-fill (plaintext storage per owner 2026-06-15 decision)
        const rawId = identity.citizenId;
        if (this.isValidCitizenId(rawId)) {
          await this.prisma.systemUser.update({
            where: { id: link.user.id },
            data: {
              citizenId: this.storeCitizenIdSafe(rawId)!, // store plaintext
              citizenIdVerifiedAt: new Date(),
              citizenIdLast4: last4(rawId),
              primaryChannel: ProfileChannel.tang_rat,
            },
          });
        }
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.authProviderLink.update({
          where: { id: link.id },
          data: { lastLoginAt: new Date(), verifiedAt: new Date() },
        });
        await tx.systemUser.update({
          where: { id: link.user.id },
          data: { lastLoginAt: new Date() },
        });
      });
      const result = await this.createSession(
        link.user,
        AuthProvider.tang_rat,
        ClientType.app,
        metadata,
        identity.sub,
        undefined,
        providerIdToken,
      );
      await this.audit(link.user.id, 'LOGIN', metadata);
      return result;
    }

    // No link for this sub yet.
    if (identity.citizenId) {
      const rawId = this.storeCitizenIdSafe(identity.citizenId);
      if (rawId) {
        // Direct plaintext match (owner decision: searchable storage)
        const owner = await this.prisma.systemUser.findFirst({
          where: { citizenId: rawId, deletedAt: null },
        });
        if (owner) {
          // Same verified citizen already has canonical account (primary Tang Rat path).
          // Attach this sub safely (Tang Rat verified the ID).
          await this.prisma.authProviderLink.create({
            data: {
              userId: owner.id,
              provider: AuthProvider.tang_rat,
              providerSub: identity.sub,
              providerEmail: identity.email,
              providerName: identity.fullName,
              providerPhone: identity.phone,
              verifiedAt: new Date(),
            },
          });
          await this.audit(owner.id, 'IDENTITY_LINK_AUTO', metadata, {
            tangRatSub: identity.sub,
          });
          const result = await this.createSession(
            owner,
            AuthProvider.tang_rat,
            ClientType.app,
            metadata,
            identity.sub,
            undefined,
            providerIdToken,
          );
          await this.audit(owner.id, 'LOGIN', metadata);
          return result;
        }
      }
    }

    // No verified owner. Create new canonical from the verified Tang Rat identity (primary path).
    const user = await this.prisma.systemUser.create({
      data: {
        fullName: identity.fullName,
        email: identity.email,
        phone: identity.phone,
        roles: ['public'],
        primaryChannel: ProfileChannel.tang_rat,
        citizenId: this.storeCitizenIdSafe(identity.citizenId), // plaintext
        citizenIdVerifiedAt: identity.citizenId ? new Date() : null,
        citizenIdLast4: identity.citizenId ? last4(identity.citizenId) : null,
      },
    });
    await this.prisma.authProviderLink.create({
      data: {
        userId: user.id,
        provider: AuthProvider.tang_rat,
        providerSub: identity.sub,
        providerEmail: identity.email,
        providerName: identity.fullName,
        providerPhone: identity.phone,
        verifiedAt: new Date(),
      },
    });

    // OPTIONAL non-blocking hint (secondary domain path): if a pw account has same email, surface so user can link later from profile.
    let suggestion: { type: 'email_match'; maskedEmail: string } | undefined;
    if (identity.email) {
      const candidate = await this.prisma.systemUser.findFirst({
        where: {
          email: identity.email,
          passwordHash: { not: null },
          id: { not: user.id },
          deletedAt: null,
        },
        select: { email: true },
      });
      if (candidate?.email) {
        suggestion = {
          type: 'email_match',
          maskedEmail: this.maskEmail(candidate.email),
        };
      }
    }

    const result = await this.createSession(
      user,
      AuthProvider.tang_rat,
      ClientType.app,
      metadata,
      identity.sub,
      undefined,
      providerIdToken,
    );
    await this.audit(user.id, 'LOGIN', metadata);
    // Attach suggestion if present (back-compat: callers that only expect tokens still work; dto extended in phase).
    if (suggestion) (result as any).linkSuggestion = suggestion; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
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
      !isAdminTier(user.roles)
    ) {
      // Only the admin tier (admin/super_admin) may self-login via the portal.
      throw invalid();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException('Account temporarily locked', HttpStatus.LOCKED);
    }
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    // PROTOTYPE: TOTP bypass enabled in any environment when TOTP_BYPASS=true.
    // Lets `000000` pass so the demo doesn't require an authenticator app.
    // TODO: remove TOTP_BYPASS before any real production use.
    const totpValid =
      ((process.env.NODE_ENV === 'development' ||
        process.env.TOTP_BYPASS === 'true') &&
        totpCode === '000000') ||
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
            agencyId: null,
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

    // D6: carry juristic context if membership is still active; silently drop to user mode if revoked.
    let juristicCtx: { juristicId: string; role: JuristicRole } | undefined;
    if (session.activeJuristicId) {
      const membership = await this.prisma.juristicMember.findUnique({
        where: {
          juristicPersonId_userId: {
            juristicPersonId: session.activeJuristicId,
            userId: session.userId,
          },
        },
      });
      if (membership?.isActive) {
        juristicCtx = {
          juristicId: session.activeJuristicId,
          role: membership.role,
        };
      }
    }

    return this.createSession(
      session.user,
      session.authProvider,
      session.clientType,
      metadata,
      session.tangRatSub ?? undefined,
      juristicCtx,
      this.decryptProviderToken(session.providerIdToken),
    );
  }

  async logout(user: JwtClaims, metadata: RequestMetadata) {
    const session = await this.prisma.userSession.findFirst({
      where: { userId: user.sub, accessTokenJti: user.jti },
      select: {
        authProvider: true,
        providerIdToken: true,
      },
    });
    await this.prisma.userSession.updateMany({
      where: { userId: user.sub, accessTokenJti: user.jti },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokeReason: 'LOGOUT',
      },
    });
    await this.audit(user.sub, 'LOGOUT', metadata);
    const endSessionUrl =
      session?.authProvider === AuthProvider.tang_rat && session.providerIdToken
        ? this.dgaOidc.endSessionUrl(
            this.decryptProviderToken(session.providerIdToken)!,
            process.env.DGA_OIDC_LOGOUT_REDIRECT_URI,
          )
        : undefined;
    return { success: true, endSessionUrl };
  }

  async changePassword(user: JwtClaims, newPassword: string) {
    if (user.authProvider !== AuthProvider.self) {
      throw new ForbiddenException();
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.systemUser.update({
        where: { id: user.sub },
        data: {
          passwordHash: await bcrypt.hash(newPassword, 12),
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await tx.userSession.updateMany({
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
      });
    });
    return { success: true };
  }

  async forgotPassword(username: string, ipAddress?: string) {
    const user = await this.prisma.systemUser.findUnique({
      where: { username },
    });
    if (!user?.passwordHash || user.deletedAt) return { success: true };
    // Per-user limit: max 3 reset requests per hour (guide §5.1). Return the
    // same generic response when exceeded so callers cannot enumerate users.
    const oneHourAgo = new Date(Date.now() - 60 * 60_000);
    const recentRequests = await this.prisma.passwordResetToken.count({
      where: { userId: user.id, createdAt: { gte: oneHourAgo } },
    });
    if (recentRequests >= 3) return { success: true };
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
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      await tx.systemUser.update({
        where: { id: record.userId },
        data: {
          passwordHash: await bcrypt.hash(newPassword, 12),
          mustChangePassword: false,
        },
      });
      await tx.userSession.updateMany({
        where: { userId: record.userId, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokeReason: 'FORCED',
        },
      });
    });
    return { success: true };
  }

  // ───────────────────────── D6 Context switching ─────────────────────────

  /**
   * Switch the session into a juristic company context (or back to user mode).
   * Body `{ juristicId: string | null }`. Re-mints the access token in-place;
   * the existing session row and refresh token are reused (no full re-login).
   * Revokes the old JTI immediately so stale tokens reject on next request.
   */
  async switchContext(
    claims: JwtClaims,
    juristicId: string | null,
    metadata: RequestMetadata,
  ) {
    const session = await this.prisma.userSession.findUnique({
      where: { accessTokenJti: claims.jti },
      include: { user: true },
    });
    if (
      !session ||
      session.isRevoked ||
      session.expiresAt < new Date() ||
      !session.user.isActive
    ) {
      throw new UnauthorizedException();
    }

    let juristicCtx: { juristicId: string; role: JuristicRole } | null = null;
    if (juristicId !== null) {
      const membership = await this.prisma.juristicMember.findUnique({
        where: {
          juristicPersonId_userId: {
            juristicPersonId: juristicId,
            userId: session.userId,
          },
        },
      });
      if (!membership || !membership.isActive) {
        throw new ForbiddenException('Not a member of this organization');
      }
      juristicCtx = { juristicId, role: membership.role };
    }

    const accessToken = await this.reissueAccessToken(
      session.id,
      session.user,
      session,
      juristicCtx,
    );

    await this.audit(session.userId, 'CONTEXT_SWITCH', metadata, {
      juristicId: juristicId ?? null,
    });

    return {
      accessToken,
      user: {
        id: session.user.id,
        fullName: session.user.fullName,
        roles: session.user.roles,
        agencyId: session.user.agencyId,
      },
      activeJuristicId: juristicId ?? null,
    };
  }

  // ───────────────────────── D5 Tang Rat-prioritized linking + merge (phase 5) ─────────────────────────
  // Note: citizenId column holds plaintext (owner decision). Field name not renamed.

  /**
   * Public entry for /my/identities/tang-rat (and reusable).
   * Verifies mToken (proof of Tang Rat side). If collision on sub or citizenId,
   * **always** absorbs the non-Tang-Rat (domain-initiated) side into the Tang Rat
   * canonical. Primary Tang Rat accounts are never absorbed. Full transactional
   * repainting of ownership/assignments + session revocation on absorbed + audits.
   */
  async linkOrMergeTangRatProof(initiatorUserId: string, mToken: string) {
    const identity = await this.tangRat.verify(mToken);
    const initiator = await this.prisma.systemUser.findUnique({
      where: { id: initiatorUserId, deletedAt: null },
    });
    if (!initiator || !initiator.isActive) throw new ForbiddenException();

    // 1. Existing link for this exact sub?
    const existingLink = await this.prisma.authProviderLink.findUnique({
      where: {
        provider_providerSub: {
          provider: AuthProvider.tang_rat,
          providerSub: identity.sub,
        },
      },
      include: { user: true },
    });

    if (existingLink) {
      if (existingLink.userId === initiatorUserId) {
        // Already linked to self — idempotent success (back-fill citizen if newly provided)
        if (
          identity.citizenId &&
          !initiator.citizenId &&
          this.isValidCitizenId(identity.citizenId)
        ) {
          await this.prisma.systemUser.update({
            where: { id: initiatorUserId },
            data: {
              citizenId: this.storeCitizenIdSafe(identity.citizenId)!, // plaintext storage
              citizenIdVerifiedAt: new Date(),
              citizenIdLast4: last4(identity.citizenId),
              primaryChannel: ProfileChannel.tang_rat,
            },
          });
        }
        await this.prisma.authProviderLink.update({
          where: { id: existingLink.id },
          data: { lastLoginAt: new Date(), verifiedAt: new Date() },
        });
        return;
      }
      // Collision on sub → merge (the link owner may be Tang Rat canonical or not; rules below decide)
      await this.mergeIfAllowedAndExecute(
        initiatorUserId,
        existingLink.userId,
        'mtoken',
        identity,
      );
      return;
    }

    // 2. No link for sub. Check citizen collision on a different verified account.
    const canonicalOwnerId = initiatorUserId;
    if (identity.citizenId) {
      const rawId = this.storeCitizenIdSafe(identity.citizenId);
      if (rawId) {
        const ownerByCitizen = await this.prisma.systemUser.findFirst({
          where: { citizenId: rawId, deletedAt: null },
        });
        if (ownerByCitizen && ownerByCitizen.id !== initiatorUserId) {
          // Citizen collision → merge (plaintext match, Tang Rat canonical wins)
          await this.mergeIfAllowedAndExecute(
            initiatorUserId,
            ownerByCitizen.id,
            'mtoken',
            identity,
          );
          return;
        }
      }
    }

    // 3. Safe attach to current (or the owner we chose)
    await this.prisma.authProviderLink.create({
      data: {
        userId: canonicalOwnerId,
        provider: AuthProvider.tang_rat,
        providerSub: identity.sub,
        providerEmail: identity.email,
        providerName: identity.fullName,
        providerPhone: identity.phone,
        verifiedAt: new Date(),
      },
    });

    // Back-fill citizen on the target if this mToken brings the first verified ID
    const target =
      canonicalOwnerId === initiatorUserId
        ? initiator
        : (await this.prisma.systemUser.findUnique({
            where: { id: canonicalOwnerId },
          }))!;
    if (
      identity.citizenId &&
      !target.citizenId &&
      this.isValidCitizenId(identity.citizenId)
    ) {
      await this.prisma.systemUser.update({
        where: { id: canonicalOwnerId },
        data: {
          citizenId: this.storeCitizenIdSafe(identity.citizenId)!, // plaintext
          citizenIdVerifiedAt: new Date(),
          citizenIdLast4: last4(identity.citizenId),
          primaryChannel: ProfileChannel.tang_rat,
        },
      });
    }

    await this.audit(
      canonicalOwnerId,
      'IDENTITY_LINK',
      {},
      {
        sub: identity.sub,
      },
    );
  }

  /**
   * Core D5 merge: decide canonical vs absorbed (Tang Rat verified side + rank + age wins;
   * Tang Rat account is *never* the absorbed one), guard cross-tier/suspended, then
   * one big $transaction that repaints every FK reference and soft-deletes the absorbed.
   * Never call directly from primary Tang Rat login paths.
   */
  private async mergeIfAllowedAndExecute(
    initiatorId: string,
    otherId: string,
    method: 'mtoken' | 'password',
    identity?: { sub: string; citizenId?: string },
  ) {
    const [initiator, other] = await Promise.all([
      this.prisma.systemUser.findUnique({
        where: { id: initiatorId, deletedAt: null },
      }),
      this.prisma.systemUser.findUnique({
        where: { id: otherId, deletedAt: null },
      }),
    ]);
    if (!initiator || !other || !initiator.isActive || !other.isActive) {
      throw new ForbiddenException('One or both accounts are inactive');
    }

    const initRank = maxRank(initiator.roles);
    const otherRank = maxRank(other.roles);

    // Cross-tier guard (public vs staff): route to admin
    const initIsStaff = initRank >= 1;
    const otherIsStaff = otherRank >= 1;
    if (initIsStaff !== otherIsStaff) {
      throw new ConflictException(
        'Cross-tier merge (public ↔ staff) must be performed by an administrator',
      );
    }

    // Decide canonical: prefer the side that already has verified citizen (Tang Rat primary),
    // or the one that the mToken is proving (the "other" in a link collision from domain).
    // Tang Rat account is never absorbed.
    let canonicalId: string;
    let absorbedId: string;

    const initiatorHasCitizen = !!initiator.citizenId;
    const otherHasCitizen = !!other.citizenId;

    if (initiatorHasCitizen && !otherHasCitizen) {
      canonicalId = initiatorId;
      absorbedId = otherId;
    } else if (!initiatorHasCitizen && otherHasCitizen) {
      canonicalId = otherId;
      absorbedId = initiatorId;
    } else if (initiatorHasCitizen && otherHasCitizen) {
      // Both verified (rare) — higher rank or older wins; protect if one is "more Tang"
      canonicalId =
        otherRank > initRank ||
        (otherRank === initRank && other.createdAt < initiator.createdAt)
          ? otherId
          : initiatorId;
      absorbedId = canonicalId === initiatorId ? otherId : initiatorId;
    } else {
      // Neither has citizen yet — prefer the side the proof (mToken) is coming from as "more Tang"
      // In practice for domain-link this means the collision target (other) becomes canonical.
      canonicalId = otherId; // the one the mToken resolved to via existing link or citizen
      absorbedId = initiatorId;
    }

    // Extra safety: if the chosen absorbed happens to be the one with the verified citizen
    // and the canonical doesn't, flip (shouldn't happen with above logic).
    if (absorbedId === initiatorId && initiatorHasCitizen && !otherHasCitizen) {
      canonicalId = initiatorId;
      absorbedId = otherId;
    }
    if (absorbedId === otherId && otherHasCitizen && !initiatorHasCitizen) {
      canonicalId = otherId;
      absorbedId = initiatorId;
    }

    // Final guard: never absorb a higher-or-equal staff account into public, etc. (already cross-tier checked)
    // Perform the repaint tx
    await this.prisma.$transaction(async (tx) => {
      // Repaint all FKs from absorbed → canonical (list from plan §7.5)
      await tx.authProviderLink.updateMany({
        where: { userId: absorbedId },
        data: { userId: canonicalId },
      });
      await tx.business.updateMany({
        where: { ownerUserId: absorbedId },
        data: { ownerUserId: canonicalId },
      });
      await tx.inspectionTask.updateMany({
        where: { assignedTo: absorbedId },
        data: { assignedTo: canonicalId },
      });
      await tx.inspectionTask.updateMany({
        where: { createdBy: absorbedId },
        data: { createdBy: canonicalId },
      });
      await tx.inspectionReport.updateMany({
        where: { inspectorId: absorbedId },
        data: { inspectorId: canonicalId },
      });
      await tx.inspectionReport.updateMany({
        where: { reviewedBy: absorbedId },
        data: { reviewedBy: canonicalId },
      });
      await tx.auditLog.updateMany({
        where: { userId: absorbedId },
        data: { userId: canonicalId },
      });
      await tx.notification.updateMany({
        where: { recipientId: absorbedId },
        data: { recipientId: canonicalId },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: absorbedId },
        data: { userId: canonicalId },
      });
      await tx.syncLog.updateMany({
        where: { triggeredBy: absorbedId },
        data: { triggeredBy: canonicalId },
      });

      // Sessions on absorbed: revoke all
      await tx.userSession.updateMany({
        where: { userId: absorbedId, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokeReason: 'ACCOUNT_MERGE',
        },
      });

      // Soft-delete absorbed (never hard delete)
      await tx.systemUser.update({
        where: { id: absorbedId },
        data: { isActive: false, deletedAt: new Date() },
      });

      // If the absorbed had a tang link that we are "moving", ensure the sub link points to canonical
      // (the link rows were already repainted above)
    });

    await this.audit(
      initiatorId,
      'ACCOUNT_MERGE',
      {},
      {
        canonical: canonicalId,
        absorbed: absorbedId,
        method,
        citizenSub: identity?.sub,
      },
    );

    await this.audit(
      canonicalId,
      'IDENTITY_LINK',
      {},
      {
        viaMerge: true,
        absorbed: absorbedId,
      },
    );
  }
}
