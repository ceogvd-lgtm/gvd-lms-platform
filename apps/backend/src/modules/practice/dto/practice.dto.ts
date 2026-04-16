import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// =====================================================
// POST /practice/start
// =====================================================
export class StartAttemptDto {
  @IsString()
  lessonId!: string;
}

// =====================================================
// POST /practice/action — one step/action emitted by Unity
// =====================================================
export class RecordActionDto {
  @IsString()
  attemptId!: string;

  @IsString()
  stepId!: string;

  @IsBoolean()
  isCorrect!: boolean;

  @IsOptional()
  @IsBoolean()
  isInOrder?: boolean;

  @IsOptional()
  @IsBoolean()
  isSafe?: boolean;

  @IsOptional()
  @IsString()
  safetyViolationId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  score?: number;

  /** Unix ms — Unity sends Date.now() when the step fires. */
  @IsOptional()
  @IsNumber()
  timestamp?: number;
}

// =====================================================
// POST /practice/complete — Unity's "all done" payload
// =====================================================
export class StepResultDto {
  @IsString()
  stepId!: string;

  @IsBoolean()
  isCorrect!: boolean;

  @IsOptional()
  @IsBoolean()
  isInOrder?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;
}

export class SafetyViolationDto {
  /** References scoringConfig.safetyChecklist[].safetyId */
  @IsString()
  safetyId!: string;

  @IsOptional()
  @IsNumber()
  timestamp?: number;
}

export class CompleteAttemptDto {
  @IsString()
  attemptId!: string;

  /** How long the attempt took, in seconds. Server clamps to sane bounds. */
  @IsInt()
  @Min(0)
  @Max(24 * 3600)
  duration!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepResultDto)
  stepsResult!: StepResultDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SafetyViolationDto)
  safetyViolations!: SafetyViolationDto[];
}
