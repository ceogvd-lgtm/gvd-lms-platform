import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { AI_DAILY_WARN_THRESHOLD } from './ai.constants';

/**
 * Phase 17 — AI quota tracking.
 *
 * Gemini's free tier has per-model daily quotas. We don't call the
 * Google quota endpoint (expensive, rate-limited itself) — instead
 * every outbound call increments a local counter keyed by `(UTC-date,
 * model)`. The admin /ai/health dashboard reads these rows to show
 * "X / 1500 today"; the worker code logs a warning when a single
 * bucket crosses `AI_DAILY_WARN_THRESHOLD`.
 *
 * Upsert uses the `(date, model)` unique key so concurrent calls from
 * different BullMQ workers can't double-insert.
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** "YYYY-MM-DD" in UTC — used as the first half of the composite key. */
  private static today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Increment today's counter for the given model bucket. Returns the
   * fresh total (requests) so callers can log/surface it if they want.
   *
   * Bucket names are intentionally small: "chat", "lite", "embedding".
   * We deliberately don't break down by the full model id because the
   * quota limit is per-model *family*, not per SKU.
   */
  async checkAndIncrement(
    model: 'chat' | 'lite' | 'embedding',
    tokens = 0,
  ): Promise<{ requests: number; tokens: number }> {
    const date = QuotaService.today();
    const log = await this.prisma.client.aiQuotaLog.upsert({
      where: { date_model: { date, model } },
      update: { requests: { increment: 1 }, tokens: { increment: tokens } },
      create: { date, model, requests: 1, tokens },
    });

    if (log.requests > AI_DAILY_WARN_THRESHOLD) {
      this.logger.warn(
        `AI quota warning: bucket=${model} requests=${log.requests} (threshold=${AI_DAILY_WARN_THRESHOLD})`,
      );
    }
    return { requests: log.requests, tokens: log.tokens };
  }

  /**
   * Read-only snapshot for the admin health panel. Always returns one
   * row per bucket even if the bucket has zero calls today, so the UI
   * can render three progress bars without branching on missing data.
   */
  async getTodaySnapshot(): Promise<Array<{ model: string; requests: number; tokens: number }>> {
    const date = QuotaService.today();
    const rows = await this.prisma.client.aiQuotaLog.findMany({
      where: { date },
      select: { model: true, requests: true, tokens: true },
    });
    const byModel = new Map(rows.map((r) => [r.model, r]));
    const buckets: Array<'chat' | 'lite' | 'embedding'> = ['chat', 'lite', 'embedding'];
    return buckets.map((m) => byModel.get(m) ?? { model: m, requests: 0, tokens: 0 });
  }
}
