import { exec } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { BackupStatus, BackupTriggerType, type Backup } from '@lms/database';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CRON_QUEUE } from '../../common/queue/queue.module';
import { STORAGE_PREFIXES } from '../../common/storage/storage.constants';
import { StorageService } from '../../common/storage/storage.service';

const execAsync = promisify(exec);

/**
 * Phase 18B — Real pg_dump backup service.
 *
 * Flow (manual hoặc cron):
 *   1. triggerBackup()        → tạo row PENDING + enqueue job
 *   2. runBackupJob()         → chạy pg_dump → upload MinIO → cập nhật DB
 *   3. cleanupOldBackups()    → xoá backup > retentionDays (mặc định 30)
 *   4. restore()              → download + psql restore (SUPER_ADMIN only)
 *
 * Cron 02:00 mỗi ngày: tự trigger + cleanup cùng lúc.
 * File name: backup_YYYY-MM-DD_HH-mm-ss.sqlc (custom format — supports pg_restore).
 */
export const DATABASE_BACKUP_JOB = 'database-backup-daily';
const BACKUP_JOB_ID = 'database-backup-daily-repeat';

export interface BackupHistoryItem {
  id: string;
  filename: string;
  sizeBytes: number; // frontend xài number — serialized BigInt
  status: BackupStatus;
  triggerType: BackupTriggerType;
  triggeredBy: string;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
  downloadUrl: string | null; // presigned 1h — chỉ có khi status=SUCCESS
}

