import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import {
  AddQuestionDto,
  AddQuestionsBulkDto,
  RandomPickDto,
  ReorderQuestionsDto,
} from './dto/add-question.dto';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { QuizzesService } from './quizzes.service';

/**
 * Quiz endpoints (Phase 11).
 *
 * Route surface mixes "lesson-scoped" and "quiz-scoped" paths to match what
 * the frontend actually needs:
 *
 *   GET    /lessons/:id/quiz                    — student view + instructor view
 *   POST   /lessons/:id/quiz                    — instructor creates
 *   PATCH  /quizzes/:id                         — instructor updates settings
 *   DELETE /quizzes/:id                         — ADMIN+ only
 *
 *   POST   /quizzes/:id/questions               — add one from bank
 *   POST   /quizzes/:id/questions/bulk          — add many (frontend Quiz Builder)
 *   POST   /quizzes/:id/questions/random-pick   — random pick N from filter
 *   DELETE /quizzes/:id/questions/:questionId   — remove one
 *   PATCH  /quizzes/:id/questions/reorder       — reorder all
 */
@Controller()
export class QuizzesController {
  constructor(private readonly quizzes: QuizzesService) {}

  // ---------- Lesson-scoped ----------
  @Get('lessons/:lessonId/quiz')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  getForLesson(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Query('includeAnswers') includeAnswers?: string,
  ) {
    // Students never see answer keys at fetch-time (they see them per-attempt
    // if `showAnswerAfter` is true). Instructors own the course → unmasked.
    const hideAnswers =
      user.role === Role.STUDENT || !(includeAnswers === 'true' || includeAnswers === '1');
    return this.quizzes.getForLesson({ id: user.sub, role: user.role }, lessonId, {
      hideAnswers,
    });
  }

  @Post('lessons/:lessonId/quiz')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  createForLesson(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Body() dto: CreateQuizDto,
  ) {
    return this.quizzes.createForLesson({ id: user.sub, role: user.role }, lessonId, dto);
  }

  // ---------- Quiz-scoped ----------
  @Patch('quizzes/:id')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateQuizDto) {
    return this.quizzes.update({ id: user.sub, role: user.role }, id, dto);
  }

  @Delete('quizzes/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Req() req: Request) {
    return this.quizzes.remove({ id: user.sub, role: user.role }, id, { ip: getClientIp(req) });
  }

  // ---------- Quiz ↔ questions management ----------
  @Post('quizzes/:id/questions')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  addQuestion(
    @CurrentUser() user: JwtPayload,
    @Param('id') quizId: string,
    @Body() dto: AddQuestionDto,
  ) {
    return this.quizzes.addQuestion({ id: user.sub, role: user.role }, quizId, dto);
  }

  @Post('quizzes/:id/questions/bulk')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  addQuestionsBulk(
    @CurrentUser() user: JwtPayload,
    @Param('id') quizId: string,
    @Body() dto: AddQuestionsBulkDto,
  ) {
    return this.quizzes.addQuestionsBulk(
      { id: user.sub, role: user.role },
      quizId,
      dto.questionIds,
    );
  }

  @Post('quizzes/:id/questions/random-pick')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  randomPick(
    @CurrentUser() user: JwtPayload,
    @Param('id') quizId: string,
    @Body() dto: RandomPickDto,
  ) {
    return this.quizzes.randomPick({ id: user.sub, role: user.role }, quizId, dto);
  }

  @Delete('quizzes/:id/questions/:questionId')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  removeQuestion(
    @CurrentUser() user: JwtPayload,
    @Param('id') quizId: string,
    @Param('questionId') questionId: string,
  ) {
    return this.quizzes.removeQuestion({ id: user.sub, role: user.role }, quizId, questionId);
  }

  @Patch('quizzes/:id/questions/reorder')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  reorder(
    @CurrentUser() user: JwtPayload,
    @Param('id') quizId: string,
    @Body() dto: ReorderQuestionsDto,
  ) {
    return this.quizzes.reorderQuestions({ id: user.sub, role: user.role }, quizId, dto);
  }
}

function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
