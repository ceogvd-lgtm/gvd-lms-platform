import { Role } from '@lms/types';
import { Controller, Get, Query, Res } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';

import { Roles } from '../../common/rbac/roles.decorator';

import { ProgressExportDto, ProgressReportDto } from './dto/progress-report.dto';
import { ReportsService } from './reports.service';

/**
 * Query DTOs for the two export endpoints that don't take a progress filter.
 */
class UsersExportDto {
  @IsIn(['pdf', 'xlsx'])
  format!: 'pdf' | 'xlsx';

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsIn(['active', 'blocked'])
  status?: 'active' | 'blocked';
}

class CertificatesExportDto {
  @IsIn(['pdf', 'xlsx'])
  format!: 'pdf' | 'xlsx';
}

/**
 * /admin/reports/* — ADMIN+ only. Returns JSON for preview endpoints
 * and streams Buffer (as Content-Disposition attachment) for export
 * endpoints.
 */
@Controller('admin/reports')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // ---------- PROGRESS ----------
  @Get('progress')
  getProgress(@Query() dto: ProgressReportDto) {
    return this.reports.getProgressReport(dto);
  }

  @Get('progress/export')
  async exportProgress(@Query() dto: ProgressExportDto, @Res() res: Response) {
    const { buffer, contentType, filename } = await this.reports.exportProgressReport(dto.format, {
      departmentId: dto.departmentId,
      subjectId: dto.subjectId,
      courseId: dto.courseId,
      from: dto.from,
      to: dto.to,
    });
    this.sendFile(res, buffer, contentType, filename);
  }

  // ---------- USERS ----------
  @Get('users/export')
  async exportUsers(@Query() dto: UsersExportDto, @Res() res: Response) {
    const { buffer, contentType, filename } = await this.reports.exportUsers(dto.format, {
      role: dto.role,
      status: dto.status,
    });
    this.sendFile(res, buffer, contentType, filename);
  }

  // ---------- CERTIFICATES ----------
  @Get('certificates/export')
  async exportCertificates(@Query() dto: CertificatesExportDto, @Res() res: Response) {
    const { buffer, contentType, filename } = await this.reports.exportCertificates(dto.format);
    this.sendFile(res, buffer, contentType, filename);
  }

  private sendFile(res: Response, buffer: Buffer, contentType: string, filename: string) {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
