import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ReportResult, TaskStatus } from '@prisma/client';

export class TaskQueryDto {
  /** Filter by task status. */
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}

export class CreateTaskDto {
  /** Business to inspect (uuid). */
  @IsUUID()
  businessId!: string;

  /** Optional license under inspection (uuid). */
  @IsOptional()
  @IsUUID()
  licenseId?: string;

  /** Inspector to assign (uuid). Omit to create an unassigned (WAITING_ASSIGNMENT) task. */
  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  /**
   * Optional due date (ISO-8601).
   * @example 2026-07-01
   */
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class AssignTaskDto {
  /** Inspector to assign (uuid). Must share agency, and not own the business. */
  @IsUUID()
  assignedTo!: string;
}

export class CancelTaskDto {
  /** Reason for cancelling the task. */
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class UpdateReportDto {
  /** Overall inspection result. Required at submit time; optional for draft saves. */
  @IsOptional()
  @IsEnum(ReportResult)
  result?: ReportResult;

  /**
   * Score 0–100. Compared against the checklist passing score.
   * @example 85
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number;

  /**
   * Checklist answers, e.g. `[{ "no": 1, "answer": true, "note": "ok" }]`.
   */
  @IsOptional()
  @IsArray()
  findings?: unknown[];

  /** Free-text summary (Thai). */
  @IsOptional()
  @IsString()
  summaryNote?: string;

  /** Checklist template used for this report (uuid). */
  @IsOptional()
  @IsUUID()
  checklistTemplateId?: string;
}

export class ReturnReportDto {
  /** Reason the report is being returned to the officer (Thai). */
  @IsString()
  @IsNotEmpty()
  reviewComment!: string;
}
