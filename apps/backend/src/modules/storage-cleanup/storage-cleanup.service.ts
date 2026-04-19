import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CRON_QUEUE } from '../../common/queue/queue.module';
import { STORAGE_PREFIXES } from '../../common/storage/storage.constants';
import { StorageService } from '../../common/storage/storage.service';
import { extractMinioKey } from '../../common/storage/storage.utils';

/**
 * Phase 18 — Option B: weekly cron quét toàn bộ MinIO bucket, so với
 * tập URL đang dùng trong DB, xoá các key mồ côi.
 *
 * Chạy 03:00 Chủ Nhật (ít traffic). Idempotent đăng ký qua
 * BullMQ repeat. Manual trigger qua `POST /admin/storage-cleanup`.
 *
 * Safe-by-default: chỉ xoá key BẮT ĐẦU bằng 1 trong các prefix nội bộ
 * — tránh xoá nhầm object ngoài hệ thống sinh ra (VD manual upload vào
 * bucket cho test).
 */

export interface CleanupReport {
  totalScanned: number;
  usedKeys: number;
  orphanKeys: number;
  deleted: number;
  errors: number;
  durationMs: number;
  errorSamples: string[]; // tối đa 5 lỗi đầu tiên cho debug
}

export const STORAGE_CLEANUP_JOB = 'storage-cleanup-weekly';
const JOB_ID = 'storage-cleanup-weekly-repeat';

