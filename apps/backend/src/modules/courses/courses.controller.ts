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

import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { ListCoursesDto } from './dto/list-courses.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query() dto: ListCoursesDto) {
    return this.courses.list({ id: user.sub, role: user.role }, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.courses.findOne({ id: user.sub, role: user.role }, id);
  }

  @Get(':id/students')
  listStudents(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.courses.listStudents({ id: user.sub, role: user.role }, id);
  }

  @Post()
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCourseDto) {
    return this.courses.create({ id: user.sub, role: user.role }, dto);
  }

  @Patch(':id')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.courses.update({ id: user.sub, role: user.role }, id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @Req() req: Request,
  ) {
    return this.courses.updateStatus({ id: user.sub, role: user.role }, id, dto, {
      ip: getClientIp(req),
    });
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Req() req: Request) {
    return this.courses.softDelete({ id: user.sub, role: user.role }, id, { ip: getClientIp(req) });
  }
}

function getClientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
