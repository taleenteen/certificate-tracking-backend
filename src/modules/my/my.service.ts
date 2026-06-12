import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { JwtClaims } from '../../common/auth.types';
import { DBD_PROVIDER } from '../external/external.module';
import type { DbdProvider } from '../external/dbd.provider';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DBD_PROVIDER) private readonly dbd: DbdProvider,
  ) {}

  getLicensesPersonal(userId: string) {
    return this.prisma.license.findMany({
      where: {
        deletedAt: null,
        business: { ownerUserId: userId, deletedAt: null },
      },
      include: { licenseType: true, business: true },
    });
  }

  async getLicensesJuristic(user: JwtClaims) {
    const match = await this.dbd.lookup(user.citizenSub ?? '');
    if (!match) throw new NotFoundException({ found: false });
    const juristicPerson = await this.prisma.juristicPerson.findUnique({
      where: { registrationId: match.registrationId },
    });
    if (!juristicPerson) throw new NotFoundException({ found: false });
    return this.prisma.license.findMany({
      where: {
        deletedAt: null,
        business: { deletedAt: null, juristicPersonId: juristicPerson.id },
      },
      include: { licenseType: true, business: true },
    });
  }
}
