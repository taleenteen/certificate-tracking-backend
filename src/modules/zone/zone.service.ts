import { Injectable } from '@nestjs/common';
import { JwtClaims, RequestScope } from '../../common/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateZoneDto, UpdateZoneDto } from './zone.dto';

@Injectable()
export class ZoneService {
  constructor(private readonly prisma: PrismaService) {}

  list(actor: JwtClaims, scope?: RequestScope | null) {
    return this.prisma.zone.findMany({
      where: {
        id: actor.roles.includes('admin')
          ? undefined
          : { in: scope?.zoneIds ?? [] },
      },
      orderBy: { code: 'asc' },
    });
  }

  create(dto: CreateZoneDto) {
    return this.prisma.zone.create({
      data: {
        ...dto,
        boundary: dto.boundary,
      },
    });
  }

  update(id: string, dto: UpdateZoneDto) {
    return this.prisma.zone.update({
      where: { id },
      data: {
        ...dto,
        boundary: dto.boundary,
      },
    });
  }
}
