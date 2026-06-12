import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  LicenseStatus,
  Prisma,
  ReportResult,
  TaskStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { JwtClaims, RequestScope } from '../../common/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateTaskDto, UpdateReportDto } from './inspection.dto';

@Injectable()
export class InspectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private scopedWhere(user: JwtClaims, scope: RequestScope) {
    if (user.roles.includes('supervisor')) {
      return {
        zoneId: { in: scope.zoneIds },
        OR: [
          { license: { licenseType: { agency: scope.agency } } },
          { licenseId: null },
        ],
      } satisfies Prisma.InspectionTaskWhereInput;
    }
    return { assignedTo: user.sub } satisfies Prisma.InspectionTaskWhereInput;
  }

  list(user: JwtClaims, scope: RequestScope, status?: TaskStatus) {
    return this.prisma.inspectionTask.findMany({
      where: { ...this.scopedWhere(user, scope), status },
      include: {
        business: true,
        license: { include: { licenseType: true } },
        assignee: {
          select: { id: true, fullName: true, agency: true, roles: true },
        },
        reports: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findTask(id: string, user: JwtClaims, scope: RequestScope) {
    const task = await this.prisma.inspectionTask.findFirst({
      where: { id, ...this.scopedWhere(user, scope) },
      include: {
        business: true,
        zone: true,
        license: { include: { licenseType: true } },
        assignee: {
          select: { id: true, fullName: true, agency: true, roles: true },
        },
        reports: {
          include: { checklistTemplate: true, documents: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!task) throw new NotFoundException();
    return task;
  }

  async createTask(
    dto: CreateTaskDto,
    creator: JwtClaims,
    scope: RequestScope,
  ) {
    const [business, assignee] = await Promise.all([
      this.prisma.business.findFirst({
        where: {
          id: dto.businessId,
          deletedAt: null,
          zoneId: { in: scope.zoneIds },
        },
      }),
      this.prisma.systemUser.findFirst({
        where: {
          id: dto.assignedTo,
          isActive: true,
          deletedAt: null,
          roles: { has: 'inspector' },
          agency: scope.agency,
        },
        include: { userZones: true },
      }),
    ]);
    if (!business || !assignee) throw new NotFoundException();
    if (business.ownerUserId === assignee.id) {
      throw new ConflictException(
        'Assignee has a conflict of interest with this business',
      );
    }
    if (!assignee.userZones.some(({ zoneId }) => zoneId === business.zoneId)) {
      throw new ForbiddenException('Assignee does not cover business zone');
    }
    if (dto.licenseId) {
      const license = await this.prisma.license.findFirst({
        where: {
          id: dto.licenseId,
          businessId: business.id,
          licenseType: { agency: scope.agency },
          deletedAt: null,
        },
      });
      if (!license) throw new NotFoundException();
    }
    const prefix = `T-${new Date().getFullYear()}-`;
    // Sequence generation inside the transaction + retry on unique collision so
    // concurrent requests cannot produce duplicate task numbers without schema
    // changes. taskNo has a @unique constraint; P2002 triggers the retry.
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const last = await tx.inspectionTask.findFirst({
            where: { taskNo: { startsWith: prefix } },
            orderBy: { taskNo: 'desc' },
            select: { taskNo: true },
          });
          const sequence = Number(last?.taskNo.slice(-4) ?? 0) + 1;
          const task = await tx.inspectionTask.create({
            data: {
              taskNo: `${prefix}${String(sequence).padStart(4, '0')}`,
              businessId: business.id,
              licenseId: dto.licenseId,
              zoneId: business.zoneId,
              assignedTo: assignee.id,
              createdBy: creator.sub,
              dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
            },
          });
          await tx.notification.create({
            data: {
              recipientId: assignee.id,
              type: 'TASK_ASSIGNED',
              titleTh: 'ได้รับมอบหมายงานตรวจ',
              bodyTh: `งาน ${task.taskNo}`,
              refType: 'inspection_tasks',
              refId: task.id,
            },
          });
          return task;
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          attempt < 9
        ) {
          continue;
        }
        throw e;
      }
    }
    throw new Error('Task number generation failed after retries');
  }

  async startTask(id: string, user: JwtClaims) {
    const task = await this.prisma.inspectionTask.findFirst({
      where: { id, assignedTo: user.sub },
      include: { license: true },
    });
    if (!task) throw new NotFoundException();
    if (task.status !== TaskStatus.ASSIGNED) {
      throw new UnprocessableEntityException('Invalid task transition');
    }
    const template = task.licenseId
      ? await this.prisma.checklistTemplate.findFirst({
          where: {
            isActive: true,
            licenseType: { licenses: { some: { id: task.licenseId } } },
          },
          orderBy: { version: 'desc' },
        })
      : null;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inspectionTask.update({
        where: { id },
        data: { status: TaskStatus.IN_PROGRESS, startedAt: new Date() },
      });
      const existing = await tx.inspectionReport.findFirst({
        where: { taskId: id },
      });
      if (!existing) {
        await tx.inspectionReport.create({
          data: {
            taskId: id,
            inspectorId: user.sub,
            checklistTemplateId: template?.id,
          },
        });
      }
      return updated;
    });
  }

  async cancelTask(
    id: string,
    reason: string,
    user: JwtClaims,
    scope: RequestScope,
  ) {
    await this.findTask(id, user, scope);
    const task = await this.prisma.inspectionTask.findUnique({
      where: { id },
    });
    if (
      !task ||
      !(<TaskStatus[]>[TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS]).includes(
        task.status,
      )
    ) {
      throw new UnprocessableEntityException('Invalid task transition');
    }
    return this.prisma.inspectionTask.update({
      where: { id },
      data: { status: TaskStatus.CANCELLED, cancelReason: reason },
    });
  }

  private async ownedReport(id: string, userId: string) {
    const report = await this.prisma.inspectionReport.findFirst({
      where: { id, inspectorId: userId },
      include: { task: true },
    });
    if (!report) throw new NotFoundException();
    return report;
  }

  async updateReport(id: string, userId: string, dto: UpdateReportDto) {
    const report = await this.ownedReport(id, userId);
    if (!report.isDraft && report.task.status !== TaskStatus.RETURNED) {
      throw new UnprocessableEntityException('Report is not editable');
    }
    return this.prisma.inspectionReport.update({
      where: { id },
      data: {
        result: dto.result,
        score: dto.score,
        findings: dto.findings as Prisma.InputJsonValue,
        summaryNote: dto.summaryNote,
        checklistTemplateId: dto.checklistTemplateId,
        isDraft: true,
      },
    });
  }

  async uploadEvidence(id: string, userId: string, file: Express.Multer.File) {
    const report = await this.ownedReport(id, userId);
    if (!report.isDraft && report.task.status !== TaskStatus.RETURNED) {
      throw new UnprocessableEntityException('Report is not editable');
    }
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.mimetype) || file.size > 10 * 1024 * 1024) {
      throw new UnprocessableEntityException('Invalid evidence file');
    }
    const suffix = extname(file.originalname).toLowerCase();
    const objectKey = `evidence-photos/${id}/${randomUUID()}${suffix}`;
    await this.storage.upload(objectKey, file.buffer, file.mimetype);
    return this.prisma.licenseDocument.create({
      data: {
        inspectionReportId: id,
        docType: 'evidence_photo',
        fileName: file.originalname,
        objectKey,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        uploadedBy: userId,
      },
    });
  }

  async deleteEvidence(id: string, docId: string, userId: string) {
    const report = await this.ownedReport(id, userId);
    if (!report.isDraft && report.task.status !== TaskStatus.RETURNED) {
      throw new UnprocessableEntityException('Report is not editable');
    }
    const document = await this.prisma.licenseDocument.findFirst({
      where: { id: docId, inspectionReportId: id },
    });
    if (!document) throw new NotFoundException();
    await this.storage.remove(document.objectKey);
    await this.prisma.licenseDocument.delete({ where: { id: docId } });
    return { success: true };
  }

  async submitReport(id: string, userId: string) {
    const report = await this.ownedReport(id, userId);
    if (!report.result) {
      throw new UnprocessableEntityException('Result is required');
    }
    if (
      !(<TaskStatus[]>[TaskStatus.IN_PROGRESS, TaskStatus.RETURNED]).includes(
        report.task.status,
      )
    ) {
      throw new UnprocessableEntityException('Invalid task transition');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inspectionReport.update({
        where: { id },
        data: { isDraft: false, submittedAt: new Date() },
      });
      await tx.inspectionTask.update({
        where: { id: report.taskId },
        data: { status: TaskStatus.PENDING_REVIEW },
      });
      const task = await tx.inspectionTask.findUnique({
        where: { id: report.taskId },
        include: { license: { include: { licenseType: true } } },
      });
      if (task) {
        const supervisors = await tx.systemUser.findMany({
          where: {
            roles: { has: 'supervisor' },
            agency: task.license?.licenseType.agency,
            userZones: { some: { zoneId: task.zoneId } },
            isActive: true,
          },
        });
        await tx.notification.createMany({
          data: supervisors.map((supervisor) => ({
            recipientId: supervisor.id,
            type: 'REPORT_SUBMITTED',
            titleTh: 'มีรายงานรอตรวจทาน',
            bodyTh: `รายงานงาน ${task.taskNo}`,
            refType: 'inspection_reports',
            refId: id,
          })),
        });
      }
      return updated;
    });
  }

  private async scopedReport(id: string, user: JwtClaims, scope: RequestScope) {
    const report = await this.prisma.inspectionReport.findFirst({
      where: {
        id,
        task: {
          zoneId: { in: scope.zoneIds },
          OR: [
            { license: { licenseType: { agency: scope.agency } } },
            { licenseId: null },
          ],
        },
      },
      include: { task: { include: { license: true } } },
    });
    if (!report || !user.roles.includes('supervisor')) {
      throw new NotFoundException();
    }
    return report;
  }

  async approveReport(id: string, user: JwtClaims, scope: RequestScope) {
    const report = await this.scopedReport(id, user, scope);
    if (report.task.status !== TaskStatus.PENDING_REVIEW || !report.result) {
      throw new UnprocessableEntityException('Invalid task transition');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inspectionReport.update({
        where: { id },
        data: { reviewedBy: user.sub, reviewedAt: new Date() },
      });
      await tx.inspectionTask.update({
        where: { id: report.taskId },
        data: { status: TaskStatus.APPROVED, completedAt: new Date() },
      });
      if (report.task.licenseId) {
        await tx.license.update({
          where: { id: report.task.licenseId },
          data:
            report.result === ReportResult.FAILED
              ? {
                  status: LicenseStatus.SUSPENDED,
                  suspendedAt: new Date(),
                  suspensionReason: `Failed inspection ${report.task.taskNo}`,
                }
              : report.task.license?.status === LicenseStatus.SUSPENDED
                ? {
                    status: LicenseStatus.ACTIVE,
                    suspendedAt: null,
                    suspensionReason: null,
                  }
                : {},
        });
      }
      await tx.notification.create({
        data: {
          recipientId: report.inspectorId,
          type: 'REPORT_APPROVED',
          titleTh: 'รายงานได้รับอนุมัติ',
          bodyTh: `รายงานงาน ${report.task.taskNo}`,
          refType: 'inspection_reports',
          refId: id,
        },
      });
      return updated;
    });
  }

  async returnReport(
    id: string,
    reviewComment: string,
    user: JwtClaims,
    scope: RequestScope,
  ) {
    const report = await this.scopedReport(id, user, scope);
    if (report.task.status !== TaskStatus.PENDING_REVIEW) {
      throw new UnprocessableEntityException('Invalid task transition');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inspectionReport.update({
        where: { id },
        data: {
          reviewComment,
          reviewedBy: user.sub,
          reviewedAt: new Date(),
          isDraft: true,
        },
      });
      await tx.inspectionTask.update({
        where: { id: report.taskId },
        data: { status: TaskStatus.RETURNED },
      });
      await tx.notification.create({
        data: {
          recipientId: report.inspectorId,
          type: 'REPORT_RETURNED',
          titleTh: 'รายงานถูกส่งกลับ',
          bodyTh: reviewComment,
          refType: 'inspection_reports',
          refId: id,
        },
      });
      return updated;
    });
  }
}
