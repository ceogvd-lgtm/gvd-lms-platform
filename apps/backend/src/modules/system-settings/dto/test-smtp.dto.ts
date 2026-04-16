import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Optional override for the SMTP test. When the SUPER_ADMIN is tweaking
 * settings they may want to verify a new host/credentials BEFORE saving
 * them — these fields let them do that without persisting.
 *
 * If any field is omitted, the service falls back to the value already
 * stored in SystemSetting.
 */
export class TestSmtpDto {
  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  user?: string;

  @IsOptional()
  @IsString()
  pass?: string;

  @IsOptional()
  @IsString()
  from?: string;
}
