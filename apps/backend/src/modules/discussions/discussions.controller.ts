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
  Post,
  Query,
} from '@nestjs/common';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { DiscussionsService } from './discussions.service';
import { CreateDiscussionDto, CreateReplyDto } from './dto/create-discussion.dto';

/**
 * Q&A discussions (Phase 14).
 *
 *   GET    /lessons/:id/discussions          list threads + replies
 *   POST   /lessons/:id/discussions          new thread (notifies instructor)
 *   POST   /discussions/:id/replies          reply to a thread (notifies)
 *   DELETE /discussions/:id                  soft delete (owner | ADMIN+)
 *   DELETE /discussion-replies/:id           soft delete (owner | ADMIN+)
 */
@Controller()
export class DiscussionsController {
  constructor(private readonly discussions: DiscussionsService) {}

  @Get('lessons/:lessonId/discussions')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  list(@Param('lessonId') lessonId: string) {
    return this.discussions.listForLesson(lessonId);
  }

  /**
   * Phase 14 gap #6 — mention suggestions. Used by the @MentionSuggest
   * dropdown in the student discussions tab. `q` is the text after the
   * "@" character; empty string returns just the course instructor.
   */
  @Get('lessons/:lessonId/mentionable')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  mentionable(@Param('lessonId') lessonId: string, @Query('q') q?: string) {
    return this.discussions.getMentionable(lessonId, q ?? '');
  }

  @Post('lessons/:lessonId/discussions')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Body() dto: CreateDiscussionDto,
  ) {
    return this.discussions.createThread({ id: user.sub, role: user.role }, lessonId, dto);
  }

  @Post('discussions/:id/replies')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  reply(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: CreateReplyDto) {
    return this.discussions.createReply({ id: user.sub, role: user.role }, id, dto);
  }

  @Delete('discussions/:id')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  deleteThread(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.discussions.softDeleteThread({ id: user.sub, role: user.role }, id);
  }

  @Delete('discussion-replies/:id')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  deleteReply(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.discussions.softDeleteReply({ id: user.sub, role: user.role }, id);
  }
}
