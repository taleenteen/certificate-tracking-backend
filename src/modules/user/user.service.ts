import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Agency, AuthProvider, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { JwtClaims, RequestScope } from '../../common/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UserQueryDto } from './user.dto';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: UserQueryDto, actor: JwtClaims) {
    const where: Prisma.SystemUserWhereInput = {
      deletedAt: null,
      agency: actor.roles.includes('admin') ? undefined : actor.agency!,
      roles: query.role ? { has: query.role } : undefined,
      isActive: query.status,
      userZones: query.zoneId ? { some: { zoneId: query.zoneId } } : undefined,
      OR: query.q
        ? [
            { fullName: { contains: query.q, mode: 'insensitive' } },
            { username: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    return this.prisma.systemUser.findMany({
      where,
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        phone: true,
        roles: true,
        agency: true,
        isActive: true,
        mustChangePassword: true,
        lastLoginAt: true,
        userZones: { include: { zone: true } },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async create(dto: CreateUserDto) {
    const tempPassword = dto.username
      ? `Tmp-${randomBytes(8).toString('base64url')}!`
      : undefined;
    const user = await this.prisma.systemUser.create({
      data: {
        fullName: dto.fullName,
        username: dto.username,
        email: dto.email,
        phone: dto.phone,
        roles: dto.roles,
        agency: dto.agency,
        passwordHash: tempPassword ? await bcrypt.hash(tempPassword, 12) : null,
        mustChangePassword: !!tempPassword,
        userZones: {
          create: dto.zoneIds.map((zoneId) => ({ zoneId })),
        },
        providerLinks: tempPassword
          ? undefined
          : {
              create: {
                provider: AuthProvider.tang_rat,
                // MOCK: replace in UAT after the real user identity is linked.
                providerSub: `mock-placeholder-${randomBytes(12).toString('hex')}`,
                providerName: dto.fullName,
              },
            },
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        roles: true,
        agency: true,
        isActive: true,
      },
    });
    return { ...user, tempPassword };
  }

  async updateRoles(id: string, roles: string[]) {
    return this.prisma.systemUser.update({
      where: { id },
      data: { roles },
      select: {
        id: true,
        fullName: true,
        roles: true,
        agency: true,
        isActive: true,
      },
    });
  }

  async updateAgency(id: string, agency: Agency, actor: JwtClaims) {
    const target = await this.prisma.systemUser.findFirst({
      where: { id, deletedAt: null },
    });
    if (!target) throw new NotFoundException();
    if (
      !actor.roles.includes('admin') &&
      (target.agency !== actor.agency || agency !== actor.agency)
    ) {
      throw new ForbiddenException();
    }
    return this.prisma.systemUser.update({
      where: { id },
      data: { agency },
      select: { id: true, fullName: true, agency: true, roles: true },
    });
  }

  async updateZones(
    id: string,
    zoneIds: string[],
    actor: JwtClaims,
    scope?: RequestScope | null,
  ) {
    const target = await this.prisma.systemUser.findFirst({
      where: {
        id,
        deletedAt: null,
        agency: actor.roles.includes('admin') ? undefined : actor.agency!,
      },
    });
    if (!target) throw new NotFoundException();
    if (
      !actor.roles.includes('admin') &&
      zoneIds.some((zoneId) => !scope?.zoneIds.includes(zoneId))
    ) {
      throw new ForbiddenException();
    }
    await this.prisma.$transaction([
      this.prisma.userZone.deleteMany({ where: { userId: id } }),
      this.prisma.userZone.createMany({
        data: zoneIds.map((zoneId) => ({ userId: id, zoneId })),
      }),
    ]);
    return this.prisma.systemUser.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        userZones: { include: { zone: true } },
      },
    });
  }

  async suspend(id: string) {
    const [user] = await this.prisma.$transaction([
      this.prisma.systemUser.update({
        where: { id },
        data: { isActive: false },
        select: { id: true, fullName: true, isActive: true },
      }),
      this.prisma.userSession.updateMany({
        where: { userId: id, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokeReason: 'FORCED',
        },
      }),
    ]);
    return user;
  }

  async remove(id: string) {
    const [user] = await this.prisma.$transaction([
      this.prisma.systemUser.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
        select: { id: true, fullName: true, deletedAt: true },
      }),
      this.prisma.userSession.updateMany({
        where: { userId: id, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokeReason: 'FORCED',
        },
      }),
    ]);
    return user;
  }
}
