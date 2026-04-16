import { Readable } from 'node:stream';

import type { Prisma } from '@lms/database';
import { ContentType, ProgressStatus, Role } from '@lms/database';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import unzipper, { Entry } from 'unzipper';

import { PrismaService } from '../../common/prisma/prisma.service';
import { STORAGE_PREFIXES } from '../../common/storage/storage.constants';
import { StorageService } from '../../common/storage/storage.service';

import { TrackScormDto } from './dto/track-scorm.dto';
import { parseImsManifest, type ScormManifest, type ScormVersion } from './scorm-manifest.parser';

interface Actor {
  id: string;
  role: Role;
}

export interface ScormUploadResult {
  version: ScormVersion;
  entryPoint: string;
  entryUrl: string;
  title: string;
  itemCount: number;
}

export interface ScormManifestResponse {
  version: ScormVersion;
  entryPoint: string;
  entryUrl: string;
  title: string;
}

/**
 * SCORM package handler (Phase 12).
 *
 * Responsibilities:
 *   1. Upload — take an instructor-supplied `.zip`, unpack into
 *      `content/scorm/{lessonId}/…`, parse `imsmanifest.xml`, persist
 *      the launch URL on `TheoryContent`.
 *   2. Manifest — student/instructor fetches the minimal launch record
 *      (version + entry URL + title) before rendering the iframe.
 *   3. Track — the scorm-again bridge POSTs here on LMSCommit; we
 *      translate the SCORM "lesson_status" string into a ProgressStatus
 *      and — on `passed` or `completed` — mark the lesson complete.
 *
 * SCORM 1.2 vs 2004 mapping (single method in {@link statusToProgress})
 * because both dialects of "done" ultimately close the lesson; we keep
 * the raw status string in `LessonProgress` is not supported by schema,
 * so we just translate to the project's ProgressStatus enum.
 */
