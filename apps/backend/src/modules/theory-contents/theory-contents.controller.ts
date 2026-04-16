import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Body, Controller, Get, Param, Patch, Put } from '@nestjs/common';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { SaveBodyDto, UpsertTheoryDto } from './dto/upsert-theory.dto';
import { TheoryContentsService } from './theory-contents.service';

/**
 * /lessons/:lessonId/theory — INSTRUCTOR (owner) + ADMIN+.
 *
 * The auto-save endpoint (`PATCH .../body`) carries only the editor JSON
 * so the typical 30-second tick is small (a few KB) and doesn't interfere
 * with the heavier full upsert.
 */
@Controller('lessons/:lessonId/theory')
@Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
export class TheoryContentsController {
  constructor(private readonly theory: TheoryContentsService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload, @Param('lessonId') lessonId: string) {
    return this.theory.findByLesson({ id: user.sub, role: user.role }, lessonId);
  }

  @Put()
  upsert(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Body() dto: UpsertTheoryDto,
  ) {
    return this.theory.upsert({ id: user.sub, role: user.role }, lessonId, dto);
  }

  @Patch('body')
  saveBody(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId') lessonId: string,
    @Body() dto: SaveBodyDto,
  ) {
    return this.theory.saveBody({ id: user.sub, role: user.role }, lessonId, dto);
  }
}
