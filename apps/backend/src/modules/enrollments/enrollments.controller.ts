import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { EnrollmentsService } from './enrollments.service';

@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  enroll(@CurrentUser() user: JwtPayload, @Body() dto: CreateEnrollmentDto) {
    return this.enrollments.enroll({ id: user.sub, role: user.role }, dto);
  }

  /**
   * GET /enrollments/me — student-dashboard payload: every enrollment
   * the current user has, plus per-course progress % and a
   * "next lesson" id so the Tiếp tục học button has a jump target.
   * Available to any authenticated user (STUDENT + instructors/admins
   * who also happen to be enrolled in courses for their own training).
   */
  @Get('me')
  listMine(@CurrentUser() user: JwtPayload) {
    return this.enrollments.listMine(user.sub);
  }

  /**
   * Phase 18 — POST /enrollments/auto-enroll
   * Admin manual trigger auto-enroll cho 1 course cụ thể (ví dụ sau
   * downtime khi cron không chạy, hoặc debug). Body: { courseId }.
   * Idempotent (skipDuplicates).
   */
  @Post('auto-enroll')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  autoEnroll(@Body() body: { courseId: string }) {
    return this.enrollments.autoEnrollByDepartment(body.courseId);
  }

  /**
   * Phase 18 — GET /enrollments/stats
   * Thống kê số student / course / enrollment theo department để admin
   * hiển thị trong /admin/reports. Trả về 1 row/department.
   */
  @Get('stats')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  stats() {
    return this.enrollments.statsByDepartment();
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.enrollments.remove({ id: user.sub, role: user.role }, id);
  }
}
