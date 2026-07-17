import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

export interface TangRatIdentity {
  sub: string;
  fullName: string;
  email?: string;
  phone?: string;
  citizenId?: string; // 13-digit Thai national ID (Tang Rat verified; MOCK only). Never raw in JWT or logs.
}

export interface TangRatProvider {
  verify(mToken: string, appId?: string): Promise<TangRatIdentity>;
}

const identities: Record<string, TangRatIdentity> = {
  'mock-officer-1': {
    sub: 'mock-sub-officer-1',
    fullName: 'เจ้าหน้าที่ DIW หนึ่ง',
    email: 'officer1.diw@example.test',
    phone: '0811111111',
    citizenId: '1000003703701', // MOCK: replace in UAT (validated by isValidThaiCitizenId; Tang Rat primary per D5)
  },
  'mock-officer-2': {
    sub: 'mock-sub-officer-2',
    fullName: 'เจ้าหน้าที่ DIW สอง',
    email: 'officer2.diw@example.test',
    phone: '0811111112',
    citizenId: '1000016049371',
  },
  'mock-officer-3': {
    sub: 'mock-sub-officer-3',
    fullName: 'เจ้าหน้าที่ ACFS หนึ่ง',
    email: 'officer1.acfs@example.test',
    phone: '0822222221',
    citizenId: '1000028395041',
  },
  'mock-officer-4': {
    sub: 'mock-sub-officer-4',
    fullName: 'เจ้าหน้าที่ ACFS สอง',
    email: 'officer2.acfs@example.test',
    phone: '0822222222',
    citizenId: '1000033333309',
  },
  'mock-officer-diw': {
    sub: 'mock-sub-officer-diw',
    fullName: 'เจ้าหน้าที่อาวุโส DIW',
    email: 'officer.diw@example.test',
    phone: '0833333333',
    citizenId: '1000046913546',
  },
  'mock-officer-acfs': {
    sub: 'mock-sub-officer-acfs',
    fullName: 'เจ้าหน้าที่อาวุโส ACFS',
    email: 'officer.acfs@example.test',
    phone: '0844444444',
    citizenId: '1000050617247',
  },
  'mock-public-owner': {
    sub: 'mock-sub-public-owner',
    fullName: 'เจ้าของกิจการตัวอย่าง',
    email: 'public.owner@example.test',
    phone: '0855555555',
    citizenId: '1000065432051',
  },
  // Collision test pair (same citizenId, different sub/email) for D5 secondary (domain-initiated) merge repro — always absorbs *into* the Tang Rat canonical
  'mock-public-collision-a': {
    sub: 'mock-sub-collision-a',
    fullName: 'พลเมืองชนกัน ก',
    email: 'collision.a@example.test',
    phone: '0866666666',
    citizenId: '1000069135752', // shares with -b for controlled test
  },
  'mock-public-collision-b': {
    sub: 'mock-sub-collision-b',
    fullName: 'พลเมืองชนกัน ข',
    email: 'collision.b@example.test',
    phone: '0877777777',
    citizenId: '1000069135752',
  },
};

@Injectable()
export class MockTangRatProvider implements TangRatProvider {
  verify(mToken: string) {
    // MOCK: replace in UAT.
    const identity = identities[mToken];
    if (!identity) {
      return Promise.reject(new UnauthorizedException('Invalid mToken'));
    }
    return Promise.resolve(identity);
  }
}

@Injectable()
export class RealTangRatProvider implements TangRatProvider {
  private readonly logger = new Logger(RealTangRatProvider.name);
  private readonly requestTimeoutMs = this.timeoutFromEnv(
    'DGA_MTOKEN_REQUEST_TIMEOUT_MS',
    7_000,
  );
  private readonly totalTimeoutMs = this.timeoutFromEnv(
    'DGA_MTOKEN_TOTAL_TIMEOUT_MS',
    15_000,
  );
  private readonly consumerKey = process.env.DGA_MTOKEN_CONSUMER_KEY;
  private readonly consumerSecret = process.env.DGA_MTOKEN_CONSUMER_SECRET;
  private readonly registeredAppId = process.env.DGA_MTOKEN_APP_ID;
  private readonly validateUrl =
    process.env.DGA_MTOKEN_VALIDATE_URL ??
    'https://api.egov.go.th/ws/auth/validate';
  private readonly deprocUrl =
    process.env.DGA_MTOKEN_DEPROC_URL ??
    (process.env.DGA_MTOKEN_ENV === 'production'
      ? 'https://api.egov.go.th/ws/dga/czp/prod/v1/core/shield/data/deproc'
      : 'https://api.egov.go.th/ws/dga/czp/uat/v1/core/shield/data/deproc');

  constructor() {
    // Fail startup rather than accepting a live WebView login that can only
    // fail later because the deployment is missing DGA credentials.
    this.requireConfig(this.consumerKey, 'DGA_MTOKEN_CONSUMER_KEY');
    this.requireConfig(this.consumerSecret, 'DGA_MTOKEN_CONSUMER_SECRET');
    this.requireConfig(this.registeredAppId, 'DGA_MTOKEN_APP_ID');
  }

