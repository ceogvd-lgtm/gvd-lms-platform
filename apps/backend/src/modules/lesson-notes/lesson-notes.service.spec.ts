import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';

import { LessonNotesService } from './lesson-notes.service';

describe('LessonNotesService', () => {
  let service: LessonNotesService;
  let prisma: {
    client: {
      lesson: { findUnique: jest.Mock };
      lessonNote: { findUnique: jest.Mock; upsert: jest.Mock };
    };
  };

  beforeEach(async () => {
    prisma = {
      client: {
        lesson: { findUnique: jest.fn() },
        lessonNote: { findUnique: jest.fn(), upsert: jest.fn() },
      },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [LessonNotesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(LessonNotesService);
  });

  it('upsertNote: creates a new row when none exists', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({ id: 'L1', isDeleted: false });
    prisma.client.lessonNote.upsert.mockResolvedValue({
      lessonId: 'L1',
      studentId: 'S1',
      content: { type: 'doc' },
      updatedAt: new Date(),
    });

    const res = await service.upsertNote('S1', 'L1', { type: 'doc' });
    expect(res.studentId).toBe('S1');
    expect(res.lessonId).toBe('L1');
    // Prisma called with upsert — guarantees "create if missing, update if present".
    expect(prisma.client.lessonNote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { lessonId_studentId: { lessonId: 'L1', studentId: 'S1' } },
      }),
    );
  });

  it('upsertNote: updates existing row on re-save (same upsert call)', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({ id: 'L1', isDeleted: false });
    const fresh = { type: 'doc', content: [{ type: 'paragraph' }] };
    prisma.client.lessonNote.upsert.mockResolvedValue({
      lessonId: 'L1',
      studentId: 'S1',
      content: fresh,
      updatedAt: new Date(),
    });
    const res = await service.upsertNote('S1', 'L1', fresh);
    expect(res.content).toEqual(fresh);
  });

  it('upsertNote: 404 when lesson is soft-deleted', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({ id: 'L1', isDeleted: true });
    await expect(service.upsertNote('S1', 'L1', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getNote: returns null for student who has not saved yet', async () => {
    prisma.client.lessonNote.findUnique.mockResolvedValue(null);
    await expect(service.getNote('S1', 'L1')).resolves.toBeNull();
  });
});
