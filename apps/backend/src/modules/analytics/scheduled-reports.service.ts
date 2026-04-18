import { Inject, Injectable, Logger } from '@nestjs/common';

import { AtRiskService } from '../progress/at-risk.service';

/**
 * Phase 15 — scheduled report orchestrator.
 *
 * Two cron-style tasks (driven by BullMQ repeat jobs wired up in
 * `analytics.module.ts`):
 *
 * 1. **Daily 08:00** — run the at-risk sweep (delegates to AtRiskService).
 * 2. **Weekly Monday 07:00** — enqueue a weekly-progress PDF email to
 *    every subscribed admin (configured via `schedule-report` endpoint).
 *
 * Keeping the wiring thin — the heavy lifting is in AtRiskService /
 * ReportsService / EmailService — so this class stays unit-testable
 * without pulling in BullMQ/Redis.
 */
@Injectable()
export class ScheduledReportsService {
  private readonly logger = new Logger(ScheduledReportsService.name);
  // In-memory list of admin subscribers — Phase 15 ships with this in
  // memory; moving to a DB-backed SystemSetting row is a Phase 16 task
  // (see TODO in analytics.controller scheduleReport handler).
  private subscribers = new Set<string>();

  constructor(@Inject(AtRiskService) private readonly atRisk: AtRiskService) {}

  /**
   * Subscribe an admin email address to the weekly report cadence.
   * Idempotent — duplicate adds are no-ops.
   */
  addSubscriber(email: string): void {
    this.subscribers.add(email.toLowerCase().trim());
    this.logger.log(`Subscribed ${email} to weekly reports`);
  }

  listSubscribers(): string[] {
    return [...this.subscribers];
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
}
