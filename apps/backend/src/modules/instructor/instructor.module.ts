import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';

import { InstructorAnalyticsController } from './analytics/analytics.controller';
import { InstructorAnalyticsService } from './analytics/analytics.service';
import { InstructorDashboardController } from './dashboard/dashboard.controller';
import { InstructorDashboardService } from './dashboard/dashboard.service';

/**
 * InstructorModule bundles the two read-only-ish concerns under
 * `/instructor/*` (Phase 10):
 *
 *   1. Dashboard aggregations (KPI, weekly chart, activity, deadlines)
 *      → all scoped to `course.instructorId === actor.id`.
 *
 *   2. Student analytics (per-course progress, at-risk flagging,
 *      CSV export, "send reminder email") — also scoped per instructor.
 *
 * Both share the same role gate (INSTRUCTOR, ADMIN, SUPER_ADMIN) and
 * are unrelated to the curriculum mutation modules
 * (Courses/Chapters/Lessons live in their own modules from Phase 08).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [InstructorDashboardController, InstructorAnalyticsController],
  providers: [InstructorDashboardService, InstructorAnalyticsService],
})
export class InstructorModule {}
