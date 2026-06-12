import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtClaims } from '../../common/auth.types';
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
      user: user.roles.includes('admin') ? undefined : { agency: user.agency! },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, fullName: true, roles: true, agency: true },
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
