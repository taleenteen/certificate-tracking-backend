import { BadRequestException } from '@nestjs/common';
import { AuthProvider, ClientType } from '@prisma/client';
import { AuthService } from './auth.service';
import type { DgaOidcProvider } from '../external/dga-oidc.provider';

describe('AuthService DGA OIDC hardening', () => {
  const env = process.env;

  let dga: jest.Mocked<DgaOidcProvider>;
  let service: AuthService;
  let prisma: {
    dgaOidcState: {
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    userSession: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    auditLog: {
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...env,
      DGA_OIDC_STATE_SECRET: 'test-state-secret',
      DGA_OIDC_REDIRECT_URI:
        'https://e-license.govcenter.co/auth/login-callback',
      DGA_OIDC_ALLOWED_REDIRECT_URIS:
        'https://e-license.govcenter.co/auth/login-callback',
      DGA_OIDC_SCOPE: 'openid citizen_id given_name family_name',
    };
    dga = {
      authorizeUrl: jest.fn(
        ({ state }) => `https://dga.test/authorize?state=${state}`,
      ),
      exchangeCode: jest.fn().mockResolvedValue({
        accessToken: 'provider-access-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      }),
      userInfo: jest.fn().mockResolvedValue({
        sub: 'provider-sub',
        fullName: 'DGA User',
        citizenId: '1000065432051',
      }),
      endSessionUrl: jest.fn(
        (idTokenHint) =>
          `https://dga.test/connect/endsession?id_token_hint=${idTokenHint}`,
      ),
    };
    prisma = {
      dgaOidcState: {
        create: jest.fn().mockResolvedValue({ id: 'state-id' }),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
      userSession: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-id' }),
      },
    };
    service = new AuthService(prisma as never, {} as never, {} as never, dga);
    jest
      .spyOn(
        service as unknown as { loginTangRatIdentity: jest.Mock },
        'loginTangRatIdentity',
      )
      .mockResolvedValue({ user: { id: 'user-id', roles: ['public'] } });
  });

  afterEach(() => {
    process.env = env;
    jest.restoreAllMocks();
  });

  it('rejects redirect URIs outside the configured allowlist', async () => {
    await expect(
      service.createDgaOidcAuthorizeUrl({
        redirectUri: 'https://evil.example/auth/login-callback',
        scope: 'openid citizen_id',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dga.authorizeUrl.mock.calls).toHaveLength(0);
  });

  it('rejects scopes outside the configured DGA identity scopes', async () => {
    await expect(
      service.createDgaOidcAuthorizeUrl({
        redirectUri: 'https://e-license.govcenter.co/auth/login-callback',
        scope: 'openid citizen_id admin',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dga.authorizeUrl.mock.calls).toHaveLength(0);
  });

  it('consumes DGA state once during callback', async () => {
    const authorization = await service.createDgaOidcAuthorizeUrl({
      redirectUri: 'https://e-license.govcenter.co/auth/login-callback',
      scope: 'openid citizen_id given_name family_name',
    });

    await expect(
      service.dgaOidcCallback(
        {
          code: 'fresh-code',
          state: authorization.state,
          redirectUri: 'https://e-license.govcenter.co/auth/login-callback',
        },
        {},
      ),
    ).resolves.toMatchObject({ user: { id: 'user-id' } });

    await expect(
      service.dgaOidcCallback(
        {
          code: 'replayed-code',
          state: authorization.state,
          redirectUri: 'https://e-license.govcenter.co/auth/login-callback',
        },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.dgaOidcState.create.mock.calls).toHaveLength(1);
    expect(prisma.dgaOidcState.updateMany.mock.calls).toHaveLength(2);
    expect(dga.exchangeCode.mock.calls).toHaveLength(1);
  });

  it('returns a DGA end-session URL when logging out an OIDC session', async () => {
    prisma.userSession.findFirst.mockResolvedValue({
      authProvider: AuthProvider.tang_rat,
      providerIdToken: 'provider-id-token',
    });

    await expect(
      service.logout(
        {
          sub: 'user-id',
          jti: 'session-jti',
          roles: ['public'],
          agencyId: null,
          authProvider: AuthProvider.tang_rat,
          clientType: ClientType.app,
        },
        {},
      ),
    ).resolves.toMatchObject({
      success: true,
      endSessionUrl:
        'https://dga.test/connect/endsession?id_token_hint=provider-id-token',
    });
  });

  it('keeps local logout response unchanged when no DGA id token exists', async () => {
    prisma.userSession.findFirst.mockResolvedValue({
      authProvider: AuthProvider.self,
      providerIdToken: null,
    });

    await expect(
      service.logout(
        {
          sub: 'user-id',
          jti: 'session-jti',
          roles: ['public'],
          agencyId: null,
          authProvider: AuthProvider.self,
          clientType: ClientType.app,
        },
        {},
      ),
    ).resolves.toEqual({ success: true, endSessionUrl: undefined });
  });
});
