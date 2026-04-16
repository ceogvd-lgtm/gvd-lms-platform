import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListAuditLogDto {
  /** Free-text search on `action` (e.g. "DELETE"). */
  @IsOptional()
  @IsString()
  q?: string;

  /** Exact filter on `action`. */
  @IsOptional()
  @IsString()
  action?: string;

  /** Exact filter on `targetType` (e.g. "User", "Lesson"). */
  @IsOptional()
  @IsString()
  targetType?: string;

  /** Exact filter on `userId` (the actor). */
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
