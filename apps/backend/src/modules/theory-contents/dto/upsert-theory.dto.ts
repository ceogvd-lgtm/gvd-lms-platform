import { ContentType } from '@lms/database';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Upsert payload for `PUT /lessons/:lessonId/theory`.
 *
 * `body` is the TipTap ProseMirror JSON document (Phase 10). It's
 * accepted as a free-form object — the editor itself enforces the
 * shape, and we just persist it.
 */
export class UpsertTheoryDto {
  @IsString()
  @MaxLength(2000)
  overview!: string;

  @IsArray()
  objectives!: unknown[];

  @IsEnum(ContentType)
  contentType!: ContentType;

  @IsString()
  @IsUrl({ require_tld: false })
  contentUrl!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  duration?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  completionThreshold?: number;

  @IsOptional()
  @IsObject()
  body?: Record<string, unknown>;
}

/**
 * Tiny payload for the auto-save endpoint — clients only send the
 * editor body, not the heavier metadata.
 */
export class SaveBodyDto {
  @IsObject()
  body!: Record<string, unknown>;
}
