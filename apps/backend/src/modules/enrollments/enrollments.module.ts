import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { CRON_QUEUE } from '../../common/queue/queue.module';

import { EnrollmentSchedulerService } from './enrollment-scheduler.service';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';

@Module({
  // Phase 18 — AuditModule cho log auto-enroll actions.
  // BullModule.registerQueue idempotent — CronProcessor ở AnalyticsModule
  // đã register CRON_QUEUE rồi, ở đây chỉ cần access để add repeatable job.
  imports: [AuditModule, BullModule.registerQueue({ name: CRON_QUEUE })],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, EnrollmentSchedulerService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
