import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import type { TangRatIdentity } from './tangrat.provider';

export interface DgaOidcAuthorizeParams {
  state: string;
  redirectUri?: string;
  scope?: string;
}

export interface DgaOidcToken {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken?: string;
  idToken?: string;
}

export interface DgaOidcProvider {
  authorizeUrl(params: DgaOidcAuthorizeParams): string;
  exchangeCode(code: string, redirectUri?: string): Promise<DgaOidcToken>;
  userInfo(accessToken: string): Promise<TangRatIdentity>;
  endSessionUrl(idTokenHint: string, postLogoutRedirectUri?: string): string;
}

const mockIdentities: Record<string, TangRatIdentity> = {
  'mock-dga-public-owner': {
    sub: 'dga-sub-public-owner',
    fullName: 'เจ้าของกิจการจากทางรัฐ',
    email: 'public.owner@example.test',
    phone: '0855555555',
    citizenId: '1000065432051',
  },
  'mock-dga-officer-diw': {
    sub: 'dga-sub-officer-diw',
    fullName: 'เจ้าหน้าที่ทางรัฐ DIW',
    email: 'officer.diw@example.test',
    phone: '0833333333',
    citizenId: '1000046913546',
  },
  'mock-dga-officer-acfs': {
    sub: 'dga-sub-officer-acfs',
    fullName: 'เจ้าหน้าที่ทางรัฐ ACFS',
    email: 'officer.acfs@example.test',
    phone: '0844444444',
    citizenId: '1000050617247',
  },
};

@Injectable()
export class MockDgaOidcProvider implements DgaOidcProvider {
  private readonly baseUrl =
    process.env.DGA_OIDC_BASE_URL ??
    (process.env.DGA_OIDC_ENV === 'production'
      ? 'https://connect.egov.go.th'
      : 'https://connect.dga.or.th');

  private readonly clientId =
    process.env.DGA_OIDC_CLIENT_ID ?? 'mock-client-id';

  private readonly defaultRedirectUri =
    process.env.DGA_OIDC_REDIRECT_URI ??
    'http://localhost:3000/auth/dga/callback';

  authorizeUrl(params: DgaOidcAuthorizeParams) {
    // MOCK: replace in UAT with the same URL builder plus registered client values.
    const url = new URL('/connect/authorize', this.baseUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set(
      'redirect_uri',
      params.redirectUri ?? this.defaultRedirectUri,
    );
    url.searchParams.set(
      'scope',
      params.scope ?? process.env.DGA_OIDC_SCOPE ?? 'openid',
    );
    url.searchParams.set('state', params.state);
    return url.toString();
  }

  exchangeCode(code: string, redirectUri?: string) {
    // MOCK: replace in UAT with POST /connect/token.
    // Real DGA token auth uses Basic Base64(client_id:md5(secret + EGA, 7 rounds)).
    const identity = mockIdentities[code];
    if (!identity) {
      return Promise.reject(
        new UnauthorizedException('Invalid authorization code'),
      );
    }
    const redirectHash = createHash('sha256')
      .update(redirectUri ?? this.defaultRedirectUri)
      .digest('hex')
      .slice(0, 12);
    return Promise.resolve({
      accessToken: `mock-dga-access.${code}.${redirectHash}`,
      tokenType: 'Bearer' as const,
      expiresIn: 3600,
      refreshToken: `mock-dga-refresh.${code}`,
      idToken: `mock-dga-id.${identity.sub}`,
    });
  }

  userInfo(accessToken: string) {
    // MOCK: replace in UAT with GET /connect/userinfo using Bearer access token.
    const code = accessToken.split('.')[1];
    const identity = code ? mockIdentities[code] : undefined;
    if (!identity) {
      return Promise.reject(new UnauthorizedException('Invalid access token'));
    }
    return Promise.resolve(identity);
  }

  endSessionUrl(idTokenHint: string, postLogoutRedirectUri?: string) {
    // MOCK: replace in UAT with the same DGA end-session redirect.
    const url = new URL('/connect/endsession', this.baseUrl);
    url.searchParams.set('id_token_hint', idTokenHint);
    url.searchParams.set(
      'post_logout_redirect_url',
      postLogoutRedirectUri ??
        process.env.DGA_OIDC_LOGOUT_REDIRECT_URI ??
        'http://localhost:3000/auth/logout-callback',
    );
    return url.toString();
  }
}

@Injectable()
export class RealDgaOidcProvider implements DgaOidcProvider {
  private readonly logger = new Logger(RealDgaOidcProvider.name);

  private readonly baseUrl =
    process.env.DGA_OIDC_BASE_URL ??
    (process.env.DGA_OIDC_ENV === 'production'
      ? 'https://connect.egov.go.th'
      : 'https://connect.dga.or.th');