@Injectable()
export class ScormService {
  private readonly logger = new Logger(ScormService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // =====================================================
  // Ownership
  // =====================================================
  private async assertOwner(actor: Actor, lessonId: string): Promise<void> {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      include: {
        chapter: { include: { course: { select: { instructorId: true } } } },
      },
    });
    if (!lesson || lesson.isDeleted) throw new NotFoundException('Không tìm thấy bài giảng');
    if (actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN) return;
    if (actor.role === Role.INSTRUCTOR && actor.id === lesson.chapter.course.instructorId) {
      return;
    }
    throw new ForbiddenException('Bạn không có quyền với bài giảng này');
  }

  private async assertLessonExists(lessonId: string): Promise<void> {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, isDeleted: true },
    });
    if (!lesson || lesson.isDeleted) throw new NotFoundException('Không tìm thấy bài giảng');
  }

  // =====================================================
  // UPLOAD — unzip → parse manifest → upload each file
  // =====================================================
  async upload(
    actor: Actor,
    lessonId: string,
    file: Express.Multer.File,
  ): Promise<ScormUploadResult> {
    await this.assertOwner(actor, lessonId);

    if (!file?.buffer) throw new BadRequestException('Thiếu file zip');

    const prefix = `${STORAGE_PREFIXES.SCORM}/${lessonId}`;
    // Clean up previous extraction so stale files don't hang around.
    await this.storage.deletePrefix(prefix).catch(() => undefined);

    // Stream-unzip the buffer in memory. Acceptable for < ~100 MB packages;
    // larger SCORMs should use multipart S3 direct-upload + background
    // extraction (tracked as a Phase 18 follow-up, same as WebGL).
    const directory = await unzipper.Open.buffer(file.buffer);
    let manifestXml: string | null = null;
    for (const entry of directory.files) {
      if (entry.path.toLowerCase().endsWith('imsmanifest.xml')) {
        const buf = await entry.buffer();
        manifestXml = buf.toString('utf-8');
        break;
      }
    }
    if (!manifestXml) {
      throw new BadRequestException('Gói SCORM không có imsmanifest.xml');
    }

    const manifest = await parseImsManifest(manifestXml);

    // Upload each file preserving its relative path under the lesson prefix.
    // We intentionally skip macOS metadata dirs that tend to appear in zips.
    for (const entry of directory.files) {
      if (entry.type !== 'File') continue;
      if (entry.path.startsWith('__MACOSX')) continue;
      const buf = await entry.buffer();
      const key = `${prefix}/${entry.path}`;
      await this.storage.upload(key, buf, buf.length, guessMime(entry.path));
    }

    // Persist the launch URL on TheoryContent so the student player can
    // fetch it in one call.
    const entryKey = `${prefix}/${manifest.entryPoint}`;
    const entryUrl = await this.storage.getUrl(entryKey, 24 * 3600);

    await this.prisma.client.theoryContent.upsert({
      where: { lessonId },
      update: {
        contentType: ContentType.SCORM,
        contentUrl: entryUrl,
      },
      create: {
        lessonId,
        overview: '',
        objectives: [] as never,
        contentType: ContentType.SCORM,
        contentUrl: entryUrl,
      },
    });

    // Stash the raw manifest blob as metadata so we can re-query without
    // re-parsing the whole zip.
    const manifestBlob: Prisma.InputJsonValue = {
      version: manifest.version,
      entryPoint: manifest.entryPoint,
      title: manifest.title,
      items: manifest.items,
    };
    const metadataKey = `${prefix}/_manifest.json`;
    const body = Buffer.from(JSON.stringify(manifestBlob, null, 2), 'utf-8');
    await this.storage.upload(metadataKey, body, body.length, 'application/json');

    this.logger.log(
      `SCORM ${manifest.version} uploaded lesson=${lessonId} entry=${manifest.entryPoint} items=${manifest.items.length}`,
    );

    return {
      version: manifest.version,
      entryPoint: manifest.entryPoint,
      entryUrl,
      title: manifest.title,
      itemCount: manifest.items.length,
    };
  }

  // =====================================================
  // GET manifest
  // =====================================================
  async getManifest(lessonId: string): Promise<ScormManifestResponse> {
    await this.assertLessonExists(lessonId);

    const metadataKey = `${STORAGE_PREFIXES.SCORM}/${lessonId}/_manifest.json`;
    if (!(await this.storage.exists(metadataKey))) {
      throw new NotFoundException('Bài giảng này chưa có SCORM package');
    }
    const text = await this.readText(metadataKey);
    const manifest = JSON.parse(text) as ScormManifest;
    const entryKey = `${STORAGE_PREFIXES.SCORM}/${lessonId}/${manifest.entryPoint}`;
    return {
      version: manifest.version,
      entryPoint: manifest.entryPoint,
      entryUrl: await this.storage.getUrl(entryKey, 24 * 3600),
      title: manifest.title,
    };
  }

  // =====================================================
  // TRACK — called by the scorm-again bridge on LMSCommit
  // =====================================================
  async trackProgress(
    actor: Actor,
    lessonId: string,
    dto: TrackScormDto,
  ): Promise<{ status: ProgressStatus; score: number | null }> {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, isDeleted: true },
    });
    if (!lesson || lesson.isDeleted) throw new NotFoundException('Không tìm thấy bài giảng');

    const status = statusToProgress(dto.lessonStatus);
    const score = typeof dto.scoreRaw === 'number' ? Math.round(dto.scoreRaw) : null;
    const now = new Date();

    const row = await this.prisma.client.lessonProgress.upsert({
      where: {
        lessonId_studentId: { lessonId, studentId: actor.id },
      },
      update: {
        status,
        score: score ?? undefined,
        lastViewAt: now,
        completedAt: status === ProgressStatus.COMPLETED ? now : undefined,
        timeSpent: dto.sessionTime ? { increment: dto.sessionTime } : undefined,
      },
      create: {
        lessonId,
        studentId: actor.id,
        status,
        score: score ?? undefined,
        lastViewAt: now,
        completedAt: status === ProgressStatus.COMPLETED ? now : null,
        timeSpent: dto.sessionTime ?? 0,
      },
    });

    return { status: row.status, score: row.score };
  }

  // =====================================================
  // Student progress for this lesson
  // =====================================================
  async getProgress(actor: Actor, lessonId: string) {
    await this.assertLessonExists(lessonId);
    return this.prisma.client.lessonProgress.findUnique({
      where: {
        lessonId_studentId: { lessonId, studentId: actor.id },
      },
    });
  }

  // =====================================================
  // Helpers
  // =====================================================
  private async readText(key: string): Promise<string> {
    const stream: Readable = await this.storage.streamDownload(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf-8');
  }
}

/**
 * Pure function — makes the mapping easy to unit-test without mocking
 * Prisma. Exported for the spec suite.
 */
export function statusToProgress(status: string | undefined): ProgressStatus {
  if (!status) return ProgressStatus.IN_PROGRESS;
  const s = status.trim().toLowerCase();
  if (s === 'passed' || s === 'completed') return ProgressStatus.COMPLETED;
  if (s === 'not attempted' || s === 'browsed') return ProgressStatus.NOT_STARTED;
  return ProgressStatus.IN_PROGRESS;
}

const MIME_BY_EXT: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function guessMime(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return 'application/octet-stream';
  return MIME_BY_EXT[path.slice(dot).toLowerCase()] ?? 'application/octet-stream';
}

// Export the entry type for suppressing unused lint warnings on the
// `Entry` import (tree-shaken at runtime).
export type { Entry };
