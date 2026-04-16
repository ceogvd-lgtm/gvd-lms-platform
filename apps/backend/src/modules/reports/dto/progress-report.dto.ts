import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class ProgressReportDto {
  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ExportFormatDto {
  @IsIn(['pdf', 'xlsx'], { message: 'format phải là pdf hoặc xlsx' })
  format!: 'pdf' | 'xlsx';
}

export class ProgressExportDto {
  @IsIn(['pdf', 'xlsx'], { message: 'format phải là pdf hoặc xlsx' })
  format!: 'pdf' | 'xlsx';

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
