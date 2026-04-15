import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Centralised Redis helper — every auth feature (email-verify tokens, OTPs,
 * brute-force counters, refresh-token allowlist, resend cooldowns) funnels
 * through this service so key schemas stay discoverable in one place.
 *
 * Key naming convention:
 *   auth:email-verify:{token}       → userId           TTL 24h
 *   auth:refresh:{jti}              → userId           TTL 7d
 *   auth:login:fail:{email}         → counter          TTL 15m
 *   auth:login:lock:{email}         → "1"              TTL 15m
 *   auth:2fa:otp:{userId}           → 6-digit code     TTL 10m
 *   auth:2fa:resend:{userId}        → "1"              TTL 60s
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    this.redis.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
  }

  get raw(): Redis {
    return this.redis;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }

  async incr(key: string): Promise<number> {
    return this.redis.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.redis.expire(key, ttlSeconds);
  }

  async ttl(key: string): Promise<number> {
    return this.redis.ttl(key);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
