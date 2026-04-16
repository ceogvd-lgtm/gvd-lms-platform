import { Module } from '@nestjs/common';

import { CoursesModule } from '../courses/courses.module';
import { LessonsModule } from '../lessons/lessons.module';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ContentController } from './content/content.controller';
import { ContentService } from './content/content.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';

/**
 * AdminModule bundles three related concerns under /admin/*:
 *
 *   1. Core admin actions   (users, create-admin, audit-log)
 *      → AdminController / AdminService (Phase 04)
 *
 *   2. Dashboard aggregations  (KPI, charts, activity feed, alerts)
 *      → DashboardController / DashboardService (Phase 09)
 *
 *   3. Content moderation      (course approve/reject/delete, lesson flag)
 *      → ContentController / ContentService (Phase 09)
 *
 * All three mount under the class-level @Roles(ADMIN, SUPER_ADMIN) guard
 * in their respective controllers. Content delegates mutations to
 * CoursesService + LessonsService (from CoursesModule / LessonsModule)
 * so FSM + audit stay consistent.
 */
@Module({
  imports: [CoursesModule, LessonsModule],
  controllers: [AdminController, DashboardController, ContentController],
  providers: [AdminService, DashboardService, ContentService],
})
export class AdminModule {}
