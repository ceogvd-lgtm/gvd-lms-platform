import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { WEBGL_EXTRACT_QUEUE } from '../storage/storage.constants';

export const EMAIL_QUEUE = 'email';
// Phase 16 — dedicated queue for scheduled / cron jobs (at-risk daily
// sweep, future weekly digests). Kept separate from EMAIL_QUEUE so the
// email processor doesn't need to branch on job name, and the cron
// schedule is easy to inspect in BullMQ dashboards.
export const CRON_QUEUE = 'cron';
// Phase 17 — Gemini batch queue lives in the AI module
// (see `modules/ai/ai.constants.GEMINI_QUEUE`). We keep it out of this
// global registration so the BullMQ `limiter` + `concurrency` config
// stays co-located with the worker that consumes it.

/**
 * Global BullMQ wiring — shares the REDIS_URL used by Phase 03 Redis service.
 *
 * We only register the queue NAMES here; the actual processor classes are
 * registered in the feature modules that own them
 * (e.g. StorageModule for the WebGL extract worker, NotificationsModule
 * for the email worker).
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        // ioredis accepts the URL form; BullMQ passes it through.
        const u = new URL(url);
        return {
          connection: {
            host: u.hostname,
            port: Number(u.port || 6379),
            password: u.password || undefined,
            db: u.pathname ? Number(u.pathname.slice(1)) || 0 : 0,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: WEBGL_EXTRACT_QUEUE }),
    BullModule.registerQueue({
      name: EMAIL_QUEUE,
      defaultJobOptions: {
        // Retry up to 3 times with exponential backoff 2^n seconds (2s, 4s, 8s).
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100 }, // keep the last 100 for debug
        removeOnFail: { count: 500 },
      },
    }),
    BullModule.registerQueue({
      name: CRON_QUEUE,
      defaultJobOptions: {
        // Cron jobs mostly don't want exponential retries — if today's
        // sweep fails, tomorrow's still fires. Keep 1 retry just in
        // case of a transient Redis blip during the sweep itself.
        attempts: 2,
        backoff: { type: 'fixed', delay: 60_000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 },
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
