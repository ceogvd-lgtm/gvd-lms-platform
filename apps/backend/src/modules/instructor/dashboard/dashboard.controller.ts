import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { Controller, Get, Query } from '@nestjs/common';

import { Roles } from '../../../common/rbac/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

import { InstructorDashboardService } from './dashboard.service';
import {
  ActivityQueryDto,
  DeadlinesQueryDto,
  WeeklyProgressQueryDto,
} from './dto/dashboard-query.dto';

@Controller('instructor/dashboard')
@Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
export class InstructorDashboardController {
  constructor(private readonly dashboard: InstructorDashboardService) {}

  @Get('stats')
  getStats(@CurrentUser() user: JwtPayload) {
    return this.dashboard.getStats({ id: user.sub });
  }

  @Get('weekly-progress')
  getWeeklyProgress(@CurrentUser() user: JwtPayload, @Query() dto: WeeklyProgressQueryDto) {
    return this.dashboard.getWeeklyProgress({ id: user.sub }, dto.weeks ?? 8);
  }

  @Get('activity')
  getActivity(@CurrentUser() user: JwtPayload, @Query() dto: ActivityQueryDto) {
    return this.dashboard.getActivity({ id: user.sub }, dto.limit ?? 15);
  }

  @Get('deadlines')
  getDeadlines(@CurrentUser() user: JwtPayload, @Query() dto: DeadlinesQueryDto) {
    return this.dashboard.getDeadlines({ id: user.sub }, dto.days ?? 7);
  }
}
