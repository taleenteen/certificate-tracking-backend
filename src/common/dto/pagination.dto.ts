import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class PaginationDto {
  /**
   * 1-based page number.
   * @example 1
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  /**
   * Page size (max 100).
   * @example 20
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
