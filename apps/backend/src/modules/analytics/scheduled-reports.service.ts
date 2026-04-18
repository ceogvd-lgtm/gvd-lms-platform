import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { PrismaService } from '../../common/prisma/prisma.service';
import { CRON_QUEUE } from '../../common/queue/queue.module';
import { AtRiskService } from '../progress/at-risk.service';

/**
 * Phase 16 — scheduled report orchestrator.
 *
 * Owns two BullMQ repeatable jobs registered on module init:
 *
 *   1. `at-risk-daily`  — runs at 08:00 every day. Calls
 *      AtRiskService.runScheduledSweep which fires instructor
 *      notifications + student emails + audit log entries.
 *   2. *(reserved for Phase 17 — weekly PDF digest)*
 *
 * Subscriber list persists to `SystemSetting` key
 * `analytics.reportSubscribers` (whitelisted in Phase 09's
 * system-settings service). Moving off the in-memory Phase 15 stub
 * means the list survives backend restarts.
 */
const AT_RISK_JOB = 'at-risk-daily';
const SUBSCRIBERS_KEY = 'analytics.reportSubscribers';

@Injectable()
export class ScheduledReportsService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledReportsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AtRiskService) private readonly atRisk: AtRiskService,
    // Reuse the Phase 07 email queue rather than spinning up a separate
    // BullMQ queue just for cron — the queue itself doesn't care what
    // kind of work it dispatches. We use a distinct job name so the
    // email.processor's `process(name, handler)` can decide which path
    // to take (email vs sweep).
    @InjectQueue(CRON_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * On boot, register the repeatable job (idempotent — BullMQ dedupes
   * by `repeat.key`). We deliberately don't remove old repeats here
   * because deploys + restarts happen often and that would create a
   * gap in coverage.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        AT_RISK_JOB,
        { kind: 'at-risk-daily' },
        {
          repeat: { pattern: '0 8 * * *' }, // 08:00 daily (server TZ)
          removeOnComplete: 50,
          removeOnFail: 50,
        },
      );
      this.logger.log(`Registered BullMQ repeat job "${AT_RISK_JOB}" (08:00 daily)`);
    } catch (err) {
      // Redis may not be up during tests / cold start — fail soft.
      this.logger.warn(`Could not register repeat job: ${(err as Error).message}`);
    }
  }

  // =====================================================
  // Subscriber persistence via SystemSetting
  // =====================================================

  async addSubscriber(email: string): Promise<void> {
    const clean = email.toLowerCase().trim();
    const current = await this.getSubscribers();
    if (current.includes(clean)) return;
    await this.prisma.client.systemSetting.upsert({
      where: { key: SUBSCRIBERS_KEY },
      update: { value: [...current, clean] },
      create: {
        key: SUBSCRIBERS_KEY,
        value: [clean],
        description: 'Admin emails receiving the scheduled analytics digest',
      },
    });
    this.logger.log(`Subscribed ${clean} to scheduled reports`);
  }

  async listSubscribers(): Promise<string[]> {
    return this.getSubscribers();
  }

  async removeSubscriber(email: string): Promise<void> {
    const clean = email.toLowerCase().trim();
    const current = await this.getSubscribers();
    if (!current.includes(clean)) return;
    await this.prisma.client.systemSetting.upsert({
      where: { key: SUBSCRIBERS_KEY },
      update: { value: current.filter((e) => e !== clean) },
      create: { key: SUBSCRIBERS_KEY, value: [], description: '' },
    });
  }

  /**
   * Immediate, synchronous run of the at-risk sweep — exposed so an
   * admin can smoke-test the notification flow via the frontend's
   * "Gửi ngay" button without waiting for the cron fire.
   */
  async runAtRiskSweepNow(): Promise<{ flagged: number; notificationsSent: number }> {
    this.logger.log('Running at-risk sweep (manual trigger)');
    return this.atRisk.runScheduledSweep();
  }

  // =====================================================
  // Internals
  // =====================================================
  private async getSubscribers(): Promise<string[]> {
    const row = await this.prisma.client.systemSetting.findUnique({
      where: { key: SUBSCRIBERS_KEY },
    });
    if (!row) return [];
    const value = row.value as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string');
  }
}

/** Exposed so the email.processor can recognise the cron job name. */
export { AT_RISK_JOB };
