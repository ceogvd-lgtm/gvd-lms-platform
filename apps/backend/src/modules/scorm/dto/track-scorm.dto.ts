import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Payload sent by the SCORM runtime bridge (scorm-again) whenever the
 * package calls LMSCommit.
 *
 * All fields are optional — a SCORM 1.2 package sometimes reports only
 * `lessonStatus`, while 2004 tends to send `scoreRaw` + `sessionTime`
 * too. We treat any of them as a signal and only persist what's present.
 */
export class TrackScormDto {
  /** `passed` / `failed` / `completed` / `incomplete` / `browsed` / `not attempted`. */
  @IsOptional()
  @IsString()
  @IsIn(['passed', 'failed', 'completed', 'incomplete', 'browsed', 'not attempted'])
  lessonStatus?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  scoreRaw?: number;

  /**
   * Session time in seconds (SCORM 2004 emits PT1H20M) — we expect the
   * frontend bridge to have pre-parsed it to an integer.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  sessionTime?: number;

  /** Raw SCORM suspend data blob — preserved for resume. */
  @IsOptional()
  @IsString()
  suspendData?: string;
}
