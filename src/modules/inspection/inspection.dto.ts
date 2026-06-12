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
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}

export class CreateTaskDto {
  @IsUUID()
  businessId!: string;

  @IsOptional()
  @IsUUID()
  licenseId?: string;

  @IsUUID()
  assignedTo!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class CancelTaskDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class UpdateReportDto {
  @IsEnum(ReportResult)
  result!: ReportResult;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  score!: number;

  @IsArray()
  findings!: unknown[];

  @IsOptional()
  @IsString()
  summaryNote?: string;

  @IsUUID()
  checklistTemplateId!: string;
}

export class ReturnReportDto {
  @IsString()
  @IsNotEmpty()
  reviewComment!: string;
}
