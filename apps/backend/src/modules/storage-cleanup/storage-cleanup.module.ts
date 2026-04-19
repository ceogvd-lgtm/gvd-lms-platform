import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { CRON_QUEUE } from '../../common/queue/queue.module';

import { StorageCleanupController } from './storage-cleanup.controller';
import { StorageCleanupService } from './storage-cleanup.service';

/**
 * Phase 18 — Storage cleanup module.
 *
 * Mount cleanup job vào CRON_QUEUE hiện có (đã dùng cho at-risk-daily).
 * Không tạo queue mới để giữ số Redis connection tối thiểu.
 *
 * Cron processor `CronProcessor` (analytics module) cần thêm case
 * `storage-cleanup-weekly` → gọi StorageCleanupService.runCleanup().
 * Để tránh circular dep, export service và processor tự inject.
 */
@Module({
  imports: [BullModule.registerQueue({ name: CRON_QUEUE })],
  controllers: [StorageCleanupController],
  providers: [StorageCleanupService],
  exports: [StorageCleanupService],
})
export class StorageCleanupModule {}
