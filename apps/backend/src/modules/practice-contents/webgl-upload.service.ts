import { randomUUID } from 'node:crypto';

import { Role } from '@lms/database';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';

import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ALLOWED_MIME,
  MAX_SIZE,
  STORAGE_PREFIXES,
  WEBGL_EXTRACT_QUEUE,
} from '../../common/storage/storage.constants';
import { StorageService } from '../../common/storage/storage.service';
import type { WebglExtractJob } from '../storage/webgl-extract.processor';

import { summariseWebGLZip, validateWebGLSummary } from './webgl-validator';

interface Actor {
  id: string;
  role: Role;
}

export interface WebGLUploadResult {
  /** BullMQ job id — frontend polls this for extraction progress. */
  jobId: string;
  /** Staging MinIO key for the raw zip — removed once extraction succeeds. */
  rawKey: string;
  /** What the zip's wrapper folder is named, if any (e.g. "Builds"). */
  projectName: string | null;
  /** Predicted served URL after extraction (frontend can show it early). */
  predictedUrl: string;
}

/**
 * Upload + async-extract a Unity WebGL build.
 *
 * The flow:
 *   1. Instructor POSTs a .zip to /practice-contents/:id/upload-webgl
 *   2. We peek the zip with {@link summariseWebGLZip} — if it's missing
 *      `index.html` or `*.loader.js` we throw BadRequest before touching
 *      MinIO so the UI gets a fast red state.
 *   3. We put the raw zip at `content/webgl/_raw/{lessonId}-{ts}.zip`.
 *   4. We enqueue the existing {@link WebglExtractProcessor} (Phase 06)
 *      which does the heavy lifting (download, unpack, upload each file
 *      back, verify index.html, delete raw zip).
 *   5. We pre-write the `webglUrl` onto PracticeContent optimistically —
 *      the served path is deterministic from `{lessonId}/index.html` so
 *      we can do this before the worker completes. Students who land on
 *      the lesson before extraction finishes see the iframe's 404, and
 *      the frontend polls `jobId` to decide when to render the iframe.
 */
@Injectable()
export class WebGLUploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(WEBGL_EXTRACT_QUEUE) private readonly queue: Queue<WebglExtractJob>,
  ) {}

  private async assertOwner(actor: Actor, lessonId: string): Promise<void> {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      include: { chapter: { include: { course: { select: { instructorId: true } } } } },
    });
    if (!lesson || lesson.isDeleted) throw new NotFoundException('Không tìm thấy bài giảng');
    if (actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN) return;
    if (actor.role === Role.INSTRUCTOR && actor.id === lesson.chapter.course.instructorId) return;
    throw new ForbiddenException('Bạn không có quyền với bài giảng này');
  }

  async upload(
    actor: Actor,
    lessonId: string,
    file: Express.Multer.File,
  ): Promise<WebGLUploadResult> {
    await this.assertOwner(actor, lessonId);

    if (!file?.buffer) throw new BadRequestException('Thiếu file zip');
    const allowedMimes: readonly string[] = ALLOWED_MIME.CONTENT;
    if (
      !allowedMimes.includes(file.mimetype) &&
      !file.originalname.toLowerCase().endsWith('.zip')
    ) {
      throw new BadRequestException('File upload phải là .zip Unity WebGL build');
    }
    if (file.size > MAX_SIZE.CONTENT) {
      throw new BadRequestException(
        `File vượt quá giới hạn ${Math.round(MAX_SIZE.CONTENT / 1024 / 1024)}MB`,
      );
    }

    // 1. Pre-flight validation — cheap in-memory zip peek.
    const summary = await summariseWebGLZip(file.buffer);
    const problem = validateWebGLSummary(summary);
    if (problem) {
      throw new BadRequestException(problem);
    }

    // 2. Stage the raw zip.
    const rawKey = `${STORAGE_PREFIXES.WEBGL}/_raw/${lessonId}-${Date.now()}-${randomUUID().slice(0, 8)}.zip`;
    await this.storage.upload(rawKey, file.buffer, file.size, file.mimetype || 'application/zip');

    // 3. Enqueue async extract.
    const job = await this.queue.add('extract', {
      zipKey: rawKey,
      lessonId,
      userId: actor.id,
    });

    // 4. Predict the served URL & pre-write it on PracticeContent. Keeps
    //    UI simpler — the webglUrl is stable once the job completes.
    const indexKey = `${STORAGE_PREFIXES.WEBGL}/${lessonId}/index.html`;
    const predictedUrl = await this.storage.getUrl(indexKey, 7 * 24 * 3600);

    await this.prisma.client.practiceContent.upsert({
      where: { lessonId },
      update: { webglUrl: predictedUrl },
      create: {
        lessonId,
        introduction: '',
        objectives: [] as never,
        webglUrl: predictedUrl,
        scoringConfig: { steps: [] } as never,
        safetyChecklist: { items: [] } as never,
        passScore: 70,
      },
    });

    return {
      jobId: String(job.id ?? ''),
      rawKey,
      projectName: summary.projectName,
      predictedUrl,
    };
  }

  /**
   * Poll-style status check so the frontend knows when to render the
   * WebGL iframe. We return a simple discriminated union rather than
   * leaking BullMQ's `JobState` enum so the client doesn't have to know
   * about queue internals.
   */
  async getJobStatus(jobId: string): Promise<{
    state: 'waiting' | 'active' | 'completed' | 'failed' | 'unknown';
    progress: number;
    failReason: string | null;
  }> {
    const job = await this.queue.getJob(jobId);
    if (!job) return { state: 'unknown', progress: 0, failReason: null };
    const state = (await job.getState()) as
      | 'waiting'
      | 'active'
      | 'completed'
      | 'failed'
      | 'delayed'
      | 'paused'
      | 'unknown';
    const mapped: 'waiting' | 'active' | 'completed' | 'failed' | 'unknown' =
      state === 'delayed' || state === 'paused'
        ? 'waiting'
        : state === 'unknown'
          ? 'unknown'
          : state;
    const progressRaw = job.progress;
    const progress =
      typeof progressRaw === 'number'
        ? progressRaw
        : typeof progressRaw === 'object' && progressRaw && 'percent' in progressRaw
          ? Number((progressRaw as { percent: number }).percent) || 0
          : 0;
    return {
      state: mapped,
      progress,
      failReason: job.failedReason ?? null,
    };
  }
}
