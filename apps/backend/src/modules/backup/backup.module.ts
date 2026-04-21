import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { CRON_QUEUE } from '../../common/queue/queue.module';

import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

/**
 * Phase 18B — Database backup module.
 *
 * Mounts vào CRON_QUEUE hiện có — CronProcessor (analytics module)
 * dispatch theo job.name. Export service để processor inject.
 */
@Module({
  imports: [BullModule.registerQueue({ name: CRON_QUEUE })],
  controllers: [BackupController],
  providers: [BackupService],
  exports: [BackupService],
})
export class BackupModule {}
