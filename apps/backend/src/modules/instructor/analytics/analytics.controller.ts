import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { Roles } from '../../../common/rbac/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

import { InstructorAnalyticsService } from './analytics.service';
import { ExportStudentsDto, ListStudentsDto } from './dto/list-students.dto';
import { SendReminderDto } from './dto/send-reminder.dto';

@Controller('instructor/analytics')
@Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
export class InstructorAnalyticsController {
  constructor(private readonly analytics: InstructorAnalyticsService) {}

  // Static "students/export" before dynamic ":studentId" so router matches first.
  @Get('students/export')
  async exportCsv(
    @CurrentUser() user: JwtPayload,
    @Query() dto: ExportStudentsDto,
    @Res() res: Response,
  ) {
    const { buffer, contentType, filename } = await this.analytics.exportCsv(
      { id: user.sub, role: user.role },
      dto,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get('students')
  listStudents(@CurrentUser() user: JwtPayload, @Query() dto: ListStudentsDto) {
    return this.analytics.listStudents({ id: user.sub, role: user.role }, dto);
  }

  @Get('students/:studentId/courses/:courseId')
  getStudentDetail(
    @CurrentUser() user: JwtPayload,
    @Param('studentId') studentId: string,
    @Param('courseId') courseId: string,
  ) {
    return this.analytics.getStudentDetail({ id: user.sub, role: user.role }, studentId, courseId);
  }

  @Post('remind')
  sendReminder(@CurrentUser() user: JwtPayload, @Body() dto: SendReminderDto, @Req() req: Request) {
    return this.analytics.sendReminder({ id: user.sub, role: user.role }, dto, {
      ip: getClientIp(req),
    });
  }
}

function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
