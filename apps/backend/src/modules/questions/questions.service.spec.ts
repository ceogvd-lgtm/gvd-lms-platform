import { Role } from '@lms/types';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
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
        deleteMany: jest.Mock;
      };
      course: { findFirst: jest.Mock };
      department: { findUnique: jest.Mock };
    };
  };
  let audit: { log: jest.Mock };

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
          deleteMany: jest.fn(),
        },
        course: { findFirst: jest.fn() },
        department: { findUnique: jest.fn() },
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
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

  // =====================================================
  // Phase 18 — Admin-scoped list + bulk delete
  // =====================================================
  describe('listForAdmin', () => {
    const admin = { id: 'admin-1', role: Role.ADMIN };

    beforeEach(() => {
      prisma.client.questionBank.findMany.mockResolvedValue([]);
      prisma.client.questionBank.count.mockResolvedValue(0);
    });

    it('rejects non-admin (defense-in-depth)', async () => {
      await expect(
        service.listForAdmin({ id: 'inst', role: Role.INSTRUCTOR }, { page: 1 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('admin sees ALL questions — no createdBy filter applied by default', async () => {
      await service.listForAdmin(admin, { page: 1, limit: 20 });
      const where = prisma.client.questionBank.findMany.mock.calls[0][0].where;
      expect(where.createdBy).toBeUndefined();
    });

    it('filters by instructorId when provided', async () => {
      await service.listForAdmin(admin, { instructorId: 'inst-42' });
      const where = prisma.client.questionBank.findMany.mock.calls[0][0].where;
      expect(where.createdBy).toBe('inst-42');
    });

    it('filters by subjectId via nested course relation', async () => {
      await service.listForAdmin(admin, { subjectId: 'subj-1' });
      const where = prisma.client.questionBank.findMany.mock.calls[0][0].where;
      expect(where.course).toEqual({ subjectId: 'subj-1' });
    });

    it('filters by difficulty', async () => {
      await service.listForAdmin(admin, { difficulty: 'HARD' as never });
      const where = prisma.client.questionBank.findMany.mock.calls[0][0].where;
      expect(where.difficulty).toBe('HARD');
    });

    it('filters by search term (case-insensitive contains)', async () => {
      await service.listForAdmin(admin, { q: 'hà nội' });
      const where = prisma.client.questionBank.findMany.mock.calls[0][0].where;
      expect(where.question).toEqual({ contains: 'hà nội', mode: 'insensitive' });
    });

    it('includes creator + _count in the shape returned to the client', async () => {
      await service.listForAdmin(admin, {});
      const include = prisma.client.questionBank.findMany.mock.calls[0][0].include;
      expect(include.creator).toBeDefined();
      expect(include._count).toEqual({ select: { quizQuestions: true } });
    });
  });

  describe('bulkRemove (admin)', () => {
    const admin = { id: 'admin-1', role: Role.ADMIN };
    const superAdmin = { id: 'super-1', role: Role.SUPER_ADMIN };
    const meta = { ip: '127.0.0.1' };

    it('rejects non-admin (instructor trying bulk delete → 403)', async () => {
      await expect(
        service.bulkRemove({ id: 'inst', role: Role.INSTRUCTOR }, ['q1'], meta),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('deletes only "not in use" questions, skips questions with quizQuestions > 0', async () => {
      prisma.client.questionBank.findMany.mockResolvedValue([
        { id: 'q1', question: 'Q1', createdBy: 'u1', _count: { quizQuestions: 0 } },
        { id: 'q2', question: 'Q2', createdBy: 'u1', _count: { quizQuestions: 3 } }, // in use
        { id: 'q3', question: 'Q3', createdBy: 'u2', _count: { quizQuestions: 0 } },
      ]);
      prisma.client.questionBank.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.bulkRemove(admin, ['q1', 'q2', 'q3'], meta);

      expect(result.deleted).toBe(2);
      expect(result.skipped).toBe(1);
      expect(result.skippedIds).toEqual(['q2']);
      expect(result.deletedIds).toEqual(['q1', 'q3']);
      expect(prisma.client.questionBank.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['q1', 'q3'] } },
      });
    });

    it('throws 400 when all candidates are in use', async () => {
      prisma.client.questionBank.findMany.mockResolvedValue([
        { id: 'q1', question: 'Q1', createdBy: 'u1', _count: { quizQuestions: 2 } },
        { id: 'q2', question: 'Q2', createdBy: 'u1', _count: { quizQuestions: 1 } },
      ]);

      await expect(service.bulkRemove(admin, ['q1', 'q2'], meta)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.client.questionBank.deleteMany).not.toHaveBeenCalled();
    });

    it('writes one audit log entry per successfully deleted question', async () => {
      prisma.client.questionBank.findMany.mockResolvedValue([
        { id: 'q1', question: 'Q1', createdBy: 'u1', _count: { quizQuestions: 0 } },
        { id: 'q2', question: 'Q2', createdBy: 'u2', _count: { quizQuestions: 0 } },
      ]);
      prisma.client.questionBank.deleteMany.mockResolvedValue({ count: 2 });

      await service.bulkRemove(superAdmin, ['q1', 'q2'], meta);

      expect(audit.log).toHaveBeenCalledTimes(2);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'super-1',
          action: 'question.bulk-delete',
          targetType: 'QuestionBank',
          targetId: 'q1',
          ipAddress: '127.0.0.1',
        }),
      );
    });

    it('non-existent ids are filtered out silently (no throw)', async () => {
      // findMany returns only the 1 existing row — missing ids are dropped
      prisma.client.questionBank.findMany.mockResolvedValue([
        { id: 'q1', question: 'Q1', createdBy: 'u1', _count: { quizQuestions: 0 } },
      ]);
      prisma.client.questionBank.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.bulkRemove(admin, ['q1', 'ghost-id'], meta);
      expect(result.deleted).toBe(1);
      expect(result.skipped).toBe(0); // ghost-id is not "in use", just missing
    });
  });
});
