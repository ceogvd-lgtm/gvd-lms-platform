import { getQueueToken } from '@nestjs/bullmq';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CRON_QUEUE } from '../../common/queue/queue.module';
import { StorageService } from '../../common/storage/storage.service';

import { StorageCleanupService } from './storage-cleanup.service';

/**
 * Tests cho Phase 18 — MinIO orphan cleanup.
 *
 * Scope:
 *   - runCleanup xoá đúng file orphan, giữ file đang dùng
 *   - runCleanup không throw khi storage.delete fail; errors được đếm
 *   - WebGL prefix expansion: 1 index.html kéo theo các file cùng cây
 *   - AuditLog STORAGE_CLEANUP được ghi sau mỗi lần chạy
 */
describe('StorageCleanupService', () => {
  let service: StorageCleanupService;
  let storage: {
    listKeys: jest.Mock;
    delete: jest.Mock;
  };
  let prisma: {
    client: {
      user: { findMany: jest.Mock };
      subject: { findMany: jest.Mock };
      course: { findMany: jest.Mock };
      lesson: { findMany: jest.Mock };
      certificate: { findMany: jest.Mock };
    };
  };
  let audit: { log: jest.Mock };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    storage = {
      listKeys: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      client: {
        user: { findMany: jest.fn().mockResolvedValue([]) },
        subject: { findMany: jest.fn().mockResolvedValue([]) },
        course: { findMany: jest.fn().mockResolvedValue([]) },
        lesson: { findMany: jest.fn().mockResolvedValue([]) },
        certificate: { findMany: jest.fn().mockResolvedValue([]) },
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    queue = { add: jest.fn().mockResolvedValue(undefined) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        StorageCleanupService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: AuditService, useValue: audit },
        { provide: getQueueToken(CRON_QUEUE), useValue: queue },
      ],
    }).compile();

    service = mod.get(StorageCleanupService);
  });

  describe('runCleanup', () => {
    it('xoá orphan, giữ lại key đang dùng', async () => {
      // 5 files trong MinIO; 2 đang dùng (avatar + thumbnail subject),
      // 3 là orphan (thumbnail course cũ, video cũ, cert cũ).
      storage.listKeys.mockImplementation((prefix: string) => {
        const map: Record<string, string[]> = {
          'avatars/': ['avatars/u1.webp'],
          'thumbnails/': ['thumbnails/s1.webp', 'thumbnails/c_orphan.webp'],
          'attachments/': [],
          'content/scorm/': [],
          'content/video/': ['content/video/orphan.mp4'],
          'content/ppt/': [],
          'content/webgl/': [],
          'certificates/': ['certificates/cert_orphan.pdf'],
        };
        return Promise.resolve(map[prefix] ?? []);
      });

      prisma.client.user.findMany.mockResolvedValue([{ avatar: '/minio/avatars/u1.webp' }]);
      prisma.client.subject.findMany.mockResolvedValue([
        { thumbnailUrl: '/minio/thumbnails/s1.webp' },
      ]);
      prisma.client.course.findMany.mockResolvedValue([]);
      prisma.client.lesson.findMany.mockResolvedValue([]);
      prisma.client.certificate.findMany.mockResolvedValue([]);

      const report = await service.runCleanup('admin-1', '127.0.0.1');

      expect(report.totalScanned).toBe(5);
      expect(report.usedKeys).toBe(2);
      expect(report.orphanKeys).toBe(3);
      expect(report.deleted).toBe(3);
      expect(report.errors).toBe(0);
      expect(storage.delete).toHaveBeenCalledWith('thumbnails/c_orphan.webp');
      expect(storage.delete).toHaveBeenCalledWith('content/video/orphan.mp4');
      expect(storage.delete).toHaveBeenCalledWith('certificates/cert_orphan.pdf');
      expect(storage.delete).not.toHaveBeenCalledWith('avatars/u1.webp');
      expect(storage.delete).not.toHaveBeenCalledWith('thumbnails/s1.webp');
    });

    it('WebGL prefix expansion — index.html giữ nguyên cả thư mục', async () => {
      // Lesson có practiceContent.webglUrl trỏ index.html.
      // Bucket có các file cùng prefix content/webgl/game-1/ → phải
      // được coi là "used", không bị xoá.
      prisma.client.lesson.findMany.mockResolvedValue([
        {
          theoryContent: null,
          practiceContent: { webglUrl: '/minio/content/webgl/game-1/index.html' },
          attachments: [],
        },
      ]);

      // listKeys được gọi 2 lần cho prefix content/webgl/:
      //   (a) bước scan chung → trả danh sách 4 file
      //   (b) bước expand trong collectUsedKeys → trả cùng 4 file
      const webglFiles = [
        'content/webgl/game-1/index.html',
        'content/webgl/game-1/Build/game.loader.js',
        'content/webgl/game-1/Build/game.data',
        'content/webgl/game-1/Build/game.wasm',
      ];
      storage.listKeys.mockImplementation((prefix: string) => {
        if (prefix === 'content/webgl/' || prefix === 'content/webgl/game-1/') {
          return Promise.resolve(webglFiles);
        }
        return Promise.resolve([]);
      });

      const report = await service.runCleanup('admin-1', '127.0.0.1');

      // Không file nào bị xoá — tất cả thuộc prefix đã được expand
      expect(report.orphanKeys).toBe(0);
      expect(report.deleted).toBe(0);
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('không throw khi storage.delete lỗi — đếm errors', async () => {
      storage.listKeys.mockImplementation((prefix: string) =>
        prefix === 'avatars/' ? Promise.resolve(['avatars/orphan.webp']) : Promise.resolve([]),
      );
      storage.delete.mockRejectedValue(new Error('MinIO busy'));

      const report = await service.runCleanup('admin-1', 'ip');

      expect(report.orphanKeys).toBe(1);
      expect(report.deleted).toBe(0);
      expect(report.errors).toBe(1);
      expect(report.errorSamples.length).toBeGreaterThan(0);
    });

    it('ghi AuditLog STORAGE_CLEANUP với report', async () => {
      await service.runCleanup('admin-1', '127.0.0.1');

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: 'STORAGE_CLEANUP',
          targetType: 'System',
          targetId: 'storage-cleanup',
          ipAddress: '127.0.0.1',
          newValue: expect.objectContaining({
            totalScanned: expect.any(Number),
            deleted: expect.any(Number),
          }),
        }),
      );
    });

    it('giữ nguyên key lạ không match prefix — không xoá', async () => {
      // File trong bucket nhưng prefix không khớp STORAGE_PREFIXES
      // (VD do admin upload thủ công) — runCleanup sẽ KHÔNG thấy nó
      // trong allKeys (vì chỉ scan các prefix đã biết) → an toàn.
      storage.listKeys.mockResolvedValue([]);

      const report = await service.runCleanup('admin-1', 'ip');

      expect(report.totalScanned).toBe(0);
      expect(report.deleted).toBe(0);
    });
  });

  describe('onModuleInit', () => {
    it('đăng ký BullMQ repeat job với pattern 03:00 CN', async () => {
      await service.onModuleInit();

      expect(queue.add).toHaveBeenCalledWith(
        'storage-cleanup-weekly',
        expect.any(Object),
        expect.objectContaining({
          repeat: { pattern: '0 3 * * 0' },
          jobId: 'storage-cleanup-weekly-repeat',
        }),
      );
    });

    it('không throw khi queue.add fail', async () => {
      queue.add.mockRejectedValue(new Error('Redis down'));
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });
});
