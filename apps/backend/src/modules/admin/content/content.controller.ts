import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Body, Controller, Delete, Get, Param, Patch, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Roles } from '../../../common/rbac/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

import { ContentService } from './content.service';
import { ListContentCoursesDto, ListContentLessonsDto } from './dto/list-content.dto';
import { RejectContentDto } from './dto/reject-content.dto';

/**
 * /admin/content/* — moderation endpoints. ADMIN+ only (class-level @Roles).
 *
 * Delegates all mutations to CoursesService / LessonsService so the
 * existing FSM + soft-delete + audit behaviour stays consistent. Adds
 * `CONTENT_*` audit actions on top for moderation-specific filtering.
 */
@Controller('admin/content')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class ContentController {
  constructor(private readonly content: ContentService) {}

  // ---------- COURSES ----------
  @Get('courses')
  listCourses(@CurrentUser() user: JwtPayload, @Query() dto: ListContentCoursesDto) {
    return this.content.listCourses({ id: user.sub, role: user.role }, dto);
  }

  @Get('courses/:id/impact')
  getImpact(@Param('id') id: string) {
    return this.content.getCourseImpact(id);
  }

  @Patch('courses/:id/approve')
  approve(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Req() req: Request) {
    return this.content.approveCourse({ id: user.sub, role: user.role }, id, {
      ip: getClientIp(req),
    });
  }

  @Patch('courses/:id/reject')
  reject(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RejectContentDto,
    @Req() req: Request,
  ) {
    return this.content.rejectCourse({ id: user.sub, role: user.role }, id, dto, {
      ip: getClientIp(req),
    });
  }

  @Delete('courses/:id')
  deleteCourse(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Req() req: Request) {
    return this.content.deleteCourse({ id: user.sub, role: user.role }, id, {
      ip: getClientIp(req),
    });
  }

  // ---------- LESSONS ----------
  @Get('lessons')
  listLessons(@Query() dto: ListContentLessonsDto) {
    return this.content.listLessons(dto);
  }

  @Patch('lessons/:id/flag')
  flagLesson(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RejectContentDto,
    @Req() req: Request,
  ) {
    return this.content.flagLesson({ id: user.sub, role: user.role }, id, dto.reason, {
      ip: getClientIp(req),
    });
  }

  @Delete('lessons/:id')
  deleteLesson(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Req() req: Request) {
    return this.content.deleteLesson({ id: user.sub, role: user.role }, id, {
      ip: getClientIp(req),
    });
  }
}

function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
