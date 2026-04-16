import { Role } from '@lms/types';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export class ExportUsersDto {
  @IsIn(['csv', 'xlsx'], { message: 'format phải là csv hoặc xlsx' })
  format!: 'csv' | 'xlsx';

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsIn(['active', 'blocked'])
  status?: 'active' | 'blocked';
}
