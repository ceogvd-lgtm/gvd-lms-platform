import { Role } from '@lms/types';
import { Controller, Get, Query } from '@nestjs/common';

import { Roles } from '../../../common/rbac/roles.decorator';

import { DashboardService } from './dashboard.service';
import {
  ActivityFeedQueryDto,
  RegistrationsQueryDto,
  TopCoursesQueryDto,
} from './dto/dashboard-query.dto';

/**
 * /admin/dashboard/* — read-only aggregation endpoints that power the
 * Phase 09 admin dashboard home page.
 *
 * Class-level `@Roles(ADMIN, SUPER_ADMIN)` gates the whole subtree.
 * Individual methods don't need extra rule checks because nothing
 * mutates state.
 */
@Controller('admin/dashboard')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('kpi')
  getKpi() {
    return this.dashboard.getKpi();
  }

  @Get('registrations')
  getRegistrations(@Query() dto: RegistrationsQueryDto) {
    return this.dashboard.getRegistrations(dto.months ?? 12);
  }

  @Get('top-courses')
  getTopCourses(@Query() dto: TopCoursesQueryDto) {
    return this.dashboard.getTopCourses(dto.limit ?? 10);
  }

  @Get('role-distribution')
  getRoleDistribution() {
    return this.dashboard.getRoleDistribution();
  }

  @Get('activity-feed')
  getActivityFeed(@Query() dto: ActivityFeedQueryDto) {
    return this.dashboard.getActivityFeed(dto.limit ?? 20);
  }

  @Get('alerts')
  getAlerts() {
    return this.dashboard.getAlerts();
  }
}
