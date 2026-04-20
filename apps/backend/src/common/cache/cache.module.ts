import { Global, Module } from '@nestjs/common';

import { CacheService } from './cache.service';

/**
 * Phase 18 — Global cache module so any feature service can inject
 * CacheService without wiring explicit imports. Depends on the Global
 * RedisModule (already registered in AppModule).
 */
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
