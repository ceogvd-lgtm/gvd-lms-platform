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
} from '@nestjs/common';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { CreateQuestionDto } from './dto/create-question.dto';
import { ImportQuestionsDto } from './dto/import-questions.dto';
import { ListQuestionsDto } from './dto/list-questions.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QuestionsService } from './questions.service';

/**
 * Question Bank endpoints (Phase 11).
 *
 * All endpoints require INSTRUCTOR+; per-row ownership (createdBy === actor.id)
 * is enforced in the service so `ADMIN+` can manage any question, while
 * `INSTRUCTOR` is restricted to their own bank.
 */
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  // ---------- LIST ----------
  @Get()
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  list(@CurrentUser() user: JwtPayload, @Query() query: ListQuestionsDto) {
    return this.questions.list({ id: user.sub, role: user.role }, query);
  }

  // ---------- TAGS autocomplete ----------
  @Get('tags')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  tags(@CurrentUser() user: JwtPayload, @Query('q') q?: string, @Query('limit') rawLimit?: string) {
    const parsed = rawLimit ? Number(rawLimit) : NaN;
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(200, parsed) : 50;
    return this.questions.listTags({ id: user.sub, role: user.role }, q, limit);
  }

  // ---------- EXPORT (returns JSON rows, frontend converts to xlsx) ----------
  @Get('export')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  export(@CurrentUser() user: JwtPayload, @Query() query: ListQuestionsDto) {
    return this.questions.exportAll({ id: user.sub, role: user.role }, query);
  }

  // ---------- CREATE ----------
  @Post()
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateQuestionDto) {
    return this.questions.create({ id: user.sub, role: user.role }, dto);
  }

  // ---------- IMPORT (bulk) ----------
  @Post('import')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  import(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ImportQuestionsDto,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.questions.importBulk({ id: user.sub, role: user.role }, dto, {
      dryRun: dryRun === 'true' || dryRun === '1',
    });
  }

  // ---------- READ one ----------
  @Get(':id')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.questions.findOne({ id: user.sub, role: user.role }, id);
  }

  // ---------- UPDATE ----------
  @Patch(':id')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.questions.update({ id: user.sub, role: user.role }, id, dto);
  }

  // ---------- DELETE ----------
  @Delete(':id')
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.questions.remove({ id: user.sub, role: user.role }, id);
  }
}