  private readonly clientId = process.env.DGA_OIDC_CLIENT_ID;

  private readonly clientSecret = process.env.DGA_OIDC_CLIENT_SECRET;

  private readonly defaultRedirectUri = process.env.DGA_OIDC_REDIRECT_URI;

  private readonly defaultLogoutRedirectUri =
    process.env.DGA_OIDC_LOGOUT_REDIRECT_URI;

  authorizeUrl(params: DgaOidcAuthorizeParams) {
    const clientId = this.requireConfig(this.clientId, 'DGA_OIDC_CLIENT_ID');
    const redirectUri = this.requireConfig(
      params.redirectUri ?? this.defaultRedirectUri,
      'DGA_OIDC_REDIRECT_URI',
    );
    const url = new URL('/connect/authorize', this.baseUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set(
      'scope',
      params.scope ?? process.env.DGA_OIDC_SCOPE ?? 'openid',
    );
    url.searchParams.set('state', params.state);
    return url.toString();
  }

  async exchangeCode(code: string, redirectUri?: string) {
    const clientId = this.requireConfig(this.clientId, 'DGA_OIDC_CLIENT_ID');
    const clientSecret = this.requireConfig(
      this.clientSecret,
      'DGA_OIDC_CLIENT_SECRET',
    );
    const callbackUrl = this.requireConfig(
      redirectUri ?? this.defaultRedirectUri,
      'DGA_OIDC_REDIRECT_URI',
    );
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl,
    });
    const response = await fetch(new URL('/connect/token', this.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `basic ${Buffer.from(
          `${clientId}:${this.hashConsumerSecret(clientSecret)}`,
        ).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      this.logger.warn({
        message: 'DGA token exchange failed',
        status: response.status,
        error: await this.safeErrorBody(response),
      });
      throw new UnauthorizedException('Invalid authorization code');
    }
    const payload = (await response.json()) as {
      access_token?: string;
      token_type?: string;
      expires_in?: number;
      refresh_token?: string;
      id_token?: string;
    };
    if (!payload.access_token) {
      throw new UnauthorizedException('Invalid token response');
    }
    return {
      accessToken: payload.access_token,
      tokenType: 'Bearer' as const,
      expiresIn: payload.expires_in ?? 3600,
      refreshToken: payload.refresh_token,
      idToken: payload.id_token,
    };
  }

  async userInfo(accessToken: string) {
    const response = await fetch(new URL('/connect/userinfo', this.baseUrl), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      this.logger.warn({
        message: 'DGA userinfo failed',
        status: response.status,
        error: await this.safeErrorBody(response),
      });
      throw new UnauthorizedException('Invalid access token');
    }
    const payload = (await response.json()) as {
      sub?: string;
      czp_user?: string;
      citizen_id?: string;
      phone_number?: string;
      email?: string;
      name?: string;
      given_name?: string;
      family_name?: string;
    };
    const fullName =
      payload.name ??
      [payload.given_name, payload.family_name].filter(Boolean).join(' ');
    const subject = payload.czp_user ?? payload.sub ?? payload.citizen_id;
    if (!subject || !fullName) {
      throw new UnauthorizedException('Invalid userinfo response');
    }
    return {
      sub: subject,
      fullName,
      email: payload.email,
      phone: payload.phone_number,
      citizenId: payload.citizen_id,
    };
  }

  endSessionUrl(idTokenHint: string, postLogoutRedirectUri?: string) {
    const logoutRedirectUri = this.requireConfig(
      postLogoutRedirectUri ?? this.defaultLogoutRedirectUri,
      'DGA_OIDC_LOGOUT_REDIRECT_URI',
    );
    const url = new URL('/connect/endsession', this.baseUrl);
    url.searchParams.set('id_token_hint', idTokenHint);
    url.searchParams.set('post_logout_redirect_url', logoutRedirectUri);
    return url.toString();
  }

  private hashConsumerSecret(secret: string) {
    let value = createHash('md5').update(`${secret}EGA`).digest('hex');
    for (let round = 1; round < 7; round++) {
      value = createHash('md5').update(`${value}EGA`).digest('hex');
    }
    return value;
  }

  private requireConfig(value: string | undefined, name: string) {
    if (!value) {
      throw new Error(`${name} is required for real DGA OIDC mode`);
    }
    return value;
  }

  private async safeErrorBody(response: Response) {
    const text = await response.text().catch(() => '');
    if (!text) return undefined;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>;
        return {
          error: record.error,
          errorDescription: record.error_description,
        };
      }
      return undefined;
    } catch {
      return text.slice(0, 200);
    }
  }
}
