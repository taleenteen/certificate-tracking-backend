import { Module } from '@nestjs/common';
import { MockDbdProvider } from './dbd.provider';
import { MockGdxProvider } from './gdx.provider';
import { MockTangRatProvider } from './tangrat.provider';

export const TANG_RAT_PROVIDER = Symbol('TANG_RAT_PROVIDER');
export const DBD_PROVIDER = Symbol('DBD_PROVIDER');
export const GDX_PROVIDER = Symbol('GDX_PROVIDER');

@Module({
  providers: [
    { provide: TANG_RAT_PROVIDER, useClass: MockTangRatProvider },
    { provide: DBD_PROVIDER, useClass: MockDbdProvider },
    { provide: GDX_PROVIDER, useClass: MockGdxProvider },
  ],
  exports: [TANG_RAT_PROVIDER, DBD_PROVIDER, GDX_PROVIDER],
})
export class ExternalModule {}
