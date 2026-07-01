import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtClaims } from '../../common/auth.types';
import { isAdminTier } from '../../common/auth.roles';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditQueryDto } from './audit.dto';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditQueryDto, user: JwtClaims) {
    const where: Prisma.AuditLogWhereInput = {
      userId: query.userId,
      entityType: query.entityType,
      createdAt:
        query.dateFrom || query.dateTo
          ? {
              gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
              lte: query.dateTo ? new Date(query.dateTo) : undefined,
            }
          : undefined,
      // Admin sees all. Officer sees audit rows produced by users in their agency.
      user: isAdminTier(user.roles)
        ? undefined
        : {
            agencyId: user.agencyId!,
          },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, fullName: true, roles: true, agencyId: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      data,
      meta: { page: query.page, limit: query.limit, total },
    };
  }
}
