import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { CRON_QUEUE } from '../../common/queue/queue.module';
import { ProgressModule } from '../progress/progress.module';
import { ReportsModule } from '../reports/reports.module';
import { StorageCleanupModule } from '../storage-cleanup/storage-cleanup.module';

import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { CronProcessor } from './cron.processor';
import { ScheduledReportsService } from './scheduled-reports.service';

/**
 * Phase 15 — Admin-wide Analytics module.
 *
 * Imports:
 *   - ProgressModule → AtRiskService (reused by scheduled sweep)
 *   - ReportsModule  → ReportsService (reused for the export endpoint
 *     so we don't duplicate pdfmake/exceljs plumbing)
 *
 * Named `AnalyticsAdminModule` in app.module.ts import to disambiguate
 * from the per-instructor analytics at modules/instructor/analytics/.
 */
@Module({
  imports: [
    PrismaModule,
    ProgressModule,
    ReportsModule,
    // Phase 18 — CronProcessor dispatches storage-cleanup-weekly jobs
    // to StorageCleanupService, so pull it in here.
    StorageCleanupModule,
    BullModule.registerQueue({ name: CRON_QUEUE }),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, ScheduledReportsService, CronProcessor],
  exports: [AnalyticsService, ScheduledReportsService],
})
export class AnalyticsAdminModule {}
