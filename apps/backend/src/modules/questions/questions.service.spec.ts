import { Role } from '@lms/types';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';

import { QuestionsService } from './questions.service';

/**
 * Unit tests for QuestionsService (Phase 11).
 *
 * Focus is the business logic that a real DB wouldn't catch:
 *   - Option validation per question type
 *   - Tag normalisation + dedupe
 *   - Ownership guard (INSTRUCTOR can only touch own rows)
 *   - Import dry-run vs commit
 */
describe('QuestionsService', () => {
  let service: QuestionsService;
  let prisma: {
    client: {
      questionBank: {
        create: jest.Mock;
        createMany: jest.Mock;
        findUnique: jest.Mock;
        findMany: jest.Mock;
        count: jest.Mock;
        update: jest.Mock;
        delete: jest.Mock;
      };
      course: { findFirst: jest.Mock };
      department: { findUnique: jest.Mock };
    };
  };

  beforeEach(async () => {
    prisma = {
      client: {
        questionBank: {
          create: jest.fn(),
          createMany: jest.fn(),
          findUnique: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        course: { findFirst: jest.fn() },
        department: { findUnique: jest.fn() },
      },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [QuestionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(QuestionsService);
  });

  const actor = { id: 'instructor-1', role: Role.INSTRUCTOR };

  // =====================================================
  // CREATE — option validation
  // =====================================================
  describe('create (option validation)', () => {
    beforeEach(() => {
      prisma.client.questionBank.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'q1',
          courseId: data.courseId,
          departmentId: data.departmentId,
          question: data.question,
          type: data.type,
          options: data.options,
          correctAnswer: data.correctAnswer,
          explanation: data.explanation,
          difficulty: data.difficulty,
          tags: data.tags,
          points: data.points,
          createdBy: data.createdBy,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
    });

    it('creates a SINGLE_CHOICE question with exactly one correct option', async () => {
      const out = await service.create(actor, {
        question: 'Thủ đô của Việt Nam?',
        type: 'SINGLE_CHOICE',
        options: [
          { text: 'Hà Nội', isCorrect: true },
          { text: 'TP.HCM', isCorrect: false },
          { text: 'Đà Nẵng', isCorrect: false },
          { text: 'Hải Phòng', isCorrect: false },
        ],
      });
      expect(out.correctAnswer).toHaveLength(1);
      expect(out.options).toHaveLength(4);
    });

    it('rejects SINGLE_CHOICE with more than one correct', async () => {
      await expect(
        service.create(actor, {
          question: 'x',
          type: 'SINGLE_CHOICE',
          options: [
            { text: 'a', isCorrect: true },
            { text: 'b', isCorrect: true },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects MULTI_CHOICE with zero correct', async () => {
      await expect(
        service.create(actor, {
          question: 'x',
          type: 'MULTI_CHOICE',
          options: [
            { text: 'a', isCorrect: false },
            { text: 'b', isCorrect: false },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('normalises TRUE_FALSE ids to "true"/"false"', async () => {
      const out = await service.create(actor, {
        question: 'Nước sôi ở 100°C?',
        type: 'TRUE_FALSE',
        options: [
          { text: 'Đúng', isCorrect: true },
          { text: 'Sai', isCorrect: false },
        ],
      });
      expect(out.options[0]!.id).toBe('true');
      expect(out.options[1]!.id).toBe('false');
      expect(out.correctAnswer).toEqual(['true']);
    });

    it('requires ≥ 1 correct option for FILL_BLANK', async () => {
      await expect(
        service.create(actor, {
          question: 'x',
          type: 'FILL_BLANK',
          options: [
            { text: 'a', isCorrect: false },
            { text: 'b', isCorrect: false },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('normalises + dedupes tags (case-insensitive)', async () => {
      const out = await service.create(actor, {
        question: 'x',
        type: 'SINGLE_CHOICE',
        options: [
          { text: 'a', isCorrect: true },
          { text: 'b', isCorrect: false },
        ],
        tags: [' Điện ', 'điện', 'AN-TOÀN', 'an-toàn', ''],
      });
      expect(out.tags).toEqual(['điện', 'an-toàn']);
    });
  });

  // =====================================================
  // OWNERSHIP — update/delete
  // =====================================================
  describe('ownership guard', () => {
    it('instructor cannot update someone elses question', async () => {
      prisma.client.questionBank.findUnique.mockResolvedValue({
        id: 'q1',
        createdBy: 'other-instructor',
        type: 'SINGLE_CHOICE',
        options: [],
      });
      await expect(service.update(actor, 'q1', { question: 'hacked' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('admin can update any question', async () => {
      prisma.client.questionBank.findUnique.mockResolvedValue({
        id: 'q1',
        createdBy: 'anyone',
        type: 'SINGLE_CHOICE',
        options: [
          { id: 'o1', text: 'a', isCorrect: true },
          { id: 'o2', text: 'b', isCorrect: false },
        ],
      });
      prisma.client.questionBank.update.mockResolvedValue({
        id: 'q1',
        createdBy: 'anyone',
        question: 'new',
        type: 'SINGLE_CHOICE',
        options: [],
        correctAnswer: [],
        difficulty: 'MEDIUM',
        tags: [],
        points: 1,
        courseId: null,
        departmentId: null,
        explanation: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await expect(
        service.update({ id: 'admin', role: Role.ADMIN }, 'q1', { question: 'new' }),
      ).resolves.toBeDefined();
    });

    it('remove throws NotFound when missing', async () => {
      prisma.client.questionBank.findUnique.mockResolvedValue(null);
      await expect(service.remove(actor, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('instructor cannot delete a question that is in a quiz', async () => {
      prisma.client.questionBank.findUnique.mockResolvedValue({
        id: 'q1',
        createdBy: actor.id,
        _count: { quizQuestions: 2 },
      });
      await expect(service.remove(actor, 'q1')).rejects.toThrow(BadRequestException);
    });
  });

  // =====================================================
  // IMPORT — dry-run + commit
  // =====================================================
  describe('importBulk', () => {
    it('dryRun does not persist, returns preview + errors', async () => {
      const result = await service.importBulk(
        actor,
        {
          questions: [
            {
              question: 'valid',
              type: 'SINGLE_CHOICE',
              options: [
                { text: 'a', isCorrect: true },
                { text: 'b', isCorrect: false },
              ],
            },
            {
              // invalid: zero correct for single-choice
              question: 'bad',
              type: 'SINGLE_CHOICE',
              options: [
                { text: 'a', isCorrect: false },
                { text: 'b', isCorrect: false },
              ],
            },
          ],
        },
        { dryRun: true },
      );
      expect(prisma.client.questionBank.createMany).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.row).toBe(3); // header = 1, first data = 2, second = 3
      expect(result.preview).toHaveLength(1);
    });

    it('commit persists only valid rows', async () => {
      prisma.client.questionBank.createMany.mockResolvedValue({ count: 1 });
      const result = await service.importBulk(actor, {
        questions: [
          {
            question: 'good',
            type: 'SINGLE_CHOICE',
            options: [
              { text: 'a', isCorrect: true },
              { text: 'b', isCorrect: false },
            ],
          },
          {
            question: 'bad',
            type: 'TRUE_FALSE',
            options: [{ text: 'Đ', isCorrect: true }], // only 1 option
          },
        ],
      });
      expect(prisma.client.questionBank.createMany).toHaveBeenCalledTimes(1);
      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });

  // =====================================================
  // LIST — instructor scoping
  // =====================================================
  describe('list', () => {
    it('instructors are auto-scoped to their own createdBy', async () => {
      prisma.client.questionBank.findMany.mockResolvedValue([]);
      prisma.client.questionBank.count.mockResolvedValue(0);

      await service.list(actor, { page: 1, limit: 10 });
      const where = prisma.client.questionBank.findMany.mock.calls[0][0].where;
      expect(where.createdBy).toBe(actor.id);
    });

    it('admins see everything unless createdBy is explicit', async () => {
      prisma.client.questionBank.findMany.mockResolvedValue([]);
      prisma.client.questionBank.count.mockResolvedValue(0);

      await service.list({ id: 'admin', role: Role.ADMIN }, { page: 1, limit: 10 });
      const where = prisma.client.questionBank.findMany.mock.calls[0][0].where;
      expect(where.createdBy).toBeUndefined();
    });
  });
});
