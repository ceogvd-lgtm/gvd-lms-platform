import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Body, Controller, Get, Param, Put } from '@nestjs/common';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { UpsertPracticeDto } from './dto/upsert-practice.dto';
import { PracticeContentsService } from './practice-contents.service';

@Controller('lessons/:lessonId/practice')
@Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
export class PracticeContentsController {
  constructor(private readonly practice: PracticeContentsService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload, @Param('lessonId') lessonId: string) {
    return this.practice.findByLesson({ id: user.sub, role: user.role }, lessonId);
  }

  @Put()
  upsert(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Body() dto: UpsertPracticeDto,
  ) {
    return this.practice.upsert({ id: user.sub, role: user.role }, lessonId, dto);
  }
}
