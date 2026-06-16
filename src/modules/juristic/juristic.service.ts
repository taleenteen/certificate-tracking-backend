import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { JoinRequestStatus, JuristicRole, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { JuristicContext } from '../../common/auth.types';
import {
  isValidThaiCitizenId,
  normalizeCitizenId,
} from '../../common/crypto/citizen-id';
import { PrismaService } from '../../prisma/prisma.service';
import { DBD_PROVIDER } from '../external/external.module';
import type { DbdProvider } from '../external/dbd.provider';
import type {
  ApproveFirstOwnerDto,
  ClaimJuristicDto,
  CreateJoinRequestDto,
  DirectAddMemberDto,
  InviteMemberDto,
  RejectJoinRequestDto,
  ReviewJoinRequestDto,
  UpdateMemberDto,
} from './juristic.dto';

@Injectable()
export class JuristicService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DBD_PROVIDER) private readonly dbd: DbdProvider,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  // ─── My memberships (switcher list) ───

  async getMyMemberships(userId: string) {
    const memberships = await this.prisma.juristicMember.findMany({
      where: { userId, isActive: true },
      include: {
        juristicPerson: { select: { id: true, nameTh: true, nameEn: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return memberships.map((m) => ({
      juristicId: m.juristicPersonId,
      nameTh: m.juristicPerson.nameTh,
      nameEn: m.juristicPerson.nameEn ?? undefined,
      role: m.role,
      position: m.position ?? undefined,
      joinedAt: m.joinedAt,
    }));
  }

  // ─── Company detail ───

  async getCompany(juristicId: string, userId: string) {
    const membership = await this.prisma.juristicMember.findUnique({
      where: {
        juristicPersonId_userId: { juristicPersonId: juristicId, userId },
      },
      include: {
        juristicPerson: true,
      },
    });
    if (!membership || !membership.isActive) {
      throw new NotFoundException('Company not found or you are not a member');
    }
    const memberCount = await this.prisma.juristicMember.count({
      where: { juristicPersonId: juristicId, isActive: true },
    });
    const jp = membership.juristicPerson;
    return {
      id: jp.id,
      registrationId: jp.registrationId,
      nameTh: jp.nameTh,
      nameEn: jp.nameEn ?? undefined,
      juristicType: jp.juristicType ?? undefined,
      address: jp.address ?? undefined,
      myRole: membership.role,
      myPosition: membership.position ?? undefined,
      memberCount,
    };
  }

  // ─── DBD director claim → OWNER ───

  async claimCompany(userId: string, dto: ClaimJuristicDto) {
    const user = await this.prisma.systemUser.findUnique({
      where: { id: userId, deletedAt: null },
      select: { citizenId: true, isActive: true },
    });
    if (!user?.isActive) throw new ForbiddenException();
    if (!user.citizenId) {
      throw new UnprocessableEntityException(
        'A verified citizen ID is required to claim a company. Link your Tang Rat account first.',
      );
    }

    const jp = await this.prisma.juristicPerson.findUnique({
      where: { registrationId: dto.registrationId },
    });
    if (!jp) throw new NotFoundException('Juristic person not found');

    // MOCK: replace in UAT with real DBD API.
    const isDirector = await this.dbd.isDirector(
      user.citizenId,
      dto.registrationId,
    );
    if (!isDirector) {
      throw new ForbiddenException(
        'You are not registered as a director of this company in DBD records',
      );
    }

    try {
      await this.prisma.juristicMember.create({
        data: {
          juristicPersonId: jp.id,
          userId,
          role: JuristicRole.OWNER,
          isActive: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Already a member — idempotent: upgrade to OWNER if they're not already
        await this.prisma.juristicMember.update({
          where: {
            juristicPersonId_userId: { juristicPersonId: jp.id, userId },
          },
          data: { role: JuristicRole.OWNER, isActive: true },
        });
      } else {
        throw error;
      }
    }

    return { juristicId: jp.id, nameTh: jp.nameTh, role: JuristicRole.OWNER };
  }

  // ─── Member list ───

  async getMembers(juristicId: string) {
    const members = await this.prisma.juristicMember.findMany({
      where: { juristicPersonId: juristicId },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
    return members.map((m) => ({
      userId: m.userId,
      fullName: m.user.fullName,
      role: m.role,
      position: m.position ?? undefined,
      isActive: m.isActive,
      joinedAt: m.joinedAt,
    }));
  }

  // ─── Direct-add by citizen ID ───

  async directAddMember(ctx: JuristicContext, dto: DirectAddMemberDto) {
    if (!isValidThaiCitizenId(dto.citizenId)) {
      throw new UnprocessableEntityException('Invalid Thai citizen ID');
    }
    const normalized = normalizeCitizenId(dto.citizenId);

    const target = await this.prisma.systemUser.findFirst({
      where: { citizenId: normalized, deletedAt: null, isActive: true },
      select: { id: true, fullName: true },
    });
    if (!target) {
      throw new NotFoundException(
        'No active verified user found with this citizen ID. The person must register and verify their identity first.',
      );
    }

    try {
      await this.prisma.juristicMember.create({
        data: {
          juristicPersonId: ctx.juristicId,
          userId: target.id,
          role: dto.role ?? JuristicRole.MEMBER,
          position: dto.position,
          invitedById: ctx.userId,
          isActive: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This user is already a member of the organization',
        );
      }
      throw error;
    }

    return { success: true };
  }

  // ─── Update member role/position ───

  async updateMember(
    ctx: JuristicContext,
    targetUserId: string,
    dto: UpdateMemberDto,
  ) {
    const member = await this.prisma.juristicMember.findUnique({
      where: {
        juristicPersonId_userId: {
          juristicPersonId: ctx.juristicId,
          userId: targetUserId,
        },
      },
    });
    if (!member || !member.isActive) {
      throw new NotFoundException('Member not found');
    }

    // Last-owner protection: cannot demote the only OWNER
    if (
      dto.role &&
      dto.role !== JuristicRole.OWNER &&
      member.role === JuristicRole.OWNER
    ) {
      await this.assertNotLastOwner(ctx.juristicId);
    }

    await this.prisma.juristicMember.update({
      where: {
        juristicPersonId_userId: {
          juristicPersonId: ctx.juristicId,
          userId: targetUserId,
        },
      },
      data: {
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.position !== undefined && { position: dto.position }),
      },
    });

    return { success: true };
  }

  // ─── Remove member ───

  async removeMember(ctx: JuristicContext, targetUserId: string) {
    const member = await this.prisma.juristicMember.findUnique({
      where: {
        juristicPersonId_userId: {
          juristicPersonId: ctx.juristicId,
          userId: targetUserId,
        },
      },
    });
    if (!member || !member.isActive) {
      throw new NotFoundException('Member not found');
    }

    if (member.role === JuristicRole.OWNER) {
      await this.assertNotLastOwner(ctx.juristicId);
    }

    await this.prisma.juristicMember.update({
      where: {
        juristicPersonId_userId: {
          juristicPersonId: ctx.juristicId,
          userId: targetUserId,
        },
      },
      data: { isActive: false },
    });

    return { success: true };
  }

  private async assertNotLastOwner(juristicId: string) {
    const ownerCount = await this.prisma.juristicMember.count({
      where: {
        juristicPersonId: juristicId,
        role: JuristicRole.OWNER,
        isActive: true,
      },
    });
    if (ownerCount <= 1) {
      throw new UnprocessableEntityException(
        'Cannot remove or demote the only OWNER of this organization. Assign another OWNER first.',
      );
    }
  }

  // ─── Email invite ───

  async inviteMember(ctx: JuristicContext, dto: InviteMemberDto) {
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);

    const jp = await this.prisma.juristicPerson.findUnique({
      where: { id: ctx.juristicId },
      select: { nameTh: true },
    });

    await this.prisma.juristicInvite.create({
      data: {
        juristicPersonId: ctx.juristicId,
        email: dto.email,
        role: dto.role ?? JuristicRole.MEMBER,
        position: dto.position,
        tokenHash,
        invitedById: ctx.userId,
        status: 'pending',
        expiresAt,
      },
    });

    // MOCK: replace in UAT with email notification provider.
    console.info(
      `[MOCK] Juristic invite for ${dto.email} to join "${jp?.nameTh}": token=${token}`,
    );

    return { success: true };
  }

  // ─── List invites ───

  async getInvites(juristicId: string) {
    const invites = await this.prisma.juristicInvite.findMany({
      where: { juristicPersonId: juristicId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      position: i.position ?? undefined,
      status: i.status,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    }));
  }

  // ─── Revoke invite ───

  async revokeInvite(ctx: JuristicContext, inviteId: string) {
    const invite = await this.prisma.juristicInvite.findFirst({
      where: { id: inviteId, juristicPersonId: ctx.juristicId },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== 'pending') {
      throw new UnprocessableEntityException('Invite is no longer pending');
    }

    await this.prisma.juristicInvite.update({
      where: { id: inviteId },
      data: { status: 'revoked' },
    });

    return { success: true };
  }

  // ─── D7: Company search ───

  async searchCompanies(q: string) {
    const companies = await this.prisma.juristicPerson.findMany({
      where: q
        ? {
            OR: [
              { nameTh: { contains: q, mode: 'insensitive' } },
              { nameEn: { contains: q, mode: 'insensitive' } },
              { registrationId: q },
            ],
          }
        : undefined,
      take: 20,
      orderBy: { nameTh: 'asc' },
      include: {
        members: {
          where: { role: JuristicRole.OWNER, isActive: true },
          select: { id: true },
        },
      },
    });
    return companies.map((c) => ({
      id: c.id,
      registrationId: c.registrationId,
      nameTh: c.nameTh,
      nameEn: c.nameEn ?? undefined,
      hasActiveOwner: c.members.length > 0,
    }));
  }

  // ─── D7: Submit join request ───

  async requestToJoin(userId: string, dto: CreateJoinRequestDto) {
    const user = await this.prisma.systemUser.findUnique({
      where: { id: userId, deletedAt: null, isActive: true },
      select: { citizenId: true },
    });
    if (!user) throw new ForbiddenException();
    if (!user.citizenId) {
      throw new UnprocessableEntityException(
        'A verified citizen ID is required to request to join a company. Link your Tang Rat account first.',
      );
    }

    const jp = await this.prisma.juristicPerson.findUnique({
      where: { id: dto.juristicId },
      select: { id: true, nameTh: true },
    });
    if (!jp) throw new NotFoundException('Company not found');

    const existingMember = await this.prisma.juristicMember.findUnique({
      where: {
        juristicPersonId_userId: { juristicPersonId: dto.juristicId, userId },
      },
      select: { isActive: true },
    });
    if (existingMember?.isActive) {
      throw new ConflictException(
        'You are already a member of this organization',
      );
    }

    const existingPending = await this.prisma.juristicJoinRequest.findFirst({
      where: {
        juristicPersonId: dto.juristicId,
        userId,
        status: JoinRequestStatus.PENDING,
      },
      select: { id: true },
    });
    if (existingPending) {
      throw new ConflictException(
        'You already have a pending request to join this organization',
      );
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60_000);
    const recentCount = await this.prisma.juristicJoinRequest.count({
      where: { userId, createdAt: { gte: oneHourAgo } },
    });
    if (recentCount >= 3) {
      throw new ConflictException(
        'Too many join requests in the last hour. Please wait before submitting again.',
      );
    }

    const totalPending = await this.prisma.juristicJoinRequest.count({
      where: { userId, status: JoinRequestStatus.PENDING },
    });
    if (totalPending >= 5) {
      throw new ConflictException(
        'You have too many pending requests. Cancel some before submitting a new one.',
      );
    }

    const activeOwnerCount = await this.prisma.juristicMember.count({
      where: {
        juristicPersonId: dto.juristicId,
        role: JuristicRole.OWNER,
        isActive: true,
      },
    });
    const isFirstOwnerClaim = activeOwnerCount === 0;

    let requestedRole = dto.requestedRole ?? JuristicRole.MEMBER;
    if (isFirstOwnerClaim) {
      requestedRole = JuristicRole.OWNER;
    } else if (requestedRole === JuristicRole.OWNER) {
      requestedRole = JuristicRole.ADMIN;
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000);

    const request = await this.prisma.juristicJoinRequest.create({
      data: {
        juristicPersonId: dto.juristicId,
        userId,
        isFirstOwnerClaim,
        requestedRole,
        requestedPosition: dto.requestedPosition,
        message: dto.message,
        status: JoinRequestStatus.PENDING,
        expiresAt,
      },
    });

    if (!isFirstOwnerClaim) {
      const approvers = await this.prisma.juristicMember.findMany({
        where: {
          juristicPersonId: dto.juristicId,
          isActive: true,
          role: { in: [JuristicRole.OWNER, JuristicRole.ADMIN] },
        },
        select: { userId: true },
      });
      if (approvers.length > 0) {
        await this.prisma.notification.createMany({
          data: approvers.map((a) => ({
            recipientId: a.userId,
            type: 'JURISTIC_JOIN_REQUEST',
            titleTh: 'มีคำขอเข้าร่วมบริษัท',
            bodyTh: `มีผู้ขอเข้าร่วม "${jp.nameTh}" โปรดตรวจสอบและอนุมัติ`,
            refType: 'juristic_join_requests',
            refId: request.id,
          })),
        });
      }
    }

    return {
      id: request.id,
      juristicId: dto.juristicId,
      isFirstOwnerClaim,
      status: JoinRequestStatus.PENDING,
    };
  }

  // ─── D7: My requests ───

  async getMyRequests(userId: string) {
    const requests = await this.prisma.juristicJoinRequest.findMany({
      where: { userId },
      include: { juristicPerson: { select: { nameTh: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((r) => ({
      id: r.id,
      juristicId: r.juristicPersonId,
      nameTh: r.juristicPerson.nameTh,
      status: r.status,
      isFirstOwnerClaim: r.isFirstOwnerClaim,
      requestedRole: r.requestedRole,
      requestedPosition: r.requestedPosition ?? undefined,
      message: r.message ?? undefined,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }));
  }

  // ─── D7: Cancel own request ───

  async cancelRequest(userId: string, requestId: string) {
    const request = await this.prisma.juristicJoinRequest.findUnique({
      where: { id: requestId },
      select: { userId: true, status: true },
    });
    if (!request || request.userId !== userId) {
      throw new NotFoundException('Request not found');
    }
    if (request.status !== JoinRequestStatus.PENDING) {
      throw new ConflictException('Only pending requests can be cancelled');
    }
    await this.prisma.juristicJoinRequest.update({
      where: { id: requestId },
      data: { status: JoinRequestStatus.CANCELLED },
    });
    return { success: true };
  }

  // ─── D7: Peer queue ───

  async getPendingRequests(juristicId: string) {
    await this.prisma.juristicJoinRequest.updateMany({
      where: {
        juristicPersonId: juristicId,
        status: JoinRequestStatus.PENDING,
        isFirstOwnerClaim: false,
        expiresAt: { lt: new Date() },
      },
      data: { status: JoinRequestStatus.EXPIRED },
    });

    const requests = await this.prisma.juristicJoinRequest.findMany({
      where: {
        juristicPersonId: juristicId,
        status: JoinRequestStatus.PENDING,
        isFirstOwnerClaim: false,
      },
      include: {
        user: { select: { fullName: true, citizenIdLast4: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return requests.map((r) => ({
      id: r.id,
      requesterName: r.user.fullName,
      citizenIdLast4: r.user.citizenIdLast4 ?? undefined,
      requestedRole: r.requestedRole,
      requestedPosition: r.requestedPosition ?? undefined,
      message: r.message ?? undefined,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }));
  }

  // ─── D7: Peer approve ───

  async approveRequest(
    ctx: JuristicContext,
    requestId: string,
    dto: ReviewJoinRequestDto,
  ) {
    const request = await this.prisma.juristicJoinRequest.findUnique({
      where: { id: requestId },
      select: {
        juristicPersonId: true,
        userId: true,
        isFirstOwnerClaim: true,
        status: true,
        expiresAt: true,
      },
    });
    if (!request || request.juristicPersonId !== ctx.juristicId) {
      throw new NotFoundException('Request not found');
    }
    if (request.isFirstOwnerClaim) {
      throw new ForbiddenException(
        'First-owner claims must be approved by platform staff',
      );
    }
    if (request.status !== JoinRequestStatus.PENDING) {
      throw new ConflictException('Request is no longer pending');
    }
    if (request.expiresAt < new Date()) {
      await this.prisma.juristicJoinRequest.update({
        where: { id: requestId },
        data: { status: JoinRequestStatus.EXPIRED },
      });
      throw new GoneException('Request has expired');
    }

    const grantedRole = dto.role ?? JuristicRole.MEMBER;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.juristicJoinRequest.update({
        where: { id: requestId },
        data: {
          status: JoinRequestStatus.APPROVED,
          grantedRole,
          reviewedById: ctx.userId,
          reviewedAt: now,
          reviewNote: dto.note,
        },
      });
      try {
        await tx.juristicMember.create({
          data: {
            juristicPersonId: ctx.juristicId,
            userId: request.userId,
            role: grantedRole,
            position: dto.position,
            invitedById: ctx.userId,
            isActive: true,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // Already a member — mark approved idempotently
        } else {
          throw error;
        }
      }
    });

    const jp = await this.prisma.juristicPerson.findUnique({
      where: { id: ctx.juristicId },
      select: { nameTh: true },
    });
    await this.prisma.notification.create({
      data: {
        recipientId: request.userId,
        type: 'JURISTIC_JOIN_APPROVED',
        titleTh: 'คำขอเข้าร่วมบริษัทได้รับการอนุมัติ',
        bodyTh: `คำขอเข้าร่วม "${jp?.nameTh}" ของคุณได้รับการอนุมัติแล้ว`,
        refType: 'juristic_join_requests',
        refId: requestId,
      },
    });

    return { success: true };
  }

  // ─── D7: Peer reject ───

  async rejectRequest(
    ctx: JuristicContext,
    requestId: string,
    dto: RejectJoinRequestDto,
  ) {
    const request = await this.prisma.juristicJoinRequest.findUnique({
      where: { id: requestId },
      select: {
        juristicPersonId: true,
        userId: true,
        isFirstOwnerClaim: true,
        status: true,
      },
    });
    if (!request || request.juristicPersonId !== ctx.juristicId) {
      throw new NotFoundException('Request not found');
    }
    if (request.isFirstOwnerClaim) {
      throw new ForbiddenException(
        'First-owner claims must be rejected by platform staff',
      );
    }
    if (request.status !== JoinRequestStatus.PENDING) {
      throw new ConflictException('Request is no longer pending');
    }

    const jp = await this.prisma.juristicPerson.findUnique({
      where: { id: ctx.juristicId },
      select: { nameTh: true },
    });

    await this.prisma.juristicJoinRequest.update({
      where: { id: requestId },
      data: {
        status: JoinRequestStatus.REJECTED,
        reviewedById: ctx.userId,
        reviewedAt: new Date(),
        reviewNote: dto.note,
      },
    });

    await this.prisma.notification.create({
      data: {
        recipientId: request.userId,
        type: 'JURISTIC_JOIN_REJECTED',
        titleTh: 'คำขอเข้าร่วมบริษัทไม่ได้รับการอนุมัติ',
        bodyTh: `คำขอเข้าร่วม "${jp?.nameTh}" ของคุณไม่ได้รับการอนุมัติ${dto.note ? ': ' + dto.note : ''}`,
        refType: 'juristic_join_requests',
        refId: requestId,
      },
    });

    return { success: true };
  }

  // ─── D7: Staff queue (first-owner claims) ───

  async getFirstOwnerClaims() {
    await this.prisma.juristicJoinRequest.updateMany({
      where: {
        status: JoinRequestStatus.PENDING,
        isFirstOwnerClaim: true,
        expiresAt: { lt: new Date() },
      },
      data: { status: JoinRequestStatus.EXPIRED },
    });

    const requests = await this.prisma.juristicJoinRequest.findMany({
      where: { status: JoinRequestStatus.PENDING, isFirstOwnerClaim: true },
      include: {
        user: { select: { fullName: true, citizenIdLast4: true } },
        juristicPerson: { select: { nameTh: true, registrationId: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return requests.map((r) => ({
      id: r.id,
      requesterName: r.user.fullName,
      citizenIdLast4: r.user.citizenIdLast4 ?? undefined,
      message: r.message ?? undefined,
      juristicId: r.juristicPersonId,
      nameTh: r.juristicPerson.nameTh,
      registrationId: r.juristicPerson.registrationId,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }));
  }

  // ─── D7: Staff approve first-owner claim ───

  async approveFirstOwnerClaim(
    staffUserId: string,
    requestId: string,
    dto: ApproveFirstOwnerDto,
  ) {
    const request = await this.prisma.juristicJoinRequest.findUnique({
      where: { id: requestId },
      include: { juristicPerson: { select: { nameTh: true } } },
    });
    if (!request || !request.isFirstOwnerClaim) {
      throw new NotFoundException('First-owner claim request not found');
    }
    if (request.status !== JoinRequestStatus.PENDING) {
      throw new ConflictException('Request is no longer pending');
    }
    if (request.expiresAt < new Date()) {
      await this.prisma.juristicJoinRequest.update({
        where: { id: requestId },
        data: { status: JoinRequestStatus.EXPIRED },
      });
      throw new GoneException('Request has expired');
    }

    // Race check: company must still have 0 active OWNERs
    const ownerCount = await this.prisma.juristicMember.count({
      where: {
        juristicPersonId: request.juristicPersonId,
        role: JuristicRole.OWNER,
        isActive: true,
      },
    });
    if (ownerCount > 0) {
      throw new ConflictException(
        'Company already has an active OWNER. Use the peer approval flow instead.',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.juristicJoinRequest.update({
        where: { id: requestId },
        data: {
          status: JoinRequestStatus.APPROVED,
          grantedRole: JuristicRole.OWNER,
          reviewedById: staffUserId,
          reviewedAt: now,
        },
      });
      try {
        await tx.juristicMember.create({
          data: {
            juristicPersonId: request.juristicPersonId,
            userId: request.userId,
            role: JuristicRole.OWNER,
            position: dto.position,
            isActive: true,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          await tx.juristicMember.update({
            where: {
              juristicPersonId_userId: {
                juristicPersonId: request.juristicPersonId,
                userId: request.userId,
              },
            },
            data: { role: JuristicRole.OWNER, isActive: true },
          });
        } else {
          throw error;
        }
      }
    });

    await this.prisma.notification.create({
      data: {
        recipientId: request.userId,
        type: 'JURISTIC_JOIN_APPROVED',
        titleTh: 'คำขอเป็นเจ้าของบริษัทได้รับการอนุมัติ',
        bodyTh: `คุณได้รับการอนุมัติให้เป็น OWNER ของ "${request.juristicPerson.nameTh}"`,
        refType: 'juristic_join_requests',
        refId: requestId,
      },
    });

    return { success: true };
  }

  // ─── D7: Staff reject first-owner claim ───

  async rejectFirstOwnerClaim(
    staffUserId: string,
    requestId: string,
    dto: RejectJoinRequestDto,
  ) {
    const request = await this.prisma.juristicJoinRequest.findUnique({
      where: { id: requestId },
      include: { juristicPerson: { select: { nameTh: true } } },
    });
    if (!request || !request.isFirstOwnerClaim) {
      throw new NotFoundException('First-owner claim request not found');
    }
    if (request.status !== JoinRequestStatus.PENDING) {
      throw new ConflictException('Request is no longer pending');
    }

    await this.prisma.juristicJoinRequest.update({
      where: { id: requestId },
      data: {
        status: JoinRequestStatus.REJECTED,
        reviewedById: staffUserId,
        reviewedAt: new Date(),
        reviewNote: dto.note,
      },
    });

    await this.prisma.notification.create({
      data: {
        recipientId: request.userId,
        type: 'JURISTIC_JOIN_REJECTED',
        titleTh: 'คำขอเป็นเจ้าของบริษัทไม่ได้รับการอนุมัติ',
        bodyTh: `คำขอเป็นเจ้าของ "${request.juristicPerson.nameTh}" ไม่ได้รับการอนุมัติ${dto.note ? ': ' + dto.note : ''}`,
        refType: 'juristic_join_requests',
        refId: requestId,
      },
    });

    return { success: true };
  }

  // ─── Accept invite ───

  async acceptInvite(acceptorUserId: string, token: string) {
    const tokenHash = this.hashToken(token);
    const invite = await this.prisma.juristicInvite.findUnique({
      where: { tokenHash },
      include: { juristicPerson: { select: { id: true, nameTh: true } } },
    });

    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== 'pending') {
      throw new GoneException('Invite has already been used or revoked');
    }
    if (invite.expiresAt < new Date()) {
      await this.prisma.juristicInvite.update({
        where: { id: invite.id },
        data: { status: 'expired' },
      });
      throw new GoneException('Invite has expired');
    }

    try {
      await this.prisma.juristicMember.create({
        data: {
          juristicPersonId: invite.juristicPersonId,
          userId: acceptorUserId,
          role: invite.role,
          position: invite.position,
          invitedById: invite.invitedById,
          isActive: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'You are already a member of this organization',
        );
      }
      throw error;
    }

    await this.prisma.juristicInvite.update({
      where: { id: invite.id },
      data: {
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedByUserId: acceptorUserId,
      },
    });

    return {
      success: true,
      juristicId: invite.juristicPersonId,
      nameTh: invite.juristicPerson.nameTh,
    };
  }
}
