import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import {
  Body,
  Controller,
  Delete,
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
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { LessonsService } from './lessons.service';

@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  // ---------- CREATE ----------
  @Post()
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateLessonDto) {
    return this.lessons.create({ id: user.sub, role: user.role }, dto);
  }

  // ---------- UPDATE ----------
  @Patch(':id')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateLessonDto) {
    return this.lessons.update({ id: user.sub, role: user.role }, id, dto);
  }

  // ---------- DELETE (soft) ----------
  // LAW: INSTRUCTOR *cannot* delete lessons — route-level @Roles blocks them
  // before the handler ever runs. The service layer double-checks.
  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  softDelete(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Req() req: Request) {
    return this.lessons.softDelete({ id: user.sub, role: user.role }, id, { ip: getClientIp(req) });
  }
}

function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
