import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthProvider, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { JwtClaims } from '../../common/auth.types';
import {
  canGrantRole,
  canManageUser,
  isAdminTier,
} from '../../common/auth.roles';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UpdateUserAccessDto, UserQueryDto } from './user.dto';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: UserQueryDto, actor: JwtClaims) {
    const where: Prisma.SystemUserWhereInput = {
      deletedAt: null,
      agencyId: actor.roles.includes('super_admin')
        ? undefined
        : actor.agencyId!,
      roles: query.role ? { has: query.role } : undefined,
      isActive: query.status,
      OR: query.q
        ? [
            { fullName: { contains: query.q, mode: 'insensitive' } },
            { username: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const users = await this.prisma.systemUser.findMany({
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
        primaryChannel: true,
        citizenIdVerifiedAt: true,
        providerLinks: {
          where: { provider: AuthProvider.tang_rat, isActive: true },
          select: { id: true },
        },
      },
      orderBy: { fullName: 'asc' },
    });
    return users.map(({ providerLinks, ...user }) => ({
      ...user,
      hasTangRatIdentity: providerLinks.length > 0,
      citizenIdVerified: !!user.citizenIdVerifiedAt,
    }));
  }

  async create(dto: CreateUserDto, actor?: JwtClaims) {
    dto.fullName = dto.fullName.trim();
    dto.username = dto.username?.trim().toLowerCase();
    dto.email = dto.email?.trim().toLowerCase();
    dto.phone = dto.phone?.trim();
    for (const role of dto.roles) {
      if (!actor || !canGrantRole(actor.roles, role)) {
        throw new ForbiddenException(`Not allowed to grant role: ${role}`);
      }
    }
    // Use caller-supplied password if given; otherwise generate a temp one (forces change on first login).
    const chosenPassword =
      dto.initialPassword ??
      (dto.username
        ? `Tmp-${randomBytes(8).toString('base64url')}!`
        : undefined);
    const tempPassword =
      !dto.initialPassword && dto.username ? chosenPassword : undefined;
    const user = await this.prisma.systemUser.create({
      data: {
        fullName: dto.fullName,
        username: dto.username,
        email: dto.email,
        phone: dto.phone,
        roles: dto.roles,
        agencyId: dto.agencyId,
        passwordHash: chosenPassword
          ? await bcrypt.hash(chosenPassword, 12)
          : null,
        mustChangePassword: !!tempPassword,
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

  async updateAccess(id: string, dto: UpdateUserAccessDto, actor: JwtClaims) {
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
    for (const role of dto.roles) {
      if (!canGrantRole(actor.roles, role)) {
        throw new ForbiddenException(`Not allowed to grant role: ${role}`);
      }
    }

    const requiresAgency = dto.roles.includes('officer');
    if (requiresAgency && !dto.agencyId) {
      throw new ForbiddenException('Officer access requires an agency');
    }

    if (dto.agencyId) {
      const agency = await this.prisma.agency.findFirst({
        where: { id: dto.agencyId, isActive: true },
        select: { id: true },
      });
      if (!agency) throw new NotFoundException();
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.systemUser.update({
        where: { id },
        data: {
          roles: dto.roles,
          agencyId: requiresAgency ? dto.agencyId : null,
        },
        select: {
          id: true,
          fullName: true,
          roles: true,
          agencyId: true,
          isActive: true,
        },
      });
      await tx.userSession.updateMany({
        where: { userId: id, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokeReason: 'FORCED',
        },
      });
      return user;
    });
  }

  async updateAgency(id: string, agencyId: string, actor: JwtClaims) {
    await this.assertManageable(id, actor);
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
    const user = await this.prisma.$transaction(async (tx) => {
      const user = await tx.systemUser.update({
        where: { id },
        data: { isActive: false },
        select: { id: true, fullName: true, isActive: true },
      });
      await tx.userSession.updateMany({
        where: { userId: id, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokeReason: 'FORCED',
        },
      });
      return user;
    });
    return user;
  }

  async remove(id: string, actor: JwtClaims) {
    await this.assertManageable(id, actor);
    const user = await this.prisma.$transaction(async (tx) => {
      const user = await tx.systemUser.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
        select: { id: true, fullName: true, deletedAt: true },
      });
      await tx.userSession.updateMany({
        where: { userId: id, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokeReason: 'FORCED',
        },
      });
      return user;
    });
    return user;
  }
}
