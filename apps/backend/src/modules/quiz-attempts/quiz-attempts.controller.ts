import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { QuizAttemptsService } from './quiz-attempts.service';

/**
 * Quiz-attempts routes (Phase 14) — replaces the Phase 12 "auto-pass"
 * shortcut with a server-graded submission. Every role that can see a
 * lesson can submit; the service does role-agnostic grading.
 *
 *   POST /quiz-attempts             submit + grade + cascade progress
 *   GET  /quiz-attempts/:quizId     caller's own attempt history
 */
@Controller()
export class QuizAttemptsController {
  constructor(private readonly attempts: QuizAttemptsService) {}

  @Post('quiz-attempts')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  submit(@CurrentUser() user: JwtPayload, @Body() dto: SubmitAttemptDto) {
    return this.attempts.submitAttempt(user.sub, dto);
  }

  @Get('quiz-attempts/:quizId')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  history(@CurrentUser() user: JwtPayload, @Param('quizId') quizId: string) {
    return this.attempts.listMyAttempts(user.sub, quizId);
  }
}
