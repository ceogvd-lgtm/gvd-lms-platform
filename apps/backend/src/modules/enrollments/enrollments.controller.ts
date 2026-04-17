import type { JwtPayload } from '@lms/types';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

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

  /**
   * GET /enrollments/me — student-dashboard payload: every enrollment
   * the current user has, plus per-course progress % and a
   * "next lesson" id so the Tiếp tục học button has a jump target.
   * Available to any authenticated user (STUDENT + instructors/admins
   * who also happen to be enrolled in courses for their own training).
   */
  @Get('me')
  listMine(@CurrentUser() user: JwtPayload) {
    return this.enrollments.listMine(user.sub);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.enrollments.remove({ id: user.sub, role: user.role }, id);
  }
}
