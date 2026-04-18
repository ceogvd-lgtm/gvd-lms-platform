import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class GradeThresholdsDto {
  @IsInt()
  @Min(0)
  @Max(100)
  excellent!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  good!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  pass!: number;
}

export class UpsertCriteriaDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minPassScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minProgress?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minPracticeScore?: number;

  @IsOptional()
  @IsBoolean()
  noSafetyViolation?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredLessons?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  validityMonths?: number | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => GradeThresholdsDto)
  gradeThresholds?: GradeThresholdsDto;

  @IsOptional()
  @IsObject()
  customCriteria?: unknown;
}

export class IssueManualDto {
  @IsString()
  studentId!: string;

  @IsString()
  courseId!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
