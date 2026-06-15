import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class AuditQueryDto extends PaginationDto {
  /** Filter by acting user (uuid). */
  @IsOptional()
  @IsUUID()
  userId?: string;

  /**
   * Filter by entity type (resource segment).
   * @example inspection-tasks
   */
  @IsOptional()
  @IsString()
  entityType?: string;

  /**
   * Inclusive start of the created-at range (ISO-8601).
   * @example 2026-06-01
   */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /**
   * Inclusive end of the created-at range (ISO-8601).
   * @example 2026-06-30
   */
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