@Injectable()
export class StorageCleanupService implements OnModuleInit {
  private readonly logger = new Logger(StorageCleanupService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(AuditService) private readonly audit: AuditService,
    @InjectQueue(CRON_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Đăng ký repeatable job 03:00 Chủ Nhật hàng tuần. BullMQ dedupe theo
   * `repeat.key` nên restart không tạo duplicate. Dùng jobId riêng để
   * tiện cancel thủ công sau này nếu cần.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        STORAGE_CLEANUP_JOB,
        { kind: STORAGE_CLEANUP_JOB },
        {
          repeat: { pattern: '0 3 * * 0' }, // 03:00 every Sunday (server TZ)
          removeOnComplete: 20,
          removeOnFail: 50,
          jobId: JOB_ID,
        },
      );
      this.logger.log('Registered BullMQ repeat job "storage-cleanup-weekly" (03:00 CN)');
    } catch (err) {
      this.logger.warn(`Cannot register storage-cleanup repeat job: ${(err as Error).message}`);
    }
  }

  /**
   * Main entry. Gọi được qua:
   *   - Cron processor (CronProcessor.process dispatch theo job.name)
   *   - Endpoint POST /admin/storage-cleanup (trigger ngay)
   */
  async runCleanup(actorId = 'SYSTEM', ipAddress = 'cron'): Promise<CleanupReport> {
    const startedAt = Date.now();
    this.logger.log(`Starting storage cleanup — actor=${actorId}`);

    // 1. List toàn bộ keys dưới các prefix đã biết
    const allKeys = await this.listAllMinioKeys();

    // 2. Thu thập URL đang dùng trong DB + tách thành tập key
    const usedKeys = await this.collectUsedKeys();

    // 3. Orphan = allKeys \ usedKeys
    const orphans: string[] = [];
    for (const key of allKeys) {
      if (!usedKeys.has(key)) orphans.push(key);
    }

    // 4. Xoá từng orphan — mỗi file try/catch riêng để một lỗi không
    //    chặn những file còn lại. Log mẫu tối đa 5 error để AuditLog
    //    không quá dài.
    let deleted = 0;
    let errors = 0;
    const errorSamples: string[] = [];
    for (const key of orphans) {
      try {
        await this.storage.delete(key);
        deleted++;
      } catch (err) {
        errors++;
        if (errorSamples.length < 5) {
          errorSamples.push(`${key}: ${(err as Error).message}`);
        }
      }
    }

    const report: CleanupReport = {
      totalScanned: allKeys.length,
      usedKeys: usedKeys.size,
      orphanKeys: orphans.length,
      deleted,
      errors,
      durationMs: Date.now() - startedAt,
      errorSamples,
    };

    this.logger.log(
      `Storage cleanup done — scanned=${report.totalScanned} used=${report.usedKeys} ` +
        `orphan=${report.orphanKeys} deleted=${report.deleted} errors=${report.errors} ` +
        `duration=${report.durationMs}ms`,
    );

    // 5. Ghi AuditLog để admin có thể xem lịch sử job qua /admin/audit-log.
    //    `targetType=System` + `targetId=storage-cleanup` để group theo loại.
    await this.audit.log({
      userId: actorId,
      action: 'STORAGE_CLEANUP',
      targetType: 'System',
      targetId: 'storage-cleanup',
      ipAddress,
      newValue: {
        ...report,
        errorSamples: report.errorSamples.length > 0 ? report.errorSamples : undefined,
      },
    });

    return report;
  }

  /** Quét tất cả key dưới các prefix đã định nghĩa trong STORAGE_PREFIXES. */
  private async listAllMinioKeys(): Promise<string[]> {
    const prefixes = Object.values(STORAGE_PREFIXES);
    const results = await Promise.all(
      prefixes.map((p) =>
        this.storage.listKeys(`${p}/`).catch((err) => {
          this.logger.warn(`List keys failed for prefix "${p}/": ${(err as Error).message}`);
          return [] as string[];
        }),
      ),
    );
    const flat = results.flat();
    // Dedupe phòng trường hợp 1 key lọt nhiều prefix (không xảy ra với
    // layout hiện tại nhưng phòng thủ).
    return Array.from(new Set(flat));
  }

  /**
   * Thu thập URL đang sử dụng trong DB rồi chuyển thành tập key MinIO.
   * Lấy từ mọi bảng có chứa file reference:
   *   - User.avatar
   *   - Subject.thumbnailUrl (isDeleted=false)
   *   - Course.thumbnailUrl (isDeleted=false)
   *   - TheoryContent.contentUrl (lesson isDeleted=false)
   *   - PracticeContent.webglUrl (lesson isDeleted=false)
   *   - LessonAttachment.fileUrl (lesson isDeleted=false)
   *   - Certificate.pdfUrl (status ACTIVE)
   *
   * URL đã soft-delete KHÔNG tính vào "used" — chúng là orphan chờ dọn.
   * Nếu muốn giữ cho "khôi phục từ audit log", không chạy cleanup cho
   * tới khi business xác nhận.
   */
  private async collectUsedKeys(): Promise<Set<string>> {
    const urls: (string | null)[] = [];

    // 1. Users.avatar — tất cả users còn trong DB (user bị xoá → cascade
    //    hoặc admin.deleteUser đã xoá avatar riêng, không cần giữ).
    const users = await this.prisma.client.user.findMany({
      select: { avatar: true },
      where: { avatar: { not: null } },
    });
    for (const u of users) urls.push(u.avatar);

    // 2. Subject.thumbnailUrl — chỉ subjects còn active
    const subjects = await this.prisma.client.subject.findMany({
      where: { isDeleted: false, thumbnailUrl: { not: null } },
      select: { thumbnailUrl: true },
    });
    for (const s of subjects) urls.push(s.thumbnailUrl);

    // 3. Course.thumbnailUrl — courses còn active
    const courses = await this.prisma.client.course.findMany({
      where: { isDeleted: false, thumbnailUrl: { not: null } },
      select: { thumbnailUrl: true },
    });
    for (const c of courses) urls.push(c.thumbnailUrl);

    // 4. Lesson content URLs — chỉ lessons active
    const activeLessons = await this.prisma.client.lesson.findMany({
      where: { isDeleted: false },
      select: {
        theoryContent: { select: { contentUrl: true } },
        practiceContent: { select: { webglUrl: true } },
        attachments: { select: { fileUrl: true } },
      },
    });
    for (const l of activeLessons) {
      if (l.theoryContent?.contentUrl) urls.push(l.theoryContent.contentUrl);
      if (l.practiceContent?.webglUrl) urls.push(l.practiceContent.webglUrl);
      for (const a of l.attachments) urls.push(a.fileUrl);
    }

    // 5. Certificate.pdfUrl — tất cả certs còn ACTIVE/EXPIRED (REVOKED
    //    vẫn giữ file làm bằng chứng).
    const certs = await this.prisma.client.certificate.findMany({
      where: { pdfUrl: { not: null } },
      select: { pdfUrl: true },
    });
    for (const c of certs) urls.push(c.pdfUrl);

    // Parse URL → MinIO key (lược bỏ URL external hoặc không match prefix)
    const keys = new Set<string>();
    for (const url of urls) {
      const key = extractMinioKey(url);
      if (key) keys.add(key);
    }

    // WebGL cleanup xử lý theo prefix (thư mục). Cho 1 webgl index.html
    // trong use, coi như cả prefix `content/webgl/<id>/` đều "used" —
    // không xoá bất kỳ file nào trong đó.
    return this.expandWebglPrefixes(keys);
  }

  /**
   * Với mỗi key dạng `content/webgl/<slug>/something`, thêm TẤT CẢ key
   * cùng prefix `content/webgl/<slug>/` vào tập used. Cần thiết vì
   * WebGL upload bao gồm Builds.loader.js + Builds.data + Builds.wasm +
   * Builds.framework.js + index.html + StreamingAssets/* — chỉ 1 URL
   * được lưu (thường là index.html) nhưng các file khác vẫn đang dùng.
   */
  private async expandWebglPrefixes(keys: Set<string>): Promise<Set<string>> {
    const webglPrefixes = new Set<string>();
    for (const key of keys) {
      if (key.startsWith('content/webgl/')) {
        const parts = key.split('/');
        if (parts.length >= 3) {
          webglPrefixes.add(`${parts[0]}/${parts[1]}/${parts[2]}/`);
        }
      }
    }
    if (webglPrefixes.size === 0) return keys;

    const expanded = new Set(keys);
    for (const p of webglPrefixes) {
      try {
        const all = await this.storage.listKeys(p);
        for (const k of all) expanded.add(k);
      } catch (err) {
        this.logger.warn(`listKeys failed for webgl prefix ${p}: ${(err as Error).message}`);
      }
    }
    return expanded;
  }
}
