import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { GEMINI_QUEUE } from './ai.constants';

/**
 * Registers the two repeatable cron jobs on the GEMINI_QUEUE when the
 * module boots. We use repeat patterns (cron syntax) so BullMQ
 * schedules the next run automatically — restarting the backend
 * doesn't skip a day.
 *
 * Cadence:
 *   - `recommendations-daily` at 01:00 every day
 *   - `weekly-report` at 08:00 every Monday
 *
 * If the worker process is offline when a schedule fires BullMQ
 * stashes the job and we pick it up on the next boot. Idempotent
 * generation (unique sessionId / recommendation content) is the
 * responsibility of the services, not the scheduler.
 */
@Injectable()
export class AiScheduler implements OnModuleInit {
  private readonly logger = new Logger(AiScheduler.name);

  constructor(@InjectQueue(GEMINI_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    // Clear any stale repeatable jobs from previous boots with different
    // patterns — BullMQ won't deduplicate across pattern changes.
    const repeatables = await this.queue.getRepeatableJobs().catch(() => []);
    for (const r of repeatables) {
      if (r.name === 'recommendations-daily' || r.name === 'weekly-report') {
        await this.queue.removeRepeatableByKey(r.key).catch(() => undefined);
      }
    }

    await this.queue.add(
      'recommendations-daily',
      {},
      {
        repeat: { pattern: '0 1 * * *' },
        jobId: 'ai-recommendations-daily',
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    await this.queue.add(
      'weekly-report',
      {},
      {
        repeat: { pattern: '0 8 * * 1' },
        jobId: 'ai-weekly-report',
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    this.logger.log('Gemini cron schedules registered (daily 01:00 + Monday 08:00)');
  }
}
