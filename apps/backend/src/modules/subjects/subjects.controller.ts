import { Role } from '@lms/types';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { Roles } from '../../common/rbac/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';

import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SubjectsService } from './subjects.service';

@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Public()
  @Get()
  list(@Query('departmentId') departmentId?: string) {
    return this.subjects.list(departmentId);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subjects.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  create(@Body() dto: CreateSubjectDto) {
    return this.subjects.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateSubjectDto) {
    return this.subjects.update(id, dto);
  }
}
