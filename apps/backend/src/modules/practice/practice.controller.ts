import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { CompleteAttemptDto, RecordActionDto, StartAttemptDto } from './dto/practice.dto';
import { PracticeService } from './practice.service';

/**
 * Virtual-lab routes (Phase 13).
 *
 *   POST  /practice/start                           STUDENT+ — create attempt
 *   POST  /practice/action                          STUDENT+ — append event
 *   POST  /practice/complete                        STUDENT+ — finalise + grade
 *   GET   /practice/:lessonId/my-attempts           Any authenticated — caller's own
 *   GET   /practice/:lessonId/attempts?studentId=x  INSTRUCTOR+ only — cross-student
 *   GET   /practice/:lessonId/analytics             INSTRUCTOR own · ADMIN+
 */
@Controller('practice')
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  @Post('start')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  start(@CurrentUser() user: JwtPayload, @Body() dto: StartAttemptDto) {
    return this.practice.startAttempt({ id: user.sub, role: user.role }, dto);
  }

  @Post('action')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  action(@CurrentUser() user: JwtPayload, @Body() dto: RecordActionDto) {
    return this.practice.recordAction({ id: user.sub, role: user.role }, dto);
  }

  @Post('complete')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  complete(@CurrentUser() user: JwtPayload, @Body() dto: CompleteAttemptDto) {
    return this.practice.completeAttempt({ id: user.sub, role: user.role }, dto);
  }

  /**
   * Student lesson page calls this — always scoped to the current user.
   * Previously the frontend called `/attempts` which, when the caller
   * was an admin browsing as a student, returned every student's rows
   * and mis-calculated the "attempts used" badge on the screen.
   */
  @Get(':lessonId/my-attempts')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  myAttempts(@CurrentUser() user: JwtPayload, @Param('lessonId') lessonId: string) {
    return this.practice.listMyAttempts(user.sub, lessonId);
  }

  /**
   * Cross-student view used by `/instructor/analytics`. Restricted to
   * INSTRUCTOR+ (and `listAttempts` asserts INSTRUCTORs own the course).
   * Optional `?studentId=x` narrows to a single student for drill-down.
   */
  @Get(':lessonId/attempts')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  attempts(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Query('studentId') studentId?: string,
  ) {
    return this.practice.listAttempts(
      { id: user.sub, role: user.role },
      lessonId,
      studentId?.trim() || undefined,
    );
  }

  @Get(':lessonId/analytics')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  analytics(@CurrentUser() user: JwtPayload, @Param('lessonId') lessonId: string) {
    return this.practice.getAnalytics({ id: user.sub, role: user.role }, lessonId);
  }
}
