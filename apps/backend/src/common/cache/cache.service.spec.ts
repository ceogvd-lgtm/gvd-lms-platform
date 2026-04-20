import { CacheService, CACHE_TTL } from './cache.service';

class InMemoryRedis {
  private readonly store = new Map<string, string>();
  raw: unknown;
  constructor() {
    this.raw = this.buildRawStub();
  }
  private buildRawStub() {
    return {
      scan: async (cursor: string, _mk: string, match: string, _ck: string, _count: string) => {
        const prefix = match.replace(/\*/g, '');
        const keys = [...this.store.keys()].filter((k) => k.startsWith(prefix));
        return ['0', keys];
      },
      del: async (...keys: string[]) => {
        keys.forEach((k) => this.store.delete(k));
        return keys.length;
      },
    };
  }
  async set(key: string, value: string, _ttl?: number): Promise<void> {
    this.store.set(key, value);
  }
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  size() {
    return this.store.size;
  }
}

describe('CacheService', () => {
  let redis: InMemoryRedis;
  let cache: CacheService;

  beforeEach(() => {
    redis = new InMemoryRedis();
    cache = new CacheService(redis as never);
  });

  it('get returns null for missing key', async () => {
    expect(await cache.get('ns', 'k')).toBeNull();
  });

  it('set + get roundtrips a value', async () => {
    await cache.set('departments', 'list:active', { items: 3 }, CACHE_TTL.ONE_HOUR);
    expect(await cache.get('departments', 'list:active')).toEqual({ items: 3 });
  });

  it('getOrSet: cache miss triggers factory, cache hit does not', async () => {
    const factory = jest.fn().mockResolvedValue(['x']);
    const first = await cache.getOrSet('ns', 'k', 60, factory);
    expect(first).toEqual(['x']);
    expect(factory).toHaveBeenCalledTimes(1);

    const second = await cache.getOrSet('ns', 'k', 60, factory);
    expect(second).toEqual(['x']);
    expect(factory).toHaveBeenCalledTimes(1); // not called again
  });

  it('invalidateNamespace clears only matching keys', async () => {
    await cache.set('a', 'x', 'A1', 60);
    await cache.set('a', 'y', 'A2', 60);
    await cache.set('b', 'x', 'B1', 60);

    const deleted = await cache.invalidateNamespace('a');
    expect(deleted).toBe(2);
    expect(await cache.get('a', 'x')).toBeNull();
    expect(await cache.get('a', 'y')).toBeNull();
    expect(await cache.get('b', 'x')).toBe('B1');
  });

  it('tolerates factory error — does not cache failures', async () => {
    const err = new Error('boom');
    const factory = jest.fn().mockRejectedValue(err);
    await expect(cache.getOrSet('ns', 'k', 60, factory)).rejects.toThrow('boom');

    // Next call should try again (no poisoned cache entry)
    const ok = jest.fn().mockResolvedValue('fine');
    const res = await cache.getOrSet('ns', 'k', 60, ok);
    expect(res).toBe('fine');
  });
});