export interface BackupHistoryPage {
  items: BackupHistoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @InjectQueue(CRON_QUEUE) private readonly queue: Queue,
  ) {}

  // =====================================================
  // CRON REGISTRATION
  // =====================================================

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        DATABASE_BACKUP_JOB,
        { kind: DATABASE_BACKUP_JOB },
        {
          // 02:00 mỗi ngày (server TZ) — giờ ít traffic Việt Nam.
          repeat: { pattern: '0 2 * * *' },
          removeOnComplete: 30,
          removeOnFail: 50,
          jobId: BACKUP_JOB_ID,
        },
      );
      this.logger.log('Registered BullMQ repeat job "database-backup-daily" (02:00 daily)');
    } catch (err) {
      // Fail soft — restart app không phụ thuộc Redis sẵn sàng.
      this.logger.warn(`Cannot register backup cron: ${(err as Error).message}`);
    }
  }

  // =====================================================
  // CREATE ROW — helper dùng chung cho manual + scheduled.
  // Không enqueue — caller tự quyết định.
  // =====================================================

  private async createBackupRow(actorId: string, triggerType: BackupTriggerType): Promise<Backup> {
    const now = new Date();
    const filename = this.buildFilename(now);
    const minioKey = `${STORAGE_PREFIXES.BACKUPS}/${filename}`;

    return this.prisma.client.backup.create({
      data: {
        filename,
        minioKey,
        status: 'PENDING',
        triggerType,
        triggeredBy: actorId,
        sizeBytes: BigInt(0),
      },
    });
  }

  // =====================================================
  // TRIGGER (manual) — tạo row + enqueue dispatch job
  // Cron tick KHÔNG dùng hàm này (tránh double-fire); xem
  // CronProcessor DATABASE_BACKUP_JOB case.
  // =====================================================

  async triggerBackup(
    actorId: string,
    ipAddress: string,
    triggerType: BackupTriggerType = 'MANUAL',
  ): Promise<Backup> {
    const row = await this.createBackupRow(actorId, triggerType);

    // Enqueue one-shot dispatch job — CronProcessor đọc backupId và gọi runBackupJob.
    await this.queue.add(
      DATABASE_BACKUP_JOB,
      { kind: DATABASE_BACKUP_JOB, backupId: row.id },
      {
        removeOnComplete: 20,
        removeOnFail: 50,
      },
    );

    await this.audit.log({
      userId: actorId,
      action: 'BACKUP_TRIGGERED',
      targetType: 'Backup',
      targetId: row.id,
      ipAddress,
      newValue: { filename: row.filename, triggerType },
    });

    this.logger.log(`Backup triggered — id=${row.id} by=${actorId} type=${triggerType}`);
    return row;
  }

  /**
   * Được CronProcessor gọi trực tiếp khi cron tick fire.
   * Tạo row SCHEDULED + chạy sync trong cùng job, KHÔNG enqueue
   * thêm để tránh double-fire.
   */
  async runScheduledBackup(): Promise<Backup> {
    const row = await this.createBackupRow('SYSTEM', 'SCHEDULED');
    await this.audit.log({
      userId: 'SYSTEM',
      action: 'BACKUP_TRIGGERED',
      targetType: 'Backup',
      targetId: row.id,
      ipAddress: 'cron',
      newValue: { filename: row.filename, triggerType: 'SCHEDULED' },
    });
    return this.runBackupJob(row.id);
  }

  // =====================================================
  // JOB RUNNER — pg_dump + upload + update row
  // =====================================================

  /**
   * Chạy pg_dump cho 1 backup row. Đảm bảo mọi exit-path
   * đều có final status (SUCCESS hoặc FAILED) + cleanup /tmp file.
   *
   * Gọi từ CronProcessor (dispatcher theo job.name).
   */
  async runBackupJob(backupId: string): Promise<Backup> {
    const startedAt = Date.now();
    const row = await this.prisma.client.backup.findUnique({ where: { id: backupId } });
    if (!row) {
      this.logger.warn(`runBackupJob: row not found id=${backupId}`);
      throw new NotFoundException(`Backup ${backupId} not found`);
    }

    // Mark RUNNING
    await this.prisma.client.backup.update({
      where: { id: backupId },
      data: { status: 'RUNNING' },
    });

    const tmpPath = path.join(os.tmpdir(), row.filename);

    try {
      const dbUrl = this.requireDatabaseUrl();

      // pg_dump — custom format (-F c) supports pg_restore + selective restore.
      // --no-owner / --no-acl giúp dump import được sang DB khác (khôi phục
      // sang môi trường staging không cần cùng role owner).
      const cmd = `pg_dump "${dbUrl}" --no-owner --no-acl --format=custom -f "${tmpPath}"`;
      this.logger.log(`pg_dump starting → ${tmpPath}`);

      // pg_dump có thể chạy vài phút cho DB lớn; tăng maxBuffer để không
      // bị cắt stdout/stderr. Không dùng shell=true để tránh injection.
      await execAsync(cmd, {
        maxBuffer: 100 * 1024 * 1024, // 100 MB — đủ cho stderr của DB rất lớn
        timeout: 30 * 60 * 1000, // 30 phút hard limit
      });

      // Upload to MinIO (contentType octet-stream — client download ghi file binary).
      const stat = await fs.stat(tmpPath);
      const buffer = await fs.readFile(tmpPath);
      await this.storage.upload(row.minioKey, buffer, stat.size, 'application/octet-stream');

      // Update row — SUCCESS
      const completed = await this.prisma.client.backup.update({
        where: { id: backupId },
        data: {
          status: 'SUCCESS',
          sizeBytes: BigInt(stat.size),
          completedAt: new Date(),
        },
      });

      await this.audit.log({
        userId: row.triggeredBy,
        action: 'BACKUP_CREATED',
        targetType: 'Backup',
        targetId: backupId,
        ipAddress: row.triggerType === 'SCHEDULED' ? 'cron' : 'api',
        newValue: {
          filename: row.filename,
          sizeBytes: stat.size,
          durationMs: Date.now() - startedAt,
        },
      });

      this.logger.log(
        `Backup SUCCESS — id=${backupId} size=${(stat.size / 1024 / 1024).toFixed(2)}MB ` +
          `duration=${Date.now() - startedAt}ms`,
      );
      return completed;
    } catch (err) {
      const message = (err as Error).message ?? 'Unknown error';
      this.logger.error(`Backup FAILED — id=${backupId}: ${message}`);

      const failed = await this.prisma.client.backup.update({
        where: { id: backupId },
        data: {
          status: 'FAILED',
          error: message.slice(0, 500), // DB varchar reasonable limit
          completedAt: new Date(),
        },
      });

      await this.audit.log({
        userId: row.triggeredBy,
        action: 'BACKUP_FAILED',
        targetType: 'Backup',
        targetId: backupId,
        ipAddress: row.triggerType === 'SCHEDULED' ? 'cron' : 'api',
        newValue: { filename: row.filename, error: message.slice(0, 500) },
      });

      return failed;
    } finally {
      // Cleanup /tmp bất kể thành bại — đừng để nó đầy disk.
      await fs.unlink(tmpPath).catch(() => {
        /* ignore — không có file đồng nghĩa đã xoá hoặc pg_dump chưa tạo */
      });
    }
  }

  // =====================================================
  // HISTORY — real data với pagination + presigned URL
  // =====================================================

  async getBackupHistory(page = 1, limit = 10): Promise<BackupHistoryPage> {
    const p = Math.max(1, page | 0);
    const l = Math.min(50, Math.max(1, limit | 0));

    const [rows, total] = await Promise.all([
      this.prisma.client.backup.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * l,
        take: l,
      }),
      this.prisma.client.backup.count(),
    ]);

    // Presigned URL chỉ sinh cho row SUCCESS — tránh tốn request MinIO
    // cho row chưa có file. TTL 1h đủ cho admin click download ngay.
    const items: BackupHistoryItem[] = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        filename: r.filename,
        sizeBytes: Number(r.sizeBytes), // BigInt → number OK vì file < 2GB
        status: r.status,
        triggerType: r.triggerType,
        triggeredBy: r.triggeredBy,
        error: r.error,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        downloadUrl:
          r.status === 'SUCCESS'
            ? await this.storage.getPresignedUrl(r.minioKey, 3600).catch(() => null)
            : null,
      })),
    );

    return {
      items,
      total,
      page: p,
      limit: l,
      totalPages: Math.max(1, Math.ceil(total / l)),
    };
  }

  // =====================================================
  // RETENTION — xoá backup cũ hơn N ngày (config BACKUP_RETENTION_DAYS)
  // =====================================================

  async cleanupOldBackups(actorId = 'SYSTEM'): Promise<{ deleted: number; errors: number }> {
    const retentionDays = this.config.get<number>('BACKUP_RETENTION_DAYS', 30);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const old = await this.prisma.client.backup.findMany({
      where: { createdAt: { lt: cutoff } },
    });

    let deleted = 0;
    let errors = 0;
    for (const row of old) {
      try {
        // Xoá file MinIO trước — nếu fail, giữ row để retry.
        if (row.status === 'SUCCESS') {
          await this.storage.delete(row.minioKey).catch(() => {
            /* idempotent — key có thể đã bị xoá từ run trước */
          });
        }
        await this.prisma.client.backup.delete({ where: { id: row.id } });
        deleted++;
      } catch (err) {
        errors++;
        this.logger.warn(`cleanup: failed to delete backup ${row.id}: ${(err as Error).message}`);
      }
    }

    if (deleted > 0 || errors > 0) {
      await this.audit.log({
        userId: actorId,
        action: 'BACKUP_CLEANED',
        targetType: 'System',
        targetId: 'database-backup',
        ipAddress: actorId === 'SYSTEM' ? 'cron' : 'api',
        newValue: { retentionDays, deleted, errors, cutoff: cutoff.toISOString() },
      });
    }

    this.logger.log(
      `Backup retention — deleted=${deleted} errors=${errors} retentionDays=${retentionDays}`,
    );
    return { deleted, errors };
  }

  // =====================================================
  // RESTORE — SUPER_ADMIN only, double-confirm required by controller
  // =====================================================

  async restore(backupId: string, actorId: string, ipAddress: string): Promise<{ ok: true }> {
    const row = await this.prisma.client.backup.findUnique({ where: { id: backupId } });
    if (!row) throw new NotFoundException(`Backup ${backupId} not found`);
    if (row.status !== 'SUCCESS') {
      throw new BadRequestException(`Cannot restore backup in status ${row.status}`);
    }

    const dbUrl = this.requireDatabaseUrl();
    const tmpPath = path.join(os.tmpdir(), `restore_${randomUUID()}_${row.filename}`);

    try {
      // 1. Download file từ MinIO → /tmp
      const stream = await this.storage.streamDownload(row.minioKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      await fs.writeFile(tmpPath, Buffer.concat(chunks));

      // 2. pg_restore (custom format) — --clean drop existing objects first.
      //    --if-exists tránh error nếu object đã bị xoá (ignore missing).
      const cmd =
        `pg_restore --dbname="${dbUrl}" --clean --if-exists --no-owner --no-acl ` + `"${tmpPath}"`;
      this.logger.warn(`RESTORE starting — backup=${backupId} actor=${actorId}`);

      await execAsync(cmd, {
        maxBuffer: 100 * 1024 * 1024,
        timeout: 30 * 60 * 1000,
      });

      await this.audit.log({
        userId: actorId,
        action: 'BACKUP_RESTORED',
        targetType: 'Backup',
        targetId: backupId,
        ipAddress,
        newValue: { filename: row.filename, restoredAt: new Date().toISOString() },
      });

      this.logger.warn(`RESTORE completed — backup=${backupId}`);
      return { ok: true };
    } finally {
      await fs.unlink(tmpPath).catch(() => undefined);
    }
  }

  // =====================================================
  // Helpers
  // =====================================================

  private buildFilename(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts =
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
      `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    return `backup_${ts}.sqlc`;
  }

  private requireDatabaseUrl(): string {
    const url = this.config.get<string>('DATABASE_URL');
    if (!url) throw new BadRequestException('DATABASE_URL not configured');
    return url;
  }
}
