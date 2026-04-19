import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { CRON_QUEUE } from '../../common/queue/queue.module';
import { AtRiskService } from '../progress/at-risk.service';
import {
  STORAGE_CLEANUP_JOB,
  StorageCleanupService,
} from '../storage-cleanup/storage-cleanup.service';

/**
 * Phase 16 — BullMQ worker for the CRON_QUEUE.
 *
 * Job dispatcher keyed by `job.name`:
 *   - `at-risk-daily`            → AtRiskService.runScheduledSweep (Phase 15)
 *   - `storage-cleanup-weekly`   → StorageCleanupService.runCleanup (Phase 18)
 *
 * Future names (weekly-digest, cert-expiry-reminder, etc.) branch
 * here too. Keeping a single worker class means BullMQ only holds
 * one Redis connection for cron work.
 */
@Injectable()
@Processor(CRON_QUEUE)
export class CronProcessor extends WorkerHost {
  private readonly logger = new Logger(CronProcessor.name);

  constructor(
    private readonly atRisk: AtRiskService,
    private readonly storageCleanup: StorageCleanupService,
  ) {
    super();
  }

  async process(job: Job): Promise<{ ok: true; result: unknown }> {
    this.logger.log(`Cron job fired: name=${job.name} id=${job.id}`);
    switch (job.name) {
      case 'at-risk-daily': {
        const res = await this.atRisk.runScheduledSweep();
        this.logger.log(
          `at-risk-daily done — flagged=${res.flagged} notificationsSent=${res.notificationsSent}`,
        );
        return { ok: true, result: res };
      }
      case STORAGE_CLEANUP_JOB: {
        const res = await this.storageCleanup.runCleanup('SYSTEM', 'cron');
        this.logger.log(
          `${STORAGE_CLEANUP_JOB} done — orphan=${res.orphanKeys} deleted=${res.deleted} errors=${res.errors}`,
        );
        return { ok: true, result: res };
      }
      default:
        this.logger.warn(`Unknown cron job name: ${job.name}`);
        return { ok: true, result: { skipped: true } };
    }
  }
}
