import { Injectable, UnauthorizedException } from '@nestjs/common';

export interface TangRatIdentity {
  sub: string;
  fullName: string;
  email?: string;
  phone?: string;
}

export interface TangRatProvider {
  verify(mToken: string): Promise<TangRatIdentity>;
}

const identities: Record<string, TangRatIdentity> = {
  'mock-inspector-1': {
    sub: 'mock-sub-inspector-1',
    fullName: 'ผู้ตรวจ DIW หนึ่ง',
  },
  'mock-inspector-2': {
    sub: 'mock-sub-inspector-2',
    fullName: 'ผู้ตรวจ DIW สอง',
  },
  'mock-inspector-3': {
    sub: 'mock-sub-inspector-3',
    fullName: 'ผู้ตรวจ ACFS หนึ่ง',
  },
  'mock-inspector-4': {
    sub: 'mock-sub-inspector-4',
    fullName: 'ผู้ตรวจ ACFS สอง',
  },
  'mock-supervisor-diw': {
    sub: 'mock-sub-supervisor-diw',
    fullName: 'หัวหน้าผู้ตรวจ DIW',
  },
  'mock-supervisor-acfs': {
    sub: 'mock-sub-supervisor-acfs',
    fullName: 'หัวหน้าผู้ตรวจ ACFS',
  },
  'mock-public-owner': {
    sub: 'mock-sub-public-owner',
    fullName: 'เจ้าของกิจการตัวอย่าง',
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
