import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { CRON_QUEUE } from '../../common/queue/queue.module';
import { BackupService, DATABASE_BACKUP_JOB } from '../backup/backup.service';
import { AUTO_ENROLL_JOB } from '../enrollments/enrollment-scheduler.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
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
    // Phase 18 — auto-enroll-daily cron dispatch
    private readonly enrollments: EnrollmentsService,
    // Phase 18B — database-backup-daily cron dispatch
    private readonly backup: BackupService,
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
      case AUTO_ENROLL_JOB: {
        // Phase 18 — 06:00 daily: auto-enroll student mới vào course
        // PUBLISHED cùng department. Idempotent (skipDuplicates).
        const res = await this.enrollments.autoEnrollAllPublished();
        this.logger.log(
          `${AUTO_ENROLL_JOB} done — courses=${res.courses} enrolled=${res.totalEnrolled} skipped=${res.totalSkipped}`,
        );
        return { ok: true, result: res };
      }
      case DATABASE_BACKUP_JOB: {
        // Phase 18B — 02:00 daily. 2 dạng job:
        //   (a) Cron tick (data.backupId undefined)
        //       → runScheduledBackup() tạo row SCHEDULED + run sync + cleanup
        //   (b) Manual trigger (data.backupId present)
        //       → runBackupJob(id) — row đã tồn tại do triggerBackup tạo
        const backupId = (job.data as { backupId?: string }).backupId;
        if (backupId) {
          const res = await this.backup.runBackupJob(backupId);
          this.logger.log(
            `${DATABASE_BACKUP_JOB} (manual) done — id=${res.id} status=${res.status}`,
          );
          return { ok: true, result: { id: res.id, status: res.status } };
        }
        // Cron tick
        const completed = await this.backup.runScheduledBackup();
        const retention = await this.backup.cleanupOldBackups('SYSTEM');
        this.logger.log(
          `${DATABASE_BACKUP_JOB} (cron) done — id=${completed.id} status=${completed.status} ` +
            `retention deleted=${retention.deleted} errors=${retention.errors}`,
        );
        return {
          ok: true,
          result: { id: completed.id, status: completed.status, retention },
        };
      }
      default:
        this.logger.warn(`Unknown cron job name: ${job.name}`);
        return { ok: true, result: { skipped: true } };
    }
  }
}
