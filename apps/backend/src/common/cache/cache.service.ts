import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';

/**
 * Phase 18 — thin caching facade on top of RedisService.
 *
 * Scope is intentionally narrow: public list endpoints that are
 * expensive to compute and change infrequently (departments, subjects,
 * published courses, AI suggestions). Never cache per-user data here —
 * the key schema has no user-id segment and cache invalidation is
 * coarse-grained.
 *
 * Key schema: `cache:<namespace>:<identifier>`
 *   cache:courses:list:published:page=1&limit=20
 *   cache:departments:list:active
 *   cache:subjects:list:dept=abc
 *   cache:ai:suggestions:lesson-1
 *
 * Invalidation is by namespace prefix — `invalidateNamespace('courses')`
 * drops everything under `cache:courses:*`. Uses SCAN (not KEYS) so
 * production Redis isn't blocked on a busy bucket.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly prefix = 'cache:';

  constructor(private readonly redis: RedisService) {}

  private key(namespace: string, id: string): string {
    return `${this.prefix}${namespace}:${id}`;
  }

  async get<T>(namespace: string, id: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(this.key(namespace, id));
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(`cache.get(${namespace}:${id}) failed: ${(err as Error).message}`);
      return null;
    }
  }

  async set<T>(namespace: string, id: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(this.key(namespace, id), JSON.stringify(value), ttlSeconds);
    } catch (err) {
      this.logger.warn(`cache.set(${namespace}:${id}) failed: ${(err as Error).message}`);
    }
  }

  /**
   * Read-through helper: return cached value if present, else call
   * `factory`, cache the result, and return it. `factory` errors pass
   * through — we don't cache failures.
   */
  async getOrSet<T>(
    namespace: string,
    id: string,
    ttlSeconds: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const hit = await this.get<T>(namespace, id);
    if (hit !== null) return hit;
    const fresh = await factory();
    await this.set(namespace, id, fresh, ttlSeconds);
    return fresh;
  }

  /**
   * Drop every key matching `cache:<namespace>:*`. Safe to call from
   * write paths — uses SCAN to avoid O(N) blocking on `KEYS`.
   */
  async invalidateNamespace(namespace: string): Promise<number> {
    let deleted = 0;
    try {
      const client = this.redis.raw;
      const match = `${this.prefix}${namespace}:*`;
      let cursor = '0';
      do {
        const [next, keys] = await client.scan(cursor, 'MATCH', match, 'COUNT', 100);
        cursor = next;
        if (keys.length > 0) {
          deleted += keys.length;
          await client.del(...keys);
        }
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(`cache.invalidateNamespace(${namespace}) failed: ${(err as Error).message}`);
    }
    return deleted;
  }
}

// TTL constants used by consumer services — centralised so we don't
// end up with magic numbers scattered across modules.
export const CACHE_TTL = {
  FIVE_MINUTES: 5 * 60,
  ONE_HOUR: 60 * 60,
  ONE_DAY: 24 * 60 * 60,
} as const;
