import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDiscussionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionUserIds?: string[];
}

export class CreateReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;

  /**
   * Phase 14 gap #6 — @-mentions from the reply composer. Service
   * unions these with the default "thread author + prior repliers"
   * set so mentioned users always get a DISCUSSION_REPLY notification
   * even if they haven't participated yet.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionUserIds?: string[];
}
