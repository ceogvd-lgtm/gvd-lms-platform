import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { WEBGL_EXTRACT_QUEUE } from '../storage/storage.constants';

export const EMAIL_QUEUE = 'email';

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
  ],
  exports: [BullModule],
})
export class QueueModule {}
