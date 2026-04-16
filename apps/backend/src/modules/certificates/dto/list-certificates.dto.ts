import { CertificateStatus } from '@lms/database';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListCertificatesDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(CertificateStatus)
  status?: CertificateStatus;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

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
