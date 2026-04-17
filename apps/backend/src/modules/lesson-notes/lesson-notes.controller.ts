import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Body, Controller, Get, Param, Put } from '@nestjs/common';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { LessonNotesService } from './lesson-notes.service';

/**
 * Lesson notes (Phase 14) — per-student, per-lesson TipTap JSON.
 *
 *   GET /lessons/:id/notes   return caller's note ({} if none)
 *   PUT /lessons/:id/notes   upsert { content: JSON }
 */
@Controller()
export class LessonNotesController {
  constructor(private readonly notes: LessonNotesService) {}

  @Get('lessons/:id/notes')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  async get(@CurrentUser() user: JwtPayload, @Param('id') lessonId: string) {
    const note = await this.notes.getNote(user.sub, lessonId);
    return note ?? { lessonId, studentId: user.sub, content: null, updatedAt: null };
  }

  @Put('lessons/:id/notes')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  async upsert(
    @CurrentUser() user: JwtPayload,
    @Param('id') lessonId: string,
    @Body() body: { content: unknown },
  ) {
    return this.notes.upsertNote(user.sub, lessonId, body.content as never);
  }
}
