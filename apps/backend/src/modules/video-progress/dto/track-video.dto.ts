import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

/**
 * Heartbeat payload sent by the student video player every ~10 seconds
 * (debounced client-side).
 *
 * `watchedSeconds` / `duration` drive the completion ratio; `lastPosition`
 * is what we replay on resume. `isCompleted` is a client-side hint but
 * the server recomputes it from the ratio + threshold so an overeager
 * player can't mark a lesson done by fiat.
 */
export class TrackVideoDto {
  @IsInt()
  @Min(0)
  watchedSeconds!: number;

  @IsInt()
  @Min(1)
  duration!: number;

  @IsInt()
  @Min(0)
  lastPosition!: number;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}
