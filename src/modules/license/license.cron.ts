import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LicenseStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LicenseCron {
  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 8 * * *', { timeZone: 'Asia/Bangkok' })
  async licenseExpiryCheck() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    for (const days of [90, 30]) {
      const target = new Date(today);
      target.setUTCDate(target.getUTCDate() + days);
      const end = new Date(target);
      end.setUTCDate(end.getUTCDate() + 1);
      const licenses = await this.prisma.license.findMany({
        where: {
          expireDate: { gte: target, lt: end },
          deletedAt: null,
          // RNG4 rows are excluded because their expireDate is always null.
        },
        include: {
          business: true,
          licenseType: true,
        },
      });
      for (const license of licenses) {
        const recipients = new Set<string>();
        if (license.business.ownerUserId) {
          recipients.add(license.business.ownerUserId);
        }
        if (days === 30) {
          const inspectors = await this.prisma.systemUser.findMany({
            where: {
              deletedAt: null,
              isActive: true,
              roles: { has: 'inspector' },
              agencyId: license.licenseType.agencyId,
              userZones: { some: { zoneId: license.business.zoneId } },
            },
            select: { id: true },
          });
          inspectors.forEach(({ id }) => recipients.add(id));
        }
        for (const recipientId of recipients) {
          const duplicate = await this.prisma.notification.findFirst({
            where: {
              recipientId,
              type: 'LICENSE_EXPIRING',
              refId: license.id,
              createdAt: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              },
            },
          });
          if (!duplicate) {
            await this.prisma.notification.create({
              data: {
                recipientId,
                type: 'LICENSE_EXPIRING',
                titleTh: 'ใบอนุญาตใกล้หมดอายุ',
                bodyTh: `ใบอนุญาต ${license.licenseNo} จะหมดอายุใน ${days} วัน`,
                refType: 'licenses',
                refId: license.id,
              },
            });
          }
        }
      }
    }

    const expired = await this.prisma.license.findMany({
      where: {
        status: LicenseStatus.ACTIVE,
        expireDate: { lt: today },
        deletedAt: null,
      },
      include: { business: true, licenseType: true },
    });
    for (const license of expired) {
      await this.prisma.license.update({
        where: { id: license.id },
        data: { status: LicenseStatus.EXPIRED },
      });
      const supervisors = await this.prisma.systemUser.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          roles: { has: 'supervisor' },
          agencyId: license.licenseType.agencyId,
          userZones: { some: { zoneId: license.business.zoneId } },
        },
      });
      await this.prisma.notification.createMany({
        data: supervisors.map((supervisor) => ({
          recipientId: supervisor.id,
          type: 'LICENSE_EXPIRED',
          titleTh: 'ใบอนุญาตหมดอายุ',
          bodyTh: `ใบอนุญาต ${license.licenseNo} หมดอายุแล้ว`,
          refType: 'licenses',
          refId: license.id,
        })),
      });
    }
  }

  @Cron('30 8 * * *', { timeZone: 'Asia/Bangkok' })
  async rng4FeeCheck() {
    // MOCK: replace in UAT. TODO(schema): LICENSE_FEE_PAYMENT in Phase 2.
    const diw = await this.prisma.agency.findUnique({ where: { code: 'DIW' } });
    if (!diw) return;
    return this.prisma.license.updateMany({
      where: {
        licenseType: {
          agencyId: diw.id,
          suspendedOnNonpayment: true,
        },
        suspensionReason: 'MOCK_OVERDUE',
      },
      data: {
        status: LicenseStatus.SUSPENDED,
        suspendedAt: new Date(),
      },
    });
  }
}
