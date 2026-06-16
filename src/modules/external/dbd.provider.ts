import { Injectable } from '@nestjs/common';

export interface DbdProvider {
  lookup(citizenSub: string): Promise<{ registrationId: string } | null>;
  // D6: verify that citizenId is a registered director of the company with registrationId
  isDirector(citizenId: string, registrationId: string): Promise<boolean>;
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

  isDirector(citizenId: string, registrationId: string) {
    // MOCK: replace in UAT with real DBD/DGA API call.
    // Seeded: publicOwner (citizenId=1000065432051) is director of company[0] (registrationId=0105560000001).
    return Promise.resolve(
      citizenId === '1000065432051' && registrationId === '0105560000001',
    );
  }
}
