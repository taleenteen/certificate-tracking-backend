import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAgencyDto, UpdateAgencyDto } from './agency.dto';

@Injectable()
export class AgencyService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const [agencies, typeCounts, users, licenses] = await Promise.all([
      this.prisma.agency.findMany({ orderBy: { code: 'asc' } }),
      this.prisma.licenseType.groupBy({
        by: ['agencyId'],
        where: { isActive: true },
        _count: { id: true },
      }),
      this.prisma.systemUser.findMany({
        where: { deletedAt: null, isActive: true, agencyId: { not: null } },
        select: { agencyId: true, roles: true },
      }),
      this.prisma.license.findMany({
        where: { deletedAt: null },
        select: { licenseType: { select: { agencyId: true } } },
      }),
    ]);

    const typeCountMap = Object.fromEntries(
      typeCounts.map((row) => [row.agencyId, row._count.id]),
    );

    const adminCountMap: Record<string, number> = {};
    const officerCountMap: Record<string, number> = {};
    for (const u of users) {
      if (!u.agencyId) continue;
      if (u.roles.includes('admin'))
        adminCountMap[u.agencyId] = (adminCountMap[u.agencyId] ?? 0) + 1;
      if (u.roles.includes('officer'))
        officerCountMap[u.agencyId] = (officerCountMap[u.agencyId] ?? 0) + 1;
    }

    const licenseCountMap: Record<string, number> = {};
    for (const l of licenses) {
      const aid = l.licenseType.agencyId;
      licenseCountMap[aid] = (licenseCountMap[aid] ?? 0) + 1;
    }

    return agencies.map((a) => ({
      ...a,
      licenseTypeCount: typeCountMap[a.id] ?? 0,
      adminCount: adminCountMap[a.id] ?? 0,
      officerCount: officerCountMap[a.id] ?? 0,
      licenseCount: licenseCountMap[a.id] ?? 0,
    }));
  }

  async create(dto: CreateAgencyDto) {
    const existing = await this.prisma.agency.findUnique({
      where: { code: dto.code },
    });
    if (existing) throw new ConflictException('Agency code already exists');
    return this.prisma.agency.create({ data: dto });
  }

  async update(id: string, dto: UpdateAgencyDto) {
    const existing = await this.prisma.agency.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Agency not found');
    return this.prisma.agency.update({ where: { id }, data: dto });
  }
}
