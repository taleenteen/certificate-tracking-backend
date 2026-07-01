import { UnauthorizedException } from '@nestjs/common';
import { MockDbdProvider } from './dbd.provider';
import { MockDgaOidcProvider } from './dga-oidc.provider';
import { MockGdxProvider } from './gdx.provider';
import { MockTangRatProvider } from './tangrat.provider';

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
});
