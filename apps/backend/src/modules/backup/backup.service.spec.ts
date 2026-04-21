import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CRON_QUEUE } from '../../common/queue/queue.module';
import { StorageService } from '../../common/storage/storage.service';

import { BackupService, DATABASE_BACKUP_JOB } from './backup.service';

/**
 * Unit tests cho Phase 18B — BackupService (real pg_dump).
 *
 * Scope:
 *   - triggerBackup: tạo row PENDING + enqueue job + audit log BACKUP_TRIGGERED
 *   - getBackupHistory: trả data thật từ DB với pagination + presigned URL cho SUCCESS
 *   - cleanupOldBackups: xoá file MinIO + row DB cho backup > 30 ngày
 *   - runBackupJob success path: status RUNNING → SUCCESS + audit BACKUP_CREATED
 *   - runBackupJob failure path: status FAILED + error saved
 *   - runBackupJob cleans up /tmp file regardless
 *
 * pg_dump subprocess được mock qua mocking node:child_process.
 */

// Mock node:child_process BEFORE BackupService imports it.
jest.mock('node:child_process', () => ({
  exec: jest.fn(
    (
      cmd: string,
      opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      // promisify(exec) gọi với signature (cmd, opts, cb) — vì ta set
      // mock cho cả path callback, gọi cb() null-error khi mặc định.
      process.nextTick(() => cb(null, '', ''));
    },
  ),
}));

