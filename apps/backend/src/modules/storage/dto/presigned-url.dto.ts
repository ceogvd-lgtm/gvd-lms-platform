import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PresignedUrlDto {
  /** Full object key, e.g. `content/video/foo.mp4`. */
  @IsString()
  key!: string;

  /** TTL in seconds — default 3600 (1h), capped at 24h. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(24 * 60 * 60)
  ttl?: number;
}
