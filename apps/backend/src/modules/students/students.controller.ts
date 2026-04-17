import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Controller, Get } from '@nestjs/common';

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
}
