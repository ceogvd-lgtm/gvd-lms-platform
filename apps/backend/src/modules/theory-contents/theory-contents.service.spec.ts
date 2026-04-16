import { ContentType, Role } from '@lms/database';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';

import { TheoryContentsService } from './theory-contents.service';

describe('TheoryContentsService', () => {
  let service: TheoryContentsService;
  let prismaMock: {
    client: {
      lesson: { findUnique: jest.Mock };
      theoryContent: { findUnique: jest.Mock; upsert: jest.Mock };
    };
  };

  const INSTR = { id: 'u-instr', role: Role.INSTRUCTOR };
  const OTHER_INSTR = { id: 'u-other', role: Role.INSTRUCTOR };
  const ADMIN = { id: 'u-admin', role: Role.ADMIN };
  const STUDENT = { id: 'u-stud', role: Role.STUDENT };

  beforeEach(async () => {
    prismaMock = {
      client: {
        lesson: { findUnique: jest.fn() },
        theoryContent: { findUnique: jest.fn(), upsert: jest.fn() },
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TheoryContentsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get(TheoryContentsService);
  });

  function mockLessonOwnedBy(instructorId: string, isDeleted = false) {
    prismaMock.client.lesson.findUnique.mockResolvedValue({
      id: 'l-1',
      isDeleted,
      chapter: { course: { instructorId } },
    });
  }

  // =====================================================
  // Ownership
  // =====================================================
  describe('ownership', () => {
    it('rejects when lesson does not exist', async () => {
      prismaMock.client.lesson.findUnique.mockResolvedValue(null);
      await expect(service.findByLesson(INSTR, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('rejects when lesson is soft-deleted', async () => {
      mockLessonOwnedBy(INSTR.id, true);
      await expect(service.findByLesson(INSTR, 'l-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects INSTRUCTOR who is not the course owner', async () => {
      mockLessonOwnedBy(OTHER_INSTR.id);
      await expect(service.findByLesson(INSTR, 'l-1')).rejects.toThrow(ForbiddenException);
    });

    it('rejects STUDENT regardless of ownership', async () => {
      mockLessonOwnedBy(STUDENT.id);
      await expect(service.findByLesson(STUDENT, 'l-1')).rejects.toThrow(ForbiddenException);
    });

    it('allows ADMIN even when not owner', async () => {
      mockLessonOwnedBy(OTHER_INSTR.id);
      prismaMock.client.theoryContent.findUnique.mockResolvedValue(null);
      await expect(service.findByLesson(ADMIN, 'l-1')).resolves.toBeNull();
    });

    it('allows owning INSTRUCTOR', async () => {
      mockLessonOwnedBy(INSTR.id);
      prismaMock.client.theoryContent.findUnique.mockResolvedValue({ id: 't-1' });
      const result = await service.findByLesson(INSTR, 'l-1');
      expect(result).toEqual({ id: 't-1' });
    });
  });

  // =====================================================
  // upsert
  // =====================================================
  describe('upsert', () => {
    beforeEach(() => mockLessonOwnedBy(INSTR.id));

    it('creates with provided fields when no record exists', async () => {
      prismaMock.client.theoryContent.upsert.mockResolvedValue({ id: 't-1' });
      await service.upsert(INSTR, 'l-1', {
        overview: 'Intro to safety',
        objectives: ['know rule 1', 'know rule 2'],
        contentType: ContentType.PDF,
        contentUrl: 'https://example.com/file.pdf',
        body: { type: 'doc', content: [] },
      });
      const call = prismaMock.client.theoryContent.upsert.mock.calls[0]![0];
      expect(call.where).toEqual({ lessonId: 'l-1' });
      expect(call.create.overview).toBe('Intro to safety');
      expect(call.create.contentType).toBe(ContentType.PDF);
      expect(call.create.body).toEqual({ type: 'doc', content: [] });
    });

    it('defaults completionThreshold to 0.8 when not provided', async () => {
      prismaMock.client.theoryContent.upsert.mockResolvedValue({ id: 't-1' });
      await service.upsert(INSTR, 'l-1', {
        overview: 'x',
        objectives: [],
        contentType: ContentType.VIDEO,
        contentUrl: 'https://example.com/v.mp4',
      });
      const call = prismaMock.client.theoryContent.upsert.mock.calls[0]![0];
      expect(call.create.completionThreshold).toBe(0.8);
    });
  });

  // =====================================================
  // saveBody (auto-save)
  // =====================================================
  describe('saveBody', () => {
    beforeEach(() => mockLessonOwnedBy(INSTR.id));

    it('updates body without touching other fields when record exists', async () => {
      prismaMock.client.theoryContent.upsert.mockResolvedValue({ id: 't-1' });
      const body = { type: 'doc', content: [{ type: 'paragraph' }] };
      await service.saveBody(INSTR, 'l-1', { body });
      const call = prismaMock.client.theoryContent.upsert.mock.calls[0]![0];
      expect(call.update).toEqual({ body });
    });

    it('creates a stub record on first auto-save', async () => {
      prismaMock.client.theoryContent.upsert.mockResolvedValue({ id: 't-1' });
      const body = { type: 'doc', content: [] };
      await service.saveBody(INSTR, 'l-1', { body });
      const call = prismaMock.client.theoryContent.upsert.mock.calls[0]![0];
      // Defaults that let the row pass NOT NULL constraints — instructor
      // will fill in real values via the full upsert later.
      expect(call.create.contentType).toBe('PDF');
      expect(call.create.contentUrl).toBe('');
      expect(call.create.overview).toBe('');
      expect(call.create.body).toEqual(body);
    });
  });
});
