import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Controller, Get, Param, Query } from '@nestjs/common';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { AtRiskService } from './at-risk.service';
import { ProgressService } from './progress.service';

/**
 * Phase 15 — /progress/* endpoints.
 *
 *   GET /progress/student/:id/courses         own / INSTRUCTOR / ADMIN+
 *   GET /progress/student/:id/course/:cid     same
 *   GET /progress/course/:id/students         INSTRUCTOR own / ADMIN+
 *   GET /progress/analytics/at-risk           INSTRUCTOR own / ADMIN+
 *
 * Service enforces the "own student" check for the STUDENT role
 * (`assertStudentReadable`) and the "own course" check for INSTRUCTOR,
 * so the controller only needs the role-level gate.
 */
@Controller('progress')
export class ProgressController {
  constructor(
    private readonly progress: ProgressService,
    private readonly atRisk: AtRiskService,
  ) {}

  @Get('student/:id/courses')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  studentCourses(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.progress.getStudentCourses({ id: user.sub, role: user.role }, id);
  }

  @Get('student/:id/course/:cid')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  studentCourseDetail(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('cid') cid: string,
  ) {
    return this.progress.getStudentCourse({ id: user.sub, role: user.role }, id, cid);
  }

  @Get('course/:id/students')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  courseStudents(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.progress.getCourseStudents({ id: user.sub, role: user.role }, id);
  }

  @Get('analytics/at-risk')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  atRiskList(@CurrentUser() user: JwtPayload, @Query('courseId') courseId?: string) {
    return this.atRisk.detectAtRisk({ id: user.sub, role: user.role }, courseId);
  }
}
