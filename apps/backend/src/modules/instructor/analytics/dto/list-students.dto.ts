import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListStudentsDto {
  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsIn(['at-risk', 'in-progress', 'completed', 'not-started', 'all'])
  filter?: 'at-risk' | 'in-progress' | 'completed' | 'not-started' | 'all';

  @IsOptional()
  @IsString()
  q?: string;

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

export class ExportStudentsDto {
  @IsIn(['csv'])
  format!: 'csv';

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsIn(['at-risk', 'in-progress', 'completed', 'not-started', 'all'])
  filter?: 'at-risk' | 'in-progress' | 'completed' | 'not-started' | 'all';
}
