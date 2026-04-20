import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { GEMINI_QUEUE } from '../ai/ai.constants';
import { QuotaService } from '../ai/quota.service';
import { CertificatesService } from '../certificates/certificates.service';
import { ProgressService } from '../progress/progress.service';
import { XpService } from '../students/xp.service';

import { LessonsService } from './lessons.service';

/**
 * Unit tests for `LessonsService.getContext` — the navigation metadata
 * endpoint the lesson page consumes to render its outline sidebar and
 * prev/next buttons.
 *
 * Coverage:
 *   - happy path: returns full {lesson, chapter, course, prev, next}
 *   - NotFoundException when the lesson doesn't exist or is soft-deleted
 *   - prev=null for the first lesson in course reading order
 *   - next=null for the last lesson in course reading order
 */
describe('LessonsService — getContext', () => {
  let service: LessonsService;
  let prisma: {
    client: {
      lesson: { findUnique: jest.Mock; findMany: jest.Mock };
      chapter: { findMany: jest.Mock };
    };
  };

  beforeEach(async () => {
    prisma = {
      client: {
        lesson: { findUnique: jest.fn(), findMany: jest.fn() },
        chapter: { findMany: jest.fn() },
      },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        LessonsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: XpService, useValue: { award: jest.fn() } },
        // Phase 15 — getContext doesn't touch ProgressService, but the
        // class constructor requires it so we wire a stub.
        { provide: ProgressService, useValue: { calculateCourseProgress: jest.fn() } },
        // Phase 16 — same for CertificatesService.
        { provide: CertificatesService, useValue: { checkAndIssueCertificate: jest.fn() } },
        // Phase 18 — StorageService chỉ đụng trong softDelete, stub no-op.
        { provide: StorageService, useValue: { delete: jest.fn(), deletePrefix: jest.fn() } },
        // Phase 18 — auto-index PDF hooks, không đụng trong getContext nhưng
        // constructor cần inject.
        { provide: getQueueToken(GEMINI_QUEUE), useValue: { add: jest.fn() } },
        { provide: QuotaService, useValue: { hasQuotaFor: jest.fn() } },
      ],
    }).compile();
    service = mod.get(LessonsService);
  });

  const baseLesson = {
    id: 'L2',
    title: 'Lesson Two',
    type: 'THEORY',
    order: 1,
    isDeleted: false,
    chapter: {
      id: 'C1',
      title: 'Chapter One',
      order: 0,
      course: { id: 'CRS1', title: 'Demo Course' },
    },
  };

  it('returns full context with prev + next when the lesson is in the middle', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue(baseLesson);
    prisma.client.chapter.findMany.mockResolvedValue([{ id: 'C1', order: 0 }]);
    prisma.client.lesson.findMany.mockResolvedValue([
      { id: 'L1', title: 'Lesson One', chapterId: 'C1', order: 0 },
      { id: 'L2', title: 'Lesson Two', chapterId: 'C1', order: 1 },
      { id: 'L3', title: 'Lesson Three', chapterId: 'C1', order: 2 },
    ]);

    const result = await service.getContext('L2');

    expect(result.lesson).toEqual({ id: 'L2', title: 'Lesson Two', type: 'THEORY', order: 1 });
    expect(result.chapter).toEqual({ id: 'C1', title: 'Chapter One', order: 0 });
    expect(result.course).toEqual({ id: 'CRS1', title: 'Demo Course' });
    expect(result.prev).toEqual({ id: 'L1', title: 'Lesson One' });
    expect(result.next).toEqual({ id: 'L3', title: 'Lesson Three' });
  });

  it('returns prev=null when the lesson is the first in the course', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({ ...baseLesson, id: 'L1' });
    prisma.client.chapter.findMany.mockResolvedValue([{ id: 'C1', order: 0 }]);
    prisma.client.lesson.findMany.mockResolvedValue([
      { id: 'L1', title: 'Lesson One', chapterId: 'C1', order: 0 },
      { id: 'L2', title: 'Lesson Two', chapterId: 'C1', order: 1 },
    ]);

    const result = await service.getContext('L1');
    expect(result.prev).toBeNull();
    expect(result.next).toEqual({ id: 'L2', title: 'Lesson Two' });
  });

  it('returns next=null when the lesson is the last in the course', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({ ...baseLesson, id: 'L3' });
    prisma.client.chapter.findMany.mockResolvedValue([{ id: 'C1', order: 0 }]);
    prisma.client.lesson.findMany.mockResolvedValue([
      { id: 'L1', title: 'Lesson One', chapterId: 'C1', order: 0 },
      { id: 'L2', title: 'Lesson Two', chapterId: 'C1', order: 1 },
      { id: 'L3', title: 'Lesson Three', chapterId: 'C1', order: 2 },
    ]);

    const result = await service.getContext('L3');
    expect(result.prev).toEqual({ id: 'L2', title: 'Lesson Two' });
    expect(result.next).toBeNull();
  });

  it('throws NotFoundException when lesson does not exist', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue(null);
    await expect(service.getContext('unknown')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when lesson is soft-deleted', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({ ...baseLesson, isDeleted: true });
    await expect(service.getContext('L2')).rejects.toBeInstanceOf(NotFoundException);
  });
});
