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
  'mock-inspector-1': {
    sub: 'mock-sub-inspector-1',
    fullName: 'ผู้ตรวจ DIW หนึ่ง',
    email: 'inspector1.diw@example.test',
    phone: '0811111111',
    citizenId: '1000003703701', // MOCK: replace in UAT (validated by isValidThaiCitizenId; Tang Rat primary per D5)
  },
  'mock-inspector-2': {
    sub: 'mock-sub-inspector-2',
    fullName: 'ผู้ตรวจ DIW สอง',
    email: 'inspector2.diw@example.test',
    phone: '0811111112',
    citizenId: '1000016049371',
  },
  'mock-inspector-3': {
    sub: 'mock-sub-inspector-3',
    fullName: 'ผู้ตรวจ ACFS หนึ่ง',
    email: 'inspector1.acfs@example.test',
    phone: '0822222221',
    citizenId: '1000028395041',
  },
  'mock-inspector-4': {
    sub: 'mock-sub-inspector-4',
    fullName: 'ผู้ตรวจ ACFS สอง',
    email: 'inspector2.acfs@example.test',
    phone: '0822222222',
    citizenId: '1000033333309',
  },
  'mock-supervisor-diw': {
    sub: 'mock-sub-supervisor-diw',
    fullName: 'หัวหน้าผู้ตรวจ DIW',
    email: 'supervisor.diw@example.test',
    phone: '0833333333',
    citizenId: '1000046913546',
  },
  'mock-supervisor-acfs': {
    sub: 'mock-sub-supervisor-acfs',
    fullName: 'หัวหน้าผู้ตรวจ ACFS',
    email: 'supervisor.acfs@example.test',
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