jest.mock('node:fs/promises', () => ({
  stat: jest.fn().mockResolvedValue({ size: 1234567 }),
  readFile: jest.fn().mockResolvedValue(Buffer.from('mock-dump-content')),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe('BackupService', () => {
  let service: BackupService;

  // Mocks — keep one shared backup row so update() chain works
  const mockBackupRow = {
    id: 'backup-1',
    filename: 'backup_2026-04-21_02-00-00.sqlc',
    sizeBytes: BigInt(0),
    minioKey: 'backups/backup_2026-04-21_02-00-00.sqlc',
    status: 'PENDING' as const,
    triggerType: 'MANUAL' as const,
    triggeredBy: 'admin-1',
    error: null as string | null,
    createdAt: new Date('2026-04-21T02:00:00Z'),
    completedAt: null as Date | null,
  };

  let prisma: {
    client: {
      backup: {
        create: jest.Mock;
        update: jest.Mock;
        findUnique: jest.Mock;
        findMany: jest.Mock;
        count: jest.Mock;
        delete: jest.Mock;
      };
    };
  };
  let storage: {
    upload: jest.Mock;
    delete: jest.Mock;
    getPresignedUrl: jest.Mock;
    streamDownload: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let queue: { add: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      client: {
        backup: {
          create: jest.fn().mockResolvedValue({ ...mockBackupRow }),
          update: jest
            .fn()
            .mockImplementation(({ data }) => Promise.resolve({ ...mockBackupRow, ...data })),
          findUnique: jest.fn().mockResolvedValue({ ...mockBackupRow }),
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
          delete: jest.fn().mockResolvedValue({ ...mockBackupRow }),
        },
      },
    };
    storage = {
      upload: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      getPresignedUrl: jest.fn().mockResolvedValue('https://minio.local/presigned/url'),
      streamDownload: jest.fn(),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    config = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'DATABASE_URL') return 'postgresql://lms:lms@localhost:5433/lms';
        if (key === 'BACKUP_RETENTION_DAYS') return 30;
        return defaultValue;
      }),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: config },
        { provide: getQueueToken(CRON_QUEUE), useValue: queue },
      ],
    }).compile();

    service = mod.get(BackupService);
  });

  // =====================================================
  // triggerBackup
  // =====================================================

  describe('triggerBackup', () => {
    it('creates a PENDING row + enqueues dispatch job + writes audit', async () => {
      const row = await service.triggerBackup('admin-1', '127.0.0.1', 'MANUAL');

      expect(row).toMatchObject({ status: 'PENDING', triggeredBy: 'admin-1' });
      expect(prisma.client.backup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
            triggerType: 'MANUAL',
            triggeredBy: 'admin-1',
          }),
        }),
      );

      // Enqueued dispatch job with backupId in data — NOT a repeat job.
      const enqueueCall = queue.add.mock.calls.find(
        (c) => (c[1] as { backupId?: string }).backupId !== undefined,
      );
      expect(enqueueCall).toBeDefined();
      expect(enqueueCall?.[0]).toBe(DATABASE_BACKUP_JOB);
      expect(enqueueCall?.[1]).toMatchObject({ backupId: 'backup-1' });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BACKUP_TRIGGERED', userId: 'admin-1' }),
      );
    });

    it('filename uses local time formatted as backup_YYYY-MM-DD_HH-mm-ss.sqlc', async () => {
      await service.triggerBackup('admin-1', '127.0.0.1');
      const call = prisma.client.backup.create.mock.calls[0]![0];
      expect(call.data.filename).toMatch(/^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sqlc$/);
    });
  });

  // =====================================================
  // runBackupJob
  // =====================================================

  describe('runBackupJob', () => {
    it('SUCCESS path: RUNNING → SUCCESS + upload + size + audit BACKUP_CREATED', async () => {
      const result = await service.runBackupJob('backup-1');

      expect(result.status).toBe('SUCCESS');
      // Must update to RUNNING first, then SUCCESS
      expect(prisma.client.backup.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: 'backup-1' },
          data: { status: 'RUNNING' },
        }),
      );
      expect(prisma.client.backup.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SUCCESS', sizeBytes: BigInt(1234567) }),
        }),
      );
      expect(storage.upload).toHaveBeenCalledWith(
        mockBackupRow.minioKey,
        expect.any(Buffer),
        1234567,
        'application/octet-stream',
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'BACKUP_CREATED' }));
    });

    it('FAILED path: pg_dump throws → status FAILED + error saved + audit BACKUP_FAILED', async () => {
      // Override the exec mock to reject for this test only.
      const cp = await import('node:child_process');
      (cp.exec as unknown as jest.Mock).mockImplementationOnce(
        (_cmd: string, _opts: unknown, cb: (err: Error | null) => void) => {
          process.nextTick(() => cb(new Error('pg_dump: connection refused')));
        },
      );

      const result = await service.runBackupJob('backup-1');

      expect(result.status).toBe('FAILED');
      expect(prisma.client.backup.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            error: expect.stringContaining('pg_dump'),
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'BACKUP_FAILED' }));
    });

    it('throws NotFoundException when row not found', async () => {
      prisma.client.backup.findUnique.mockResolvedValueOnce(null);
      await expect(service.runBackupJob('missing')).rejects.toThrow(/not found/i);
    });
  });

  // =====================================================
  // getBackupHistory
  // =====================================================

  describe('getBackupHistory', () => {
    it('returns paginated rows with presigned URL only for SUCCESS', async () => {
      const rows = [
        { ...mockBackupRow, id: 'b1', status: 'SUCCESS' as const },
        { ...mockBackupRow, id: 'b2', status: 'RUNNING' as const },
        { ...mockBackupRow, id: 'b3', status: 'FAILED' as const, error: 'oops' },
      ];
      prisma.client.backup.findMany.mockResolvedValueOnce(rows);
      prisma.client.backup.count.mockResolvedValueOnce(3);

      const page = await service.getBackupHistory(1, 10);

      expect(page.total).toBe(3);
      expect(page.items).toHaveLength(3);
      expect(page.items[0]!.downloadUrl).toBe('https://minio.local/presigned/url');
      expect(page.items[1]!.downloadUrl).toBeNull(); // RUNNING
      expect(page.items[2]!.downloadUrl).toBeNull(); // FAILED
      // getPresignedUrl only called for SUCCESS rows
      expect(storage.getPresignedUrl).toHaveBeenCalledTimes(1);
    });

    it('clamps page/limit to sane bounds', async () => {
      await service.getBackupHistory(-5, 9999);
      expect(prisma.client.backup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }), // limit clamped to 50
      );
    });
  });

  // =====================================================
  // cleanupOldBackups
  // =====================================================

  describe('cleanupOldBackups', () => {
    it('deletes MinIO file + DB row for backups > 30 days; logs audit', async () => {
      const old = [
        {
          ...mockBackupRow,
          id: 'old-1',
          status: 'SUCCESS' as const,
          minioKey: 'backups/old.sqlc',
        },
        // Old but FAILED — skip MinIO delete, still drop DB row
        { ...mockBackupRow, id: 'old-2', status: 'FAILED' as const },
      ];
      prisma.client.backup.findMany.mockResolvedValueOnce(old);

      const res = await service.cleanupOldBackups('SYSTEM');

      expect(res.deleted).toBe(2);
      expect(res.errors).toBe(0);
      expect(storage.delete).toHaveBeenCalledWith('backups/old.sqlc');
      expect(storage.delete).toHaveBeenCalledTimes(1); // only SUCCESS triggers MinIO delete
      expect(prisma.client.backup.delete).toHaveBeenCalledTimes(2);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BACKUP_CLEANED',
          newValue: expect.objectContaining({ retentionDays: 30, deleted: 2 }),
        }),
      );
    });

    it('uses query cutoff = now - retentionDays', async () => {
      prisma.client.backup.findMany.mockResolvedValueOnce([]);
      await service.cleanupOldBackups();
      const whereArg = prisma.client.backup.findMany.mock.calls[0]![0]!.where;
      // Cutoff should be ~30 days ago
      const cutoff = (whereArg.createdAt as { lt: Date }).lt;
      const daysAgo = (Date.now() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
      expect(daysAgo).toBeGreaterThan(29.9);
      expect(daysAgo).toBeLessThan(30.1);
    });
  });

  // =====================================================
  // onModuleInit — cron registration
  // =====================================================

  describe('onModuleInit', () => {
    it('registers BullMQ repeat job at 02:00 daily with deduping jobId', async () => {
      await service.onModuleInit();
      const repeatCall = queue.add.mock.calls.find((c) => (c[2] as { repeat?: unknown }).repeat);
      expect(repeatCall).toBeDefined();
      expect(repeatCall?.[0]).toBe(DATABASE_BACKUP_JOB);
      expect(repeatCall?.[2]).toMatchObject({
        repeat: { pattern: '0 2 * * *' },
        jobId: 'database-backup-daily-repeat',
      });
    });

    it('does not throw when queue.add fails (Redis not ready at boot)', async () => {
      queue.add.mockRejectedValueOnce(new Error('Redis ECONNREFUSED'));
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });
});