  async verify(mToken: string, appId?: string) {
    const startedAt = Date.now();
    const consumerKey = this.requireConfig(
      this.consumerKey,
      'DGA_MTOKEN_CONSUMER_KEY',
    );
    const consumerSecret = this.requireConfig(
      this.consumerSecret,
      'DGA_MTOKEN_CONSUMER_SECRET',
    );
    const registeredAppId = this.requireConfig(
      this.registeredAppId,
      'DGA_MTOKEN_APP_ID',
    );

    if (!appId || appId !== registeredAppId) {
      this.logger.warn({
        message: 'DGA mToken rejected due to app ID mismatch',
        receivedAppId: this.redactAppId(appId),
      });
      throw new UnauthorizedException('Invalid mToken');
    }

    try {
      const totalDeadline = AbortSignal.timeout(this.totalTimeoutMs);
      const validateUrl = new URL(this.validateUrl);
      validateUrl.searchParams.set('ConsumerSecret', consumerSecret);
      validateUrl.searchParams.set('AgentID', mToken);

      const validateStartedAt = Date.now();
      const validateResponse = await fetch(validateUrl, {
        headers: {
          'Consumer-Key': consumerKey,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.any([
          totalDeadline,
          AbortSignal.timeout(this.requestTimeoutMs),
        ]),
      });
      if (!validateResponse.ok) {
        this.logger.warn({
          message: 'DGA mToken validation failed',
          status: validateResponse.status,
          durationMs: Date.now() - validateStartedAt,
          totalDurationMs: Date.now() - startedAt,
        });
        throw new UnauthorizedException('Invalid mToken');
      }

      const validatePayload = (await validateResponse.json()) as {
        Result?: string;
        result?: string;
      };
      const accessToken = validatePayload.Result ?? validatePayload.result;
      if (!accessToken) {
        this.logger.warn({
          message: 'DGA mToken validation returned no token',
          durationMs: Date.now() - validateStartedAt,
          totalDurationMs: Date.now() - startedAt,
        });
        throw new UnauthorizedException('Invalid mToken');
      }
      this.logger.log({
        message: 'DGA mToken validation completed',
        durationMs: Date.now() - validateStartedAt,
      });

      const profileStartedAt = Date.now();
      const profileResponse = await fetch(this.deprocUrl, {
        method: 'POST',
        headers: {
          'Consumer-Key': consumerKey,
          Token: accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appId, mToken }),
        signal: AbortSignal.any([
          totalDeadline,
          AbortSignal.timeout(this.requestTimeoutMs),
        ]),
      });
      if (!profileResponse.ok) {
        this.logger.warn({
          message: 'DGA mToken profile request failed',
          status: profileResponse.status,
          durationMs: Date.now() - profileStartedAt,
          totalDurationMs: Date.now() - startedAt,
        });
        throw new UnauthorizedException('Invalid mToken');
      }

      const profilePayload = (await profileResponse.json()) as {
        result?: DgaMTokenProfile;
        Result?: DgaMTokenProfile;
      };
      const profile = profilePayload.result ?? profilePayload.Result;
      const fullName = [profile?.firstName, profile?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
      const subject =
        profile?.czpUserId ?? profile?.userId ?? profile?.citizenId;
      if (!profile || !subject || !fullName) {
        this.logger.warn({
          message: 'DGA mToken profile response is incomplete',
          hasProfile: Boolean(profile),
          hasSubject: Boolean(subject),
          hasFullName: Boolean(fullName),
          durationMs: Date.now() - profileStartedAt,
          totalDurationMs: Date.now() - startedAt,
        });
        throw new UnauthorizedException('Invalid mToken');
      }
      this.logger.log({
        message: 'DGA mToken profile completed',
        durationMs: Date.now() - profileStartedAt,
        totalDurationMs: Date.now() - startedAt,
      });

      return {
        sub: subject,
        fullName,
        email: profile.email,
        phone: profile.mobile,
        citizenId: profile.citizenId,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;

      this.logger.error({
        message: 'DGA mToken exchange unavailable',
        error: error instanceof Error ? error.name : 'UnknownError',
        totalDurationMs: Date.now() - startedAt,
      });
      throw new ServiceUnavailableException('Tang Rat service unavailable');
    }
  }

  private requireConfig(value: string | undefined, name: string) {
    if (!value) throw new Error(`${name} is required for real DGA mToken mode`);
    return value;
  }

  private timeoutFromEnv(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value >= 1_000 ? value : fallback;
  }

  private redactAppId(appId: string | undefined) {
    if (!appId) return 'missing';
    if (appId.length <= 4) return 'present';
    return `present:...${appId.slice(-4)}`;
  }
}

type DgaMTokenProfile = {
  userId?: string;
  czpUserId?: string;
  citizenId?: string;
  firstName?: string;
  lastName?: string;
  mobile?: string;
  email?: string;
};
