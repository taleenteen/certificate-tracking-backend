import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAgencyDto, UpdateAgencyDto } from './agency.dto';

@Injectable()
export class AgencyService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const agencies = await this.prisma.agency.findMany({
      orderBy: { code: 'asc' },
    });
    const typeCounts = await this.prisma.licenseType.groupBy({
      by: ['agencyId'],
      where: { isActive: true },
      _count: { id: true },
    });
    const countMap = Object.fromEntries(
      typeCounts.map((row) => [row.agencyId, row._count.id]),
    );
    return agencies.map((a) => ({
      ...a,
      licenseTypeCount: countMap[a.id] ?? 0,
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
