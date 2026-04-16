import { ProgressStatus, Role } from '@lms/database';
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { TrackVideoDto } from './dto/track-video.dto';

interface Actor {
  id: string;
  role: Role;
}

export interface VideoProgressDto {
  lessonId: string;
  watchedSeconds: number;
  duration: number;
  lastPosition: number;
  isCompleted: boolean;
  status: ProgressStatus;
}

/**
 * Video playback progress (Phase 12).
 *
 * The student player beats a heartbeat to `POST /video/:lessonId/progress`
 * every ~10 seconds with the current cursor position. We:
 *   1. Upsert a {@link VideoProgress} row keyed on (theoryContentId, studentId).
 *   2. Decide completion by `watchedSeconds / duration >= threshold` where
 *      threshold is the `TheoryContent.completionThreshold` (default 0.8).
 *   3. When completed, cascade to `LessonProgress.COMPLETED` so the
 *      sidebar outline + course progress % reflect it in real time.
 *
 * The completion threshold lives on `TheoryContent`, so the service has
 * to load it in the same transaction — cheap (one row via unique index)
 * and worth the extra roundtrip to keep the business rule authoritative.
 */
@Injectable()
export class VideoProgressService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pure helper — what the unit tests exercise. Given the raw numbers,
   * decide if the video counts as completed.
   */
  static isCompleted(watchedSeconds: number, duration: number, threshold: number): boolean {
    if (duration <= 0) return false;
    const ratio = watchedSeconds / duration;
    return ratio >= threshold;
  }

  // =====================================================
  // Upsert
  // =====================================================
  async track(actor: Actor, lessonId: string, dto: TrackVideoDto): Promise<VideoProgressDto> {
    const theory = await this.prisma.client.theoryContent.findUnique({
      where: { lessonId },
      select: {
        id: true,
        completionThreshold: true,
        lesson: { select: { id: true, isDeleted: true } },
      },
    });
    if (!theory || theory.lesson.isDeleted) {
      throw new NotFoundException('Không tìm thấy bài giảng hoặc nội dung video');
    }

    const now = new Date();
    const completed = VideoProgressService.isCompleted(
      dto.watchedSeconds,
      dto.duration,
      theory.completionThreshold,
    );

    // Monotonic `watchedSeconds` — the client could send a smaller number
    // if the user scrubs backward; we only ever move watchedSeconds UP so
    // the completion threshold can't flip back to false by rewinding.
    const existing = await this.prisma.client.videoProgress.findUnique({
      where: {
        theoryContentId_studentId: {
          theoryContentId: theory.id,
          studentId: actor.id,
        },
      },
      select: { watchedSeconds: true },
    });
    const nextWatched = Math.max(dto.watchedSeconds, existing?.watchedSeconds ?? 0);
    const finalCompleted =
      completed ||
      (existing
        ? VideoProgressService.isCompleted(nextWatched, dto.duration, theory.completionThreshold)
        : completed);

    await this.prisma.client.videoProgress.upsert({
      where: {
        theoryContentId_studentId: {
          theoryContentId: theory.id,
          studentId: actor.id,
        },
      },
      update: {
        watchedSeconds: nextWatched,
        duration: dto.duration,
        lastPosition: dto.lastPosition,
        isCompleted: finalCompleted,
      },
      create: {
        theoryContentId: theory.id,
        studentId: actor.id,
        watchedSeconds: nextWatched,
        duration: dto.duration,
        lastPosition: dto.lastPosition,
        isCompleted: finalCompleted,
      },
    });

    // Cascade to LessonProgress when the video newly crosses the
    // threshold. Not every heartbeat — only the transition.
    const wasCompleted = existing
      ? VideoProgressService.isCompleted(
          existing.watchedSeconds,
          dto.duration,
          theory.completionThreshold,
        )
      : false;

    const status: ProgressStatus = finalCompleted
      ? ProgressStatus.COMPLETED
      : ProgressStatus.IN_PROGRESS;

    if (finalCompleted && !wasCompleted) {
      await this.prisma.client.lessonProgress.upsert({
        where: {
          lessonId_studentId: { lessonId, studentId: actor.id },
        },
        update: {
          status: ProgressStatus.COMPLETED,
          completedAt: now,
          lastViewAt: now,
        },
        create: {
          lessonId,
          studentId: actor.id,
          status: ProgressStatus.COMPLETED,
          completedAt: now,
          lastViewAt: now,
        },
      });
    } else {
      await this.prisma.client.lessonProgress.upsert({
        where: {
          lessonId_studentId: { lessonId, studentId: actor.id },
        },
        update: {
          status: finalCompleted ? ProgressStatus.COMPLETED : ProgressStatus.IN_PROGRESS,
          lastViewAt: now,
        },
        create: {
          lessonId,
          studentId: actor.id,
          status: finalCompleted ? ProgressStatus.COMPLETED : ProgressStatus.IN_PROGRESS,
          lastViewAt: now,
        },
      });
    }

    return {
      lessonId,
      watchedSeconds: nextWatched,
      duration: dto.duration,
      lastPosition: dto.lastPosition,
      isCompleted: finalCompleted,
      status,
    };
  }

  // =====================================================
  // Read
  // =====================================================
  async getForStudent(actor: Actor, lessonId: string): Promise<VideoProgressDto | null> {
    const theory = await this.prisma.client.theoryContent.findUnique({
      where: { lessonId },
      select: {
        id: true,
        completionThreshold: true,
        lesson: { select: { id: true, isDeleted: true } },
      },
    });
    if (!theory || theory.lesson.isDeleted) return null;

    const row = await this.prisma.client.videoProgress.findUnique({
      where: {
        theoryContentId_studentId: {
          theoryContentId: theory.id,
          studentId: actor.id,
        },
      },
    });
    if (!row) return null;

    return {
      lessonId,
      watchedSeconds: row.watchedSeconds,
      duration: row.duration,
      lastPosition: row.lastPosition,
      isCompleted: row.isCompleted,
      status: row.isCompleted ? ProgressStatus.COMPLETED : ProgressStatus.IN_PROGRESS,
    };
  }
}
