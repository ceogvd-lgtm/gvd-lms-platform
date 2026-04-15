import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { WEBGL_EXTRACT_QUEUE } from '../storage/storage.constants';

/**
 * Global BullMQ wiring — shares the REDIS_URL used by Phase 03 Redis service.
 *
 * We only register the queue NAMES here; the actual processor classes are
 * registered in the feature modules that own them
 * (e.g. StorageModule for the WebGL extract worker).
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
  ],
  exports: [BullModule],
})
export class QueueModule {}
