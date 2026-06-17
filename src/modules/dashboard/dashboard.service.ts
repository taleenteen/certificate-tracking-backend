import { Injectable } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { RequestScope } from '../../common/auth.types';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async officer(userId: string, scope: RequestScope) {
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const zoneWhere: Prisma.InspectionTaskWhereInput = {
      zoneId: { in: scope.zoneIds },
      OR: [
        { license: { licenseType: { agencyId: scope.agencyId } } },
        { licenseId: null },
      ],
    };

    const [personalCounts, myCompletedThisMonth, recentTasks, zoneCounts] =
      await Promise.all([
        this.prisma.inspectionTask.groupBy({
          by: ['status'],
          where: { assignedTo: userId },
          _count: true,
        }),
        this.prisma.inspectionTask.count({
          where: {
            assignedTo: userId,
            status: TaskStatus.APPROVED,
            completedAt: { gte: startOfMonth },
          },
        }),
        this.prisma.inspectionTask.findMany({
          where: { assignedTo: userId },
          include: { business: true },
          orderBy: { updatedAt: 'desc' },
          take: 5,
        }),
        this.prisma.inspectionTask.groupBy({
          by: ['status'],
          where: zoneWhere,
          _count: true,
        }),
      ]);

    const personal = (status: TaskStatus) =>
      personalCounts.find((item) => item.status === status)?._count ?? 0;
    const taskCountsByStatus = Object.fromEntries(
      zoneCounts.map((item) => [item.status, item._count]),
    );
    const terminal =
      (taskCountsByStatus.APPROVED ?? 0) +
      (taskCountsByStatus.CANCELLED ?? 0) +
      (taskCountsByStatus.RETURNED ?? 0);
    const complianceRate = terminal
      ? (taskCountsByStatus.APPROVED ?? 0) / terminal
      : 0;

    return {
      myPendingTasks: personal(TaskStatus.ASSIGNED),
      myInProgress: personal(TaskStatus.IN_PROGRESS),
      myReturnedToFix: personal(TaskStatus.RETURNED),
      myCompletedThisMonth,
      recentTasks,
      taskCountsByStatus,
      pendingReviewCount: taskCountsByStatus.PENDING_REVIEW ?? 0,
      complianceRate,
    };
  }

  async admin() {
    const [users, zoneCount, licenses, syncLogs] = await Promise.all([
      this.prisma.systemUser.findMany({
        where: { deletedAt: null },
        select: { roles: true },
      }),
      this.prisma.zone.count({ where: { isActive: true } }),
      this.prisma.license.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: true,
      }),
      this.prisma.syncLog.findMany({
        distinct: ['agencyId'],
        orderBy: [{ agencyId: 'asc' }, { startedAt: 'desc' }],
        include: { agency: { select: { id: true, code: true, nameTh: true } } },
      }),
    ]);
    const userCounts = users
      .flatMap(({ roles }) => roles)
      .reduce<Record<string, number>>((result, role) => {
        result[role] = (result[role] ?? 0) + 1;
        return result;
      }, {});
    return {
      userCounts,
      zoneCount,
      licenseCounts: Object.fromEntries(
        licenses.map((item) => [item.status, item._count]),
      ),
      lastSync: syncLogs,
    };
  }
}
