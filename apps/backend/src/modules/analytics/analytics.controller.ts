import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReportsService } from '../reports/reports.service';

import { AnalyticsService } from './analytics.service';
import { ScheduleReportDto } from './dto/schedule-report.dto';
import { ScheduledReportsService } from './scheduled-reports.service';

/**
 * Phase 15 — /analytics/* endpoints.
 *
 * GET /analytics/department/:id              ADMIN+
 * GET /analytics/cohort                      ADMIN+
 * GET /analytics/system                      ADMIN+
 * GET /analytics/lesson-difficulty           INSTRUCTOR own / ADMIN+
 * GET /analytics/heatmap                     INSTRUCTOR own / ADMIN+
 * GET /analytics/export                      ADMIN+
 * POST /analytics/schedule-report            ADMIN+
 *
 * Export endpoint delegates to the existing ReportsService so we don't
 * duplicate the pdfmake + exceljs plumbing added in Phase 09.
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly reports: ReportsService,
    private readonly scheduled: ScheduledReportsService,
  ) {}

  @Get('department/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  department(@Param('id') id: string) {
    return this.analytics.getDepartment(id);
  }

  @Get('cohort')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  cohort() {
    return this.analytics.getCohort();
  }

  @Get('system')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  system() {
    return this.analytics.getSystem();
  }

  @Get('lesson-difficulty')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  lessonDifficulty(@CurrentUser() user: JwtPayload) {
    return this.analytics.getLessonDifficulty({ id: user.sub, role: user.role });
  }

  @Get('heatmap')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  heatmap(@CurrentUser() user: JwtPayload) {
    return this.analytics.getHeatmap({ id: user.sub, role: user.role });
  }

  // =====================================================
  // GET /analytics/export?type=progress|users|certificates&format=xlsx|pdf
  // =====================================================
  /**
   * Delegates to ReportsService (Phase 09) so we don't ship a second
   * copy of the pdfmake/exceljs code path. CSV format is not currently
   * supported — spec mentions it but the exporter layer only exposes
   * xlsx + pdf; `format=csv` → 400.
   */
  @Get('export')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async export(
    @Query('type') type: 'progress' | 'users' | 'certificates',
    @Query('format') format: 'xlsx' | 'pdf' | 'csv',
    @Res() res: Response,
  ) {
    if (format === 'csv') {
      throw new BadRequestException('CSV export không hỗ trợ ở endpoint này — dùng xlsx hoặc pdf');
    }
    if (format !== 'xlsx' && format !== 'pdf') {
      throw new BadRequestException('format phải là xlsx hoặc pdf');
    }

    let result;
    switch (type) {
      case 'progress':
        result = await this.reports.exportProgressReport(format, {});
        break;
      case 'users':
        result = await this.reports.exportUsers(format, {});
        break;
      case 'certificates':
        result = await this.reports.exportCertificates(format);
        break;
      default:
        throw new BadRequestException('type phải là progress | users | certificates');
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }

  // =====================================================
  // POST /analytics/schedule-report
  // =====================================================
  /**
   * Register one or more admin emails to receive the weekly PDF digest.
   * Stored in-memory for Phase 15 — moving to SystemSetting row is a
   * Phase 16 task. `sendNow=true` fires the at-risk sweep immediately
   * so the admin can verify the pipeline without waiting a week.
   */
  @Post('schedule-report')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async scheduleReport(@Body() dto: ScheduleReportDto) {
    for (const email of dto.recipients) {
      this.scheduled.addSubscriber(email);
    }
    let immediate: { flagged: number; notificationsSent: number } | undefined;
    if (dto.sendNow) {
      immediate = await this.scheduled.runAtRiskSweepNow();
    }
    return {
      subscribers: this.scheduled.listSubscribers(),
      sentNow: immediate ?? null,
    };
  }
}
