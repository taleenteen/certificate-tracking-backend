import { Injectable, UnauthorizedException } from '@nestjs/common';

export interface TangRatIdentity {
  sub: string;
  fullName: string;
  email?: string;
  phone?: string;
  citizenId?: string; // 13-digit Thai national ID (Tang Rat verified; MOCK only). Never raw in JWT or logs.
}

export interface TangRatProvider {
  verify(mToken: string): Promise<TangRatIdentity>;
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
