import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { CompleteAttemptDto, RecordActionDto, StartAttemptDto } from './dto/practice.dto';
import { PracticeService } from './practice.service';

/**
 * Virtual-lab routes (Phase 13).
 *
 *   POST  /practice/start                  STUDENT+ — create attempt
 *   POST  /practice/action                 STUDENT+ — append event
 *   POST  /practice/complete               STUDENT+ — finalise + grade
 *   GET   /practice/:lessonId/attempts     STUDENT sees own · INSTRUCTOR+ sees all
 *   GET   /practice/:lessonId/analytics    INSTRUCTOR own · ADMIN+
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

  @Get(':lessonId/attempts')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  attempts(@CurrentUser() user: JwtPayload, @Param('lessonId') lessonId: string) {
    return this.practice.listAttempts({ id: user.sub, role: user.role }, lessonId);
  }

  @Get(':lessonId/analytics')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  analytics(@CurrentUser() user: JwtPayload, @Param('lessonId') lessonId: string) {
    return this.practice.getAnalytics({ id: user.sub, role: user.role }, lessonId);
  }
}
