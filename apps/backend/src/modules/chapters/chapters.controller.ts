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
} from '@nestjs/common';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { ChaptersService } from './chapters.service';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { ReorderDto } from './dto/reorder.dto';
import { UpdateChapterDto } from './dto/update-chapter.dto';

/**
 * Two route groups:
 *   /courses/:courseId/chapters — POST create, GET list (nested)
 *   /chapters/:id                — PATCH / DELETE / reorder (flat)
 *
 * This split matches the REST conventions listed in the Phase 08 spec and
 * keeps the URL readable when chapters are managed outside the course
 * context (e.g. in the curriculum tree).
 */
@Controller()
export class ChaptersController {
  constructor(private readonly chapters: ChaptersService) {}

  // ---------- nested under /courses/:courseId ----------
  @Get('courses/:courseId/chapters')
  listByCourse(@Param('courseId') courseId: string) {
    return this.chapters.listByCourse(courseId);
  }

  @Post('courses/:courseId/chapters')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Body() dto: CreateChapterDto,
  ) {
    return this.chapters.create({ id: user.sub, role: user.role }, courseId, dto);
  }

  // ---------- flat /chapters/:id ----------
  @Patch('chapters/:id')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateChapterDto) {
    return this.chapters.update({ id: user.sub, role: user.role }, id, dto);
  }

  @Patch('chapters/:id/reorder')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  reorder(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: ReorderDto) {
    return this.chapters.reorder({ id: user.sub, role: user.role }, id, dto.newOrder);
  }

  @Delete('chapters/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.chapters.remove({ id: user.sub, role: user.role }, id);
  }
}
