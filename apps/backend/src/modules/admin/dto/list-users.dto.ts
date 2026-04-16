import { Role } from '@lms/types';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListUsersDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'role không hợp lệ' })
  role?: Role;

  /** Filter by account state. `active` = not blocked, `blocked` = blocked. */
  @IsOptional()
  @IsIn(['active', 'blocked'])
  status?: 'active' | 'blocked';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
