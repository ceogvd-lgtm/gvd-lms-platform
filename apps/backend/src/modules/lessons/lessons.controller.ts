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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { CreateLessonDto } from './dto/create-lesson.dto';
import { ReorderLessonDto } from './dto/reorder.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { LessonsService } from './lessons.service';

@Controller()
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  // ---------- CREATE nested under chapter ----------
  @Post('chapters/:chapterId/lessons')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  createInChapter(
    @CurrentUser() user: JwtPayload,
    @Param('chapterId') chapterId: string,
    @Body() dto: Omit<CreateLessonDto, 'chapterId'>,
  ) {
    return this.lessons.createInChapter({ id: user.sub, role: user.role }, chapterId, dto);
  }

  // ---------- CREATE flat (legacy Phase 04 shape) ----------
  @Post('lessons')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateLessonDto) {
    return this.lessons.create({ id: user.sub, role: user.role }, dto);
  }

  // ---------- UPDATE ----------
  @Patch('lessons/:id')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateLessonDto) {
    return this.lessons.update({ id: user.sub, role: user.role }, id, dto);
  }

  // ---------- REORDER ----------
  @Patch('lessons/:id/reorder')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  reorder(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: ReorderLessonDto) {
    return this.lessons.reorder({ id: user.sub, role: user.role }, id, dto.newOrder);
  }

  // ---------- DELETE (soft, ADMIN+ only) ----------
  @Delete('lessons/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  softDelete(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Req() req: Request) {
    return this.lessons.softDelete({ id: user.sub, role: user.role }, id, { ip: getClientIp(req) });
  }

  // ---------- STUDENT COMPLETE (Phase 12) ----------
  @Post('lessons/:id/complete')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  complete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.lessons.completeForStudent(user.sub, id);
  }

  // ---------- STUDENT PROGRESS (Phase 12) ----------
  @Get('lessons/:id/progress')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  progress(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.lessons.getProgressForStudent(user.sub, id);
  }

  // ---------- ATTACHMENTS (Phase 12) ----------
  @Get('lessons/:id/attachments')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  listAttachments(@Param('id') id: string) {
    return this.lessons.listAttachments(id);
  }

  @Post('lessons/:id/attachments')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  createAttachment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body()
    body: { fileName: string; fileUrl: string; fileSize: number; mimeType: string },
  ) {
    return this.lessons.createAttachment({ id: user.sub, role: user.role }, id, body);
  }

  @Delete('lessons/:id/attachments/:attachmentId')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  deleteAttachment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.lessons.deleteAttachment({ id: user.sub, role: user.role }, id, attachmentId);
  }
}

function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
