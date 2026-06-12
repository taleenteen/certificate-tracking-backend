import { Injectable } from '@nestjs/common';

export interface DbdProvider {
  lookup(citizenSub: string): Promise<{ registrationId: string } | null>;
}

@Injectable()
export class MockDbdProvider implements DbdProvider {
  lookup(citizenSub: string) {
    // MOCK: replace in UAT.
    return Promise.resolve(
      citizenSub === 'mock-sub-public-owner'
        ? { registrationId: '0105560000001' }
        : null,
    );
  }
}
