import { UnauthorizedException } from '@nestjs/common';
import { MockDbdProvider } from './dbd.provider';
import { MockGdxProvider } from './gdx.provider';
import { MockTangRatProvider } from './tangrat.provider';

describe('mock external providers', () => {
  it('maps deterministic Tang Rat tokens to seeded identities', async () => {
    await expect(
      new MockTangRatProvider().verify('mock-inspector-1'),
    ).resolves.toMatchObject({ sub: 'mock-sub-inspector-1' });
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
});
