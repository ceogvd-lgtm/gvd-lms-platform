import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from './common/prisma/prisma.service';
import { RedisService } from './common/redis/redis.service';
import { StorageService } from './common/storage/storage.service';

export type ServiceStatus = 'ok' | 'error' | 'quota_warning';
export type OverallStatus = 'ok' | 'degraded' | 'down';

export interface HealthReport {
  status: OverallStatus;
  version: string;
  uptime: number;
  timestamp: string;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    minio: ServiceStatus;
    chromadb: ServiceStatus;
    gemini: ServiceStatus;
  };
  metrics: {
    dbResponseMs: number;
    redisResponseMs: number;
    pendingJobs: number;
  };
}

/**
 * Phase 18 — expanded /api/v1/health endpoint.
 *
 * Returns status per external dependency so ops can tell at a glance
 * whether a 5xx was caused by the app itself or by a downstream.
 *
 * All probes are bounded by a timeout so a hung dependency can't block
 * the liveness check — any single service that doesn't answer in
 * PROBE_TIMEOUT_MS is reported as `error` and the overall status
 * degrades to `degraded`.
 *
 * `version` comes from `APP_VERSION` env (set by the Dockerfile from the
 * git tag) or falls back to `"dev"`.
 */
const PROBE_TIMEOUT_MS = 2_000;

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly storage?: StorageService,
  ) {}

  /** Minimal backward-compatible shape. Still used by simple monitors. */
  getHealth() {
    return {
      status: 'ok',
      service: 'lms-backend',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Detailed health report. Runs all probes in parallel and aggregates.
   * An overall status of `down` is reserved for the case where the app
   * itself is broken (DB is hard-down + Redis is hard-down). A single
   * failed dependency → `degraded` so load balancers can still send
   * traffic while ops investigates.
   */
  async getDetailedHealth(): Promise<HealthReport> {
    const timestamp = new Date().toISOString();
    const version = this.config.get<string>('APP_VERSION') ?? 'dev';
    const uptime = Math.round(process.uptime());

    const [db, redis, minio, chromadb, gemini] = await Promise.all([
      this.probeDatabase(),
      this.probeRedis(),
      this.probeMinio(),
      this.probeChroma(),
      this.probeGemini(),
    ]);

    const services = {
      database: db.status,
      redis: redis.status,
      minio: minio.status,
      chromadb: chromadb.status,
      gemini: gemini.status,
    };

    // Load-balancer policy: DB down is unrecoverable → down. One or more
    // peripherals degraded → degraded. Everything green → ok.
    const dbDown = services.database === 'error';
    const anyError = Object.values(services).some((s) => s === 'error');
    const anyWarn = Object.values(services).some((s) => s === 'quota_warning');
    const status: OverallStatus = dbDown ? 'down' : anyError || anyWarn ? 'degraded' : 'ok';

    const pendingJobs = await this.probePendingJobs();

    return {
      status,
      version,
      uptime,
      timestamp,
      services,
      metrics: {
        dbResponseMs: db.ms,
        redisResponseMs: redis.ms,
        pendingJobs,
      },
    };
  }

  // =====================================================
  // Probes — each returns {status, ms} so the controller can
  // slot both into the detailed response.
  // =====================================================

  private async probeDatabase(): Promise<{ status: ServiceStatus; ms: number }> {
    if (!this.prisma) return { status: 'error', ms: 0 };
    const t0 = Date.now();
    try {
      await this.withTimeout(this.prisma.client.$queryRaw`SELECT 1`);
      return { status: 'ok', ms: Date.now() - t0 };
    } catch (err) {
      this.logger.warn(`health.db probe failed: ${(err as Error).message}`);
      return { status: 'error', ms: Date.now() - t0 };
    }
  }

  private async probeRedis(): Promise<{ status: ServiceStatus; ms: number }> {
    if (!this.redis) return { status: 'error', ms: 0 };
    const t0 = Date.now();
    try {
      await this.withTimeout(this.redis.raw.ping());
      return { status: 'ok', ms: Date.now() - t0 };
    } catch (err) {
      this.logger.warn(`health.redis probe failed: ${(err as Error).message}`);
      return { status: 'error', ms: Date.now() - t0 };
    }
  }

  private async probeMinio(): Promise<{ status: ServiceStatus; ms: number }> {
    if (!this.storage) return { status: 'error', ms: 0 };
    const t0 = Date.now();
    try {
      await this.withTimeout(this.storage.bucketExists());
      return { status: 'ok', ms: Date.now() - t0 };
    } catch (err) {
      this.logger.warn(`health.minio probe failed: ${(err as Error).message}`);
      return { status: 'error', ms: Date.now() - t0 };
    }
  }

  private async probeChroma(): Promise<{ status: ServiceStatus; ms: number }> {
    const host = this.config.get<string>('CHROMA_HOST') ?? 'localhost';
    const port = Number(this.config.get<string>('CHROMA_PORT') ?? 8000);
    const t0 = Date.now();
    try {
      // Chroma v2 heartbeat — keep the probe dependency-free so we
      // don't pull in the full chromadb client for /health.
      await this.withTimeout(
        (async () => {
          const res = await fetch(`http://${host}:${port}/api/v2/heartbeat`);
          if (!res.ok) throw new Error(`heartbeat HTTP ${res.status}`);
        })(),
      );
      return { status: 'ok', ms: Date.now() - t0 };
    } catch (err) {
      this.logger.warn(`health.chroma probe failed: ${(err as Error).message}`);
      return { status: 'error', ms: Date.now() - t0 };
    }
  }

  private async probeGemini(): Promise<{ status: ServiceStatus; ms: number }> {
    const key = this.config.get<string>('GEMINI_API_KEY');
    if (!key || key.length < 10) return { status: 'error', ms: 0 };

    // Avoid hitting Gemini on every /health call (would burn quota).
    // We only check the key is configured and the quota row hasn't
    // crossed the warning threshold.
    if (!this.prisma) return { status: 'ok', ms: 0 };
    const t0 = Date.now();
    try {
      const date = new Date().toISOString().slice(0, 10);
      const row = await this.withTimeout(
        this.prisma.client.aiQuotaLog.findUnique({
          where: { date_model: { date, model: 'chat' } },
          select: { requests: true },
        }),
      );
      const used = row?.requests ?? 0;
      const WARN = 1400;
      return { status: used >= WARN ? 'quota_warning' : 'ok', ms: Date.now() - t0 };
    } catch {
      return { status: 'ok', ms: Date.now() - t0 };
    }
  }

  private async probePendingJobs(): Promise<number> {
    if (!this.redis) return 0;
    try {
      // BullMQ keys follow `bull:<queue>:waiting` pattern. Sum counts
      // across the queues we register in common/queue.module.
      const client = this.redis.raw;
      const queues = ['email', 'webgl-extract', 'gemini-tasks', 'cron'];
      let total = 0;
      for (const q of queues) {
        const waitingKey = `bull:${q}:waiting`;
        const n = await client.llen(waitingKey).catch(() => 0);
        total += n;
      }
      return total;
    } catch {
      return 0;
    }
  }

  private withTimeout<T>(p: Promise<T>, ms = PROBE_TIMEOUT_MS): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`probe timed out after ${ms}ms`)), ms),
      ),
    ]);
  }
}
