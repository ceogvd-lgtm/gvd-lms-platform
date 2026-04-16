import { ProgressStatus } from '@lms/database';
import { Role } from '@lms/types';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';

import { VideoProgressService } from './video-progress.service';

/**
 * Unit tests for the video-progress service.
 *
 * Covers:
 *   - the pure `isCompleted` helper (threshold math)
 *   - `track`:
 *       · marks the video complete when ratio ≥ threshold and cascades
 *         to LessonProgress = COMPLETED
 *       · leaves LessonProgress IN_PROGRESS when below threshold
 *       · monotonic watchedSeconds (rewinding can't un-complete a lesson)
 */
describe('VideoProgressService', () => {
  let service: VideoProgressService;
  let prisma: {
    client: {
      theoryContent: { findUnique: jest.Mock };
      videoProgress: { findUnique: jest.Mock; upsert: jest.Mock };
      lessonProgress: { upsert: jest.Mock };
    };
  };

  beforeEach(async () => {
    prisma = {
      client: {
        theoryContent: { findUnique: jest.fn() },
        videoProgress: { findUnique: jest.fn(), upsert: jest.fn() },
        lessonProgress: { upsert: jest.fn() },
      },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [VideoProgressService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(VideoProgressService);
  });

  // =====================================================
  // isCompleted (pure)
  // =====================================================
  describe('isCompleted', () => {
    it('returns true when watched/duration >= 0.8', () => {
      expect(VideoProgressService.isCompleted(80, 100, 0.8)).toBe(true);
      expect(VideoProgressService.isCompleted(800, 1000, 0.8)).toBe(true);
    });

    it('returns false below threshold', () => {
      expect(VideoProgressService.isCompleted(75, 100, 0.8)).toBe(false);
    });

    it('handles non-default thresholds', () => {
      expect(VideoProgressService.isCompleted(55, 100, 0.5)).toBe(true);
      expect(VideoProgressService.isCompleted(45, 100, 0.5)).toBe(false);
    });

    it('guards against zero or negative duration', () => {
      expect(VideoProgressService.isCompleted(10, 0, 0.8)).toBe(false);
      expect(VideoProgressService.isCompleted(10, -5, 0.8)).toBe(false);
    });
  });

  // =====================================================
  // track
  // =====================================================
  describe('track', () => {
    const actor = { id: 'student-1', role: Role.STUDENT };
    const theory = {
      id: 'tc-1',
      completionThreshold: 0.8,
      lesson: { id: 'lesson-1', isDeleted: false },
    };

    beforeEach(() => {
      prisma.client.theoryContent.findUnique.mockResolvedValue(theory);
      prisma.client.videoProgress.upsert.mockResolvedValue({});
      prisma.client.lessonProgress.upsert.mockResolvedValue({});
    });

    it('watched 85/100 → isCompleted=true and cascades COMPLETED', async () => {
      prisma.client.videoProgress.findUnique.mockResolvedValue(null);
      const res = await service.track(actor, 'lesson-1', {
        watchedSeconds: 85,
        duration: 100,
        lastPosition: 85,
      });
      expect(res.isCompleted).toBe(true);
      expect(res.status).toBe(ProgressStatus.COMPLETED);
      const lessonCall = prisma.client.lessonProgress.upsert.mock.calls[0][0];
      expect(lessonCall.update.status).toBe(ProgressStatus.COMPLETED);
    });

    it('watched 50/100 → isCompleted=false, LessonProgress IN_PROGRESS', async () => {
      prisma.client.videoProgress.findUnique.mockResolvedValue(null);
      const res = await service.track(actor, 'lesson-1', {
        watchedSeconds: 50,
        duration: 100,
        lastPosition: 50,
      });
      expect(res.isCompleted).toBe(false);
      expect(res.status).toBe(ProgressStatus.IN_PROGRESS);
      const lessonCall = prisma.client.lessonProgress.upsert.mock.calls[0][0];
      expect(lessonCall.update.status).toBe(ProgressStatus.IN_PROGRESS);
    });

    it('monotonic watchedSeconds — rewind keeps completion', async () => {
      // User previously watched 90s (completed) then rewinds to 10s.
      prisma.client.videoProgress.findUnique.mockResolvedValue({ watchedSeconds: 90 });
      const res = await service.track(actor, 'lesson-1', {
        watchedSeconds: 10,
        duration: 100,
        lastPosition: 10,
      });
      // watchedSeconds effectively clamps to max(10, 90) = 90 → still complete.
      expect(res.watchedSeconds).toBe(90);
      expect(res.isCompleted).toBe(true);
    });

    it('404s when the lesson has no theory content', async () => {
      prisma.client.theoryContent.findUnique.mockResolvedValue(null);
      await expect(
        service.track(actor, 'lesson-1', {
          watchedSeconds: 50,
          duration: 100,
          lastPosition: 50,
        }),
      ).rejects.toThrow();
    });
  });
});
