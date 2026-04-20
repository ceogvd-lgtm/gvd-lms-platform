import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { CRON_QUEUE } from '../../common/queue/queue.module';

/**
 * Phase 18 — Đăng ký repeatable cron job `auto-enroll-daily`.
 *
 * Chạy 06:00 AM mỗi ngày: tìm mọi course PUBLISHED và ghi danh student
 * cùng department chưa được enroll. Đây là lưới an toàn cho các case:
 *   - Student mới gia nhập phòng ban sau khi course đã PUBLISHED
 *   - Hook APPROVE fail (Redis down) → cron sáng hôm sau pick up lại
 *   - Admin gán department cho student hiện có sau khi course
 *     đã được duyệt từ lâu
 *
 * Dedupe theo `jobId` — restart backend không tạo duplicate job.
 * CronProcessor (analytics module) dispatch case 'auto-enroll-daily'
 * → EnrollmentsService.autoEnrollAllPublished().
 */
export const AUTO_ENROLL_JOB = 'auto-enroll-daily';
const JOB_ID = 'auto-enroll-daily-repeat';

@Injectable()
export class EnrollmentSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(EnrollmentSchedulerService.name);

  constructor(@InjectQueue(CRON_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        AUTO_ENROLL_JOB,
        { kind: AUTO_ENROLL_JOB },
        {
          repeat: { pattern: '0 6 * * *' }, // 06:00 every day (server TZ)
          removeOnComplete: 30,
          removeOnFail: 50,
          jobId: JOB_ID,
        },
      );
      this.logger.log('Registered BullMQ repeat job "auto-enroll-daily" (06:00 daily)');
    } catch (err) {
      // Redis may not be up during tests / cold start — fail soft.
      this.logger.warn(`Cannot register auto-enroll repeat job: ${(err as Error).message}`);
    }
  }
}
