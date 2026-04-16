import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Upsert payload for `PUT /lessons/:lessonId/practice`.
 *
 * `scoringConfig` and `safetyChecklist` are persisted as JSON. The
 * Phase 10 instructor UI renders simple forms over them; richer schemas
 * land in later phases when the WebGL scoring engine is implemented.
 */
export class UpsertPracticeDto {
  @IsString()
  @MaxLength(2000)
  introduction!: string;

  @IsArray()
  objectives!: unknown[];

  @IsString()
  @IsUrl({ require_tld: false })
  webglUrl!: string;

  @IsObject()
  scoringConfig!: Record<string, unknown>;

  @IsObject()
  safetyChecklist!: Record<string, unknown>;

  @IsInt()
  @Min(0)
  @Max(100)
  passScore!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  timeLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;
}
