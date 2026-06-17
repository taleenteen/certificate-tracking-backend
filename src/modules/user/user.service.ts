import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthProvider, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { JwtClaims, RequestScope } from '../../common/auth.types';
import {
  canGrantRole,
  canManageUser,
  isAdminTier,
} from '../../common/auth.roles';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UserQueryDto } from './user.dto';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: UserQueryDto, actor: JwtClaims) {
    const where: Prisma.SystemUserWhereInput = {
      deletedAt: null,
      agencyId: isAdminTier(actor.roles) ? undefined : actor.agencyId!,
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
        agencyId: true,
        isActive: true,
        mustChangePassword: true,
        lastLoginAt: true,
        userZones: { include: { zone: true } },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async create(dto: CreateUserDto, actor?: JwtClaims) {
    if (dto.roles.includes('admin') && !actor?.roles.includes('super_admin')) {
      throw new ForbiddenException('Only super_admin may create admin accounts');
    }
    // Use caller-supplied password if given; otherwise generate a temp one (forces change on first login).
    const chosenPassword = dto.initialPassword ?? (dto.username ? `Tmp-${randomBytes(8).toString('base64url')}!` : undefined);
    const tempPassword = !dto.initialPassword && dto.username ? chosenPassword : undefined;
    const user = await this.prisma.systemUser.create({
      data: {
        fullName: dto.fullName,
        username: dto.username,
        email: dto.email,
        phone: dto.phone,
        roles: dto.roles,
        agencyId: dto.agencyId,
        passwordHash: chosenPassword ? await bcrypt.hash(chosenPassword, 12) : null,
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
        agencyId: true,
        isActive: true,
      },
    });
    return { ...user, tempPassword };
  }

  async updateRoles(id: string, roles: string[], actor: JwtClaims) {
    const target = await this.prisma.systemUser.findFirst({
      where: { id, deletedAt: null },
    });
    if (!target) throw new NotFoundException();
    // Cannot modify a user of equal or higher rank (super_admin excepted).
    if (!canManageUser(actor.roles, target.roles)) {
      throw new ForbiddenException(
        'Cannot modify a user of equal or higher role',
      );
    }
    // Every role being granted must be allowed for the actor: only super_admin
    // may grant admin / super_admin; admin may grant roles below admin.
    for (const role of roles) {
      if (!canGrantRole(actor.roles, role)) {
        throw new ForbiddenException(`Not allowed to grant role: ${role}`);
      }
    }
    return this.prisma.systemUser.update({
      where: { id },
      data: { roles },
      select: {
        id: true,
        fullName: true,
        roles: true,
        agencyId: true,
        isActive: true,
      },
    });
  }

  async updateAgency(id: string, agencyId: string, actor: JwtClaims) {
    const target = await this.prisma.systemUser.findFirst({
      where: { id, deletedAt: null },
    });
    if (!target) throw new NotFoundException();
    if (
      !isAdminTier(actor.roles) &&
      (target.agencyId !== actor.agencyId || agencyId !== actor.agencyId)
    ) {
      throw new ForbiddenException();
    }
    return this.prisma.systemUser.update({
      where: { id },
      data: { agencyId },
      select: { id: true, fullName: true, agencyId: true, roles: true },
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
        agencyId: isAdminTier(actor.roles) ? undefined : actor.agencyId!,
      },
    });
    if (!target) throw new NotFoundException();
    if (
      !isAdminTier(actor.roles) &&
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

  // Ensures the actor outranks the target (super_admin may manage anyone).
  private async assertManageable(id: string, actor: JwtClaims) {
    const target = await this.prisma.systemUser.findFirst({
      where: { id, deletedAt: null },
      select: { roles: true },
    });
    if (!target) throw new NotFoundException();
    if (!canManageUser(actor.roles, target.roles)) {
      throw new ForbiddenException(
        'Cannot modify a user of equal or higher role',
      );
    }
  }

  async suspend(id: string, actor: JwtClaims) {
    await this.assertManageable(id, actor);
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

  async remove(id: string, actor: JwtClaims) {
    await this.assertManageable(id, actor);
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
