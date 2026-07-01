import { Module } from '@nestjs/common';
import { MockDbdProvider } from './dbd.provider';
import { MockDgaOidcProvider, RealDgaOidcProvider } from './dga-oidc.provider';
import { MockGdxProvider } from './gdx.provider';
import { MockTangRatProvider } from './tangrat.provider';

export const TANG_RAT_PROVIDER = Symbol('TANG_RAT_PROVIDER');
export const DBD_PROVIDER = Symbol('DBD_PROVIDER');
export const GDX_PROVIDER = Symbol('GDX_PROVIDER');
export const DGA_OIDC_PROVIDER = Symbol('DGA_OIDC_PROVIDER');

@Module({
  providers: [
    { provide: TANG_RAT_PROVIDER, useClass: MockTangRatProvider },
    { provide: DBD_PROVIDER, useClass: MockDbdProvider },
    { provide: GDX_PROVIDER, useClass: MockGdxProvider },
    {
      provide: DGA_OIDC_PROVIDER,
      useFactory: () =>
        process.env.DGA_OIDC_MODE === 'real'
          ? new RealDgaOidcProvider()
          : new MockDgaOidcProvider(),
    },
  ],
  exports: [TANG_RAT_PROVIDER, DBD_PROVIDER, GDX_PROVIDER, DGA_OIDC_PROVIDER],
})
export class ExternalModule {}
