import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { StudentsService } from './students.service';

/**
 * Student-facing dashboard data (Phase 14).
 *
 *   GET /students/dashboard     full dashboard payload
 *   GET /students/streak        daily activity + streak counter
 *   GET /students/my-learning   hierarchical tree + lock logic
 *   GET /students/progress      charts payload
 *   GET /students/xp            gamification totals
 *
 * All roles that can view student UI are allowed — the service always
 * scopes to the JWT caller's id, never accepts a studentId param.
 */
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get('dashboard')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  dashboard(@CurrentUser() user: JwtPayload) {
    return this.students.getDashboard(user.sub);
  }

  @Get('streak')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  streak(@CurrentUser() user: JwtPayload) {
    return this.students.getStreak(user.sub);
  }

  @Get('my-learning')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  myLearning(@CurrentUser() user: JwtPayload) {
    return this.students.getMyLearning(user.sub);
  }

  @Get('progress')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  progress(@CurrentUser() user: JwtPayload) {
    return this.students.getProgress(user.sub);
  }

  @Get('xp')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  xp(@CurrentUser() user: JwtPayload) {
    return this.students.getXp(user.sub);
  }

  @Get('certificates')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  certificates(@CurrentUser() user: JwtPayload) {
    return this.students.getMyCertificates(user.sub);
  }

  @Get('certificates/:id')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  async certificateDetail(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const detail = await this.students.getMyCertificateDetail(user.sub, id);
    if (!detail) throw new NotFoundException('Không tìm thấy chứng chỉ');
    return detail;
  }
}
