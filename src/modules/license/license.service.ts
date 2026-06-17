import { Injectable, NotFoundException } from '@nestjs/common';
import { LicenseStatus, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  CreateLicenseTypeDto,
  UpdateLicenseStatusDto,
  UpdateLicenseTypeDto,
} from './license.dto';

const STATUS_META: Array<{
  statusCode: string;
  statusName: string;
  description: string;
  nextAction: string;
  color: string;
}> = [
  { statusCode: 'ACTIVE', statusName: 'มีผล', description: 'ใบอนุญาตใช้งานได้', nextAction: 'ต่ออายุก่อนหมดอายุ', color: 'success' },
  { statusCode: 'PENDING', statusName: 'รออนุมัติ', description: 'ยื่นแล้ว รอตรวจสอบ', nextAction: 'ตรวจสอบเอกสาร', color: 'warning' },
  { statusCode: 'SUSPENDED', statusName: 'ระงับ', description: 'ระงับใบอนุญาตชั่วคราว', nextAction: 'รอชำระค่าธรรมเนียม', color: 'purple' },
  { statusCode: 'EXPIRED', statusName: 'หมดอายุ', description: 'ใบอนุญาตพ้นกำหนด', nextAction: 'ยื่นต่ออายุ', color: 'muted' },
  { statusCode: 'REVOKED', statusName: 'ถูกเพิกถอน', description: 'ใบอนุญาตถูกยกเลิกถาวร', nextAction: 'ยื่นขอใหม่', color: 'critical' },
];

const TASK_STATUS_META: Array<{
  statusCode: string;
  statusName: string;
  description: string;
  color: string;
}> = [
  { statusCode: 'WAITING_ASSIGNMENT', statusName: 'รอมอบหมาย', description: 'ยังไม่มีเจ้าหน้าที่รับผิดชอบ', color: 'warning' },
  { statusCode: 'ASSIGNED', statusName: 'มอบหมายแล้ว', description: 'มีเจ้าหน้าที่รับมอบหมาย', color: 'info' },
  { statusCode: 'IN_PROGRESS', statusName: 'กำลังดำเนินการ', description: 'เจ้าหน้าที่กำลังตรวจสอบ', color: 'warning' },
  { statusCode: 'PENDING_REVIEW', statusName: 'รอการตรวจสอบ', description: 'รายงานถูกส่งแล้ว รอผู้บังคับบัญชา', color: 'purple' },
  { statusCode: 'APPROVED', statusName: 'เสร็จสิ้น', description: 'ผ่านการตรวจสอบ', color: 'success' },
  { statusCode: 'RETURNED', statusName: 'ส่งกลับแก้ไข', description: 'ต้องแก้ไขรายงาน', color: 'critical' },
  { statusCode: 'CANCELLED', statusName: 'ยกเลิก', description: 'งานถูกยกเลิก', color: 'muted' },
];

@Injectable()
export class LicenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  listTypes() {
    return this.prisma.licenseType.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  async createType(dto: CreateLicenseTypeDto) {
    return this.prisma.licenseType.create({ data: dto });
  }

  async updateType(id: string, dto: UpdateLicenseTypeDto) {
    const existing = await this.prisma.licenseType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    return this.prisma.licenseType.update({ where: { id }, data: dto });
  }

  listStatuses() {
    return {
      licenseStatuses: STATUS_META,
      taskStatuses: TASK_STATUS_META,
    };
  }

  async updateStatus(id: string, dto: UpdateLicenseStatusDto) {
    const exists = await this.prisma.license.findUnique({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException();
    return this.prisma.license.update({
      where: { id },
      data: { status: dto.status as LicenseStatus },
    });
  }

  async findOne(id: string, minimal = false) {
    const license = await this.prisma.license.findFirst({
      where: { id, deletedAt: null },
      include: {
        licenseType: true,
        business: {
          select: minimal
            ? { id: true, nameTh: true, province: true }
            : {
                id: true,
                nameTh: true,
                address: true,
                province: true,
                latitude: true,
                longitude: true,
              },
        },
        documents: !minimal,
      },
    });
    if (!license) throw new NotFoundException();
    if (minimal) return license;
    return {
      ...license,
      documents: await Promise.all(
        license.documents.map(async (document) => ({
          ...document,
          url: await this.storage.presign(document.objectKey),
          urlExpiresInSeconds: 600,
        })),
      ),
    };
  }
}
