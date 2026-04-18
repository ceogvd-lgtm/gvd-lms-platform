import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { AtRiskService } from './at-risk.service';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

/**
 * Phase 15 — Progress Tracking module.
 *
 * Exports ProgressService + AtRiskService so sibling modules
 * (lessons, quiz-attempts, practice) can trigger
 * `calculateCourseProgress` after their own mutations without
 * pulling in the HTTP layer. `@Global` isn't used deliberately —
 * we want the dependency graph to stay explicit.
 */
@Module({
  imports: [PrismaModule, NotificationsModule, AuditModule],
  controllers: [ProgressController],
  providers: [ProgressService, AtRiskService],
  exports: [ProgressService, AtRiskService],
})
export class ProgressModule {}
