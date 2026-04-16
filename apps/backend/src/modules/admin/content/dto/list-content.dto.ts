import { CourseStatus } from '@lms/database';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListContentCoursesDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;

  @IsOptional()
  @IsString()
  subjectId?: string;

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

export class ListContentLessonsDto {
  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  /**
   * Lesson state filter. `pending` = isPublished=false && isDeleted=false
   * `published` = isPublished=true  && isDeleted=false
   * `deleted`   = isDeleted=true
   * `all`       = no state filter
   */
  @IsOptional()
  @IsString()
  state?: 'pending' | 'published' | 'deleted' | 'all';

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
