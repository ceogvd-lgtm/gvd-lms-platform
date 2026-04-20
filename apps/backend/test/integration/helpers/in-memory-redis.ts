/**
 * In-memory stand-in for RedisService — used across integration specs.
 * Supports TTL by storing `expiresAt` timestamp, lazily evicting on read.
 */
export class InMemoryRedis {
  private readonly store = new Map<string, { value: string; expiresAt?: number }>();

  get raw(): never {
    throw new Error('raw ioredis client is not available in integration tests');
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async incr(key: string): Promise<number> {
    const current = Number((await this.get(key)) ?? '0');
    const next = current + 1;
    const entry = this.store.get(key);
    this.store.set(key, { value: String(next), expiresAt: entry?.expiresAt });
    return next;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.store.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || !entry.expiresAt) return -1;
    return Math.ceil((entry.expiresAt - Date.now()) / 1000);
  }

  reset(): void {
    this.store.clear();
  }

  async onModuleDestroy(): Promise<void> {
    this.store.clear();
  }
}
