import { UnauthorizedException } from '@nestjs/common';
import { MockDbdProvider } from './dbd.provider';
import { MockDgaOidcProvider } from './dga-oidc.provider';
import { MockGdxProvider } from './gdx.provider';
import { MockTangRatProvider, RealTangRatProvider } from './tangrat.provider';

describe('mock external providers', () => {
  it('maps deterministic Tang Rat tokens to seeded identities (D5: includes citizenId for Tang Rat primary path)', async () => {
    const id1 = await new MockTangRatProvider().verify('mock-officer-1');
    expect(id1.sub).toBe('mock-sub-officer-1');
    expect(typeof id1.citizenId).toBe('string');
    await expect(
      new MockTangRatProvider().verify('mock-public-collision-a'),
    ).resolves.toMatchObject({ citizenId: '1000069135752' });
    await expect(
      new MockTangRatProvider().verify('mock-public-collision-b'),
    ).resolves.toMatchObject({ citizenId: '1000069135752' }); // shared for merge repro (domain absorbed into Tang Rat)
    await expect(
      new MockTangRatProvider().verify('invalid'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns the seeded juristic registration for the public owner', async () => {
    await expect(
      new MockDbdProvider().lookup('mock-sub-public-owner'),
    ).resolves.toEqual({ registrationId: '0105560000001' });
  });

  it('returns five ACFS sync records', async () => {
    await expect(
      new MockGdxProvider().fetchAcfsLicenses(),
    ).resolves.toHaveLength(5);
  });

  it('maps mock DGA OIDC code exchange to UserInfo identity', async () => {
    const provider = new MockDgaOidcProvider();
    const authorizeUrl = provider.authorizeUrl({
      state: 'signed-state',
      redirectUri: 'http://localhost:3000/auth/dga/callback',
    });
    expect(authorizeUrl).toContain('/connect/authorize');
    expect(authorizeUrl).toContain('response_type=code');
    expect(authorizeUrl).toContain('state=signed-state');

    const token = await provider.exchangeCode('mock-dga-public-owner');
    await expect(provider.userInfo(token.accessToken)).resolves.toMatchObject({
      sub: 'dga-sub-public-owner',
      citizenId: '1000065432051',
    });
    await expect(provider.exchangeCode('invalid')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('exchanges a registered appId and mToken through the DGA server-side APIs', async () => {
    const previousEnv = {
      consumerKey: process.env.DGA_MTOKEN_CONSUMER_KEY,
      consumerSecret: process.env.DGA_MTOKEN_CONSUMER_SECRET,
      appId: process.env.DGA_MTOKEN_APP_ID,
    };
    const originalFetch = global.fetch;
    const requests: string[] = [];
    const fetchStub: typeof fetch = (input) => {
      requests.push(String(input));
      if (requests.length === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ Result: 'dga-access-token' }), {
            status: 200,
          }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            result: {
              czpUserId: 'dga-user-id',
              citizenId: '1000065432051',
              firstName: 'สมชาย',
              lastName: 'ใจดี',
              mobile: '0812345678',
              email: 'somchai@example.test',
            },
          }),
          { status: 200 },
        ),
      );
    };
    process.env.DGA_MTOKEN_CONSUMER_KEY = 'consumer-key';
    process.env.DGA_MTOKEN_CONSUMER_SECRET = 'consumer-secret';
    process.env.DGA_MTOKEN_APP_ID = 'registered-app';
    global.fetch = fetchStub;

    try {
      const identity = await new RealTangRatProvider().verify(
        'one-time-mtoken',
        'registered-app',
      );

      expect(identity).toMatchObject({
        sub: 'dga-user-id',
        fullName: 'สมชาย ใจดี',
        citizenId: '1000065432051',
      });
      expect(requests).toHaveLength(2);
      expect(requests[0]).toContain('AgentID=one-time-mtoken');
      expect(requests[1]).toContain(
        '/ws/dga/czp/uat/v1/core/shield/data/deproc',
      );
    } finally {
      global.fetch = originalFetch;
      restoreEnv('DGA_MTOKEN_CONSUMER_KEY', previousEnv.consumerKey);
      restoreEnv('DGA_MTOKEN_CONSUMER_SECRET', previousEnv.consumerSecret);
      restoreEnv('DGA_MTOKEN_APP_ID', previousEnv.appId);
    }
  });

  it('rejects a mToken presented for another registered app', async () => {
    const previousEnv = {
      consumerKey: process.env.DGA_MTOKEN_CONSUMER_KEY,
      consumerSecret: process.env.DGA_MTOKEN_CONSUMER_SECRET,
      appId: process.env.DGA_MTOKEN_APP_ID,
    };
    process.env.DGA_MTOKEN_CONSUMER_KEY = 'consumer-key';
    process.env.DGA_MTOKEN_CONSUMER_SECRET = 'consumer-secret';
    process.env.DGA_MTOKEN_APP_ID = 'registered-app';
    try {
      await expect(
        new RealTangRatProvider().verify('one-time-mtoken', 'other-app'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      restoreEnv('DGA_MTOKEN_CONSUMER_KEY', previousEnv.consumerKey);
      restoreEnv('DGA_MTOKEN_CONSUMER_SECRET', previousEnv.consumerSecret);
      restoreEnv('DGA_MTOKEN_APP_ID', previousEnv.appId);
    }
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
