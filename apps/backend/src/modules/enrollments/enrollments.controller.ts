import type { JwtPayload } from '@lms/types';
import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { EnrollmentsService } from './enrollments.service';

@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  enroll(@CurrentUser() user: JwtPayload, @Body() dto: CreateEnrollmentDto) {
    return this.enrollments.enroll({ id: user.sub, role: user.role }, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.enrollments.remove({ id: user.sub, role: user.role }, id);
  }
}
