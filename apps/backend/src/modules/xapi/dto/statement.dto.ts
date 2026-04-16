import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * xAPI Statement (simplified).
 *
 * Full xAPI statements have a dozen optional fields we don't care about
 * (context, authority, attachments…). We validate only the four we use:
 *
 *   actor.mbox / account → identifies the student (optional; the
 *   controller identifies from the JWT anyway)
 *   verb.id → the IRI we map to a ProgressStatus
 *   object.id → lesson IRI (fallback if route param is missing)
 *   result.score.raw → score to persist on LessonProgress
 *
 * Everything else is accepted as free-form JSON and stored verbatim so
 * the raw statement can be replayed later if we ever add a proper LRS.
 */
export class XapiStatementDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsObject()
  actor!: {
    name?: string;
    mbox?: string;
    account?: { homePage?: string; name?: string };
  };

  @IsObject()
  verb!: { id: string; display?: Record<string, string> };

  @IsObject()
  object!: {
    id: string;
    objectType?: string;
    definition?: { name?: Record<string, string>; description?: Record<string, string> };
  };

  @IsOptional()
  @IsObject()
  result?: {
    score?: { raw?: number; min?: number; max?: number; scaled?: number };
    success?: boolean;
    completion?: boolean;
    duration?: string;
    response?: string;
  };

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsString()
  stored?: string;
}
