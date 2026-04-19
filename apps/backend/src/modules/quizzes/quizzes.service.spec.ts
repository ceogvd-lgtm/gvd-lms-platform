import { Role } from '@lms/types';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import { QuizzesService } from './quizzes.service';

/**
 * Unit tests for QuizzesService (Phase 11).
 *
 * Focus:
 *   - Course-owner guard for PATCH / question add
 *   - ADMIN+ gate on DELETE
 *   - hideAnswers redacts options when the viewer isn't the owner
 *   - Dedup on bulk add (already-present questions are skipped)
 */
describe('QuizzesService', () => {
  let service: QuizzesService;
  let audit: { log: jest.Mock };
  let prisma: {
    client: {
      quiz: {
        findUnique: jest.Mock;
        findFirst: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        delete: jest.Mock;
      };
      lesson: { findUnique: jest.Mock };
      questionBank: { findUnique: jest.Mock; findMany: jest.Mock };
      quizQuestion: {
        findUnique: jest.Mock;
        findFirst: jest.Mock;
        findMany: jest.Mock;
        create: jest.Mock;
        createMany: jest.Mock;
        delete: jest.Mock;
        update: jest.Mock;
      };
      $transaction: jest.Mock;
    };
  };

  const owner = { id: 'instructor-1', role: Role.INSTRUCTOR };
  const stranger = { id: 'instructor-2', role: Role.INSTRUCTOR };

  const lessonWithOwner = (instructorId: string) => ({
    id: 'lesson-1',
    isDeleted: false,
    chapter: { course: { id: 'course-1', instructorId } },
  });

  beforeEach(async () => {
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      client: {
        quiz: {
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        lesson: { findUnique: jest.fn() },
        questionBank: { findUnique: jest.fn(), findMany: jest.fn() },
        quizQuestion: {
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          findMany: jest.fn(),
          create: jest.fn(),
          createMany: jest.fn(),
          delete: jest.fn(),
          update: jest.fn(),
        },
        $transaction: jest.fn().mockImplementation(async (ops) => ops),
      },
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        QuizzesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = mod.get(QuizzesService);
  });

  // =====================================================
  // createForLesson
  // =====================================================
  describe('createForLesson', () => {
    it('allows the course instructor', async () => {
      prisma.client.lesson.findUnique.mockResolvedValue(lessonWithOwner(owner.id));
      prisma.client.quiz.findFirst.mockResolvedValue(null);
      prisma.client.quiz.create.mockResolvedValue({ id: 'quiz-1' });

      await expect(
        service.createForLesson(owner, 'lesson-1', {
          title: 'Kiểm tra 1',
          passScore: 70,
        }),
      ).resolves.toEqual({ id: 'quiz-1' });
    });

    it('blocks a non-owner instructor', async () => {
      prisma.client.lesson.findUnique.mockResolvedValue(lessonWithOwner(owner.id));
      prisma.client.quiz.findFirst.mockResolvedValue(null);
      await expect(
        service.createForLesson(stranger, 'lesson-1', {
          title: 't',
          passScore: 50,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects when the lesson already has a quiz', async () => {
      prisma.client.lesson.findUnique.mockResolvedValue(lessonWithOwner(owner.id));
      prisma.client.quiz.findFirst.mockResolvedValue({ id: 'quiz-existing' });
      await expect(
        service.createForLesson(owner, 'lesson-1', {
          title: 't',
          passScore: 50,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =====================================================
  // remove — INSTRUCTOR owner + ADMIN+
  // =====================================================
  describe('remove', () => {
    // Phase 18 — quiz của course → ownership check qua
    // findQuizWithCourse + assertCourseOwner. Setup mock trả quiz với
    // course.instructorId để 2 test dưới phân biệt được owner/stranger.
    const quizRow = (instructorId: string) => ({
      id: 'quiz-1',
      title: 't',
      lessonId: 'lesson-1',
      lesson: { chapter: { course: { id: 'course-1', instructorId } } },
    });

    it('INSTRUCTOR owner CAN delete their own quiz', async () => {
      prisma.client.quiz.findUnique.mockResolvedValue(quizRow(owner.id));
      prisma.client.quiz.delete.mockResolvedValue({});

      const res = await service.remove(owner, 'quiz-1', { ip: '127.0.0.1' });

      expect(prisma.client.quiz.delete).toHaveBeenCalledWith({ where: { id: 'quiz-1' } });
      expect(res.message).toContain('Đã xoá');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'QUIZ_DELETE', targetId: 'quiz-1' }),
      );
    });

    it('INSTRUCTOR stranger (not course owner) → ForbiddenException', async () => {
      prisma.client.quiz.findUnique.mockResolvedValue(quizRow(owner.id));

      await expect(service.remove(stranger, 'quiz-1', { ip: '127.0.0.1' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.client.quiz.delete).not.toHaveBeenCalled();
    });

    it('ADMIN bypass ownership — can delete any quiz', async () => {
      prisma.client.quiz.findUnique.mockResolvedValue(quizRow('some-other-instructor'));
      prisma.client.quiz.delete.mockResolvedValue({});

      await service.remove({ id: 'admin', role: Role.ADMIN }, 'quiz-1', { ip: '127.0.0.1' });

      expect(prisma.client.quiz.delete).toHaveBeenCalledWith({ where: { id: 'quiz-1' } });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'QUIZ_DELETE', targetId: 'quiz-1' }),
      );
    });

    it('404 when quiz does not exist', async () => {
      prisma.client.quiz.findUnique.mockResolvedValue(null);
      await expect(service.remove(owner, 'ghost', { ip: '127.0.0.1' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =====================================================
  // addQuestion — dedup + ownership
  // =====================================================
  describe('addQuestion', () => {
    beforeEach(() => {
      prisma.client.quiz.findUnique.mockResolvedValue({
        id: 'quiz-1',
        lesson: { chapter: { course: { id: 'course-1', instructorId: owner.id } } },
      });
    });

    it('dedupes when the question is already in the quiz', async () => {
      prisma.client.questionBank.findUnique.mockResolvedValue({
        id: 'q1',
        points: 1,
        createdBy: owner.id,
      });
      prisma.client.quizQuestion.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.addQuestion(owner, 'quiz-1', { questionId: 'q1' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates with incremented order', async () => {
      prisma.client.questionBank.findUnique.mockResolvedValue({
        id: 'q1',
        points: 5,
        createdBy: owner.id,
      });
      prisma.client.quizQuestion.findUnique.mockResolvedValue(null);
      prisma.client.quizQuestion.findFirst.mockResolvedValue({ order: 3 });
      prisma.client.quizQuestion.create.mockResolvedValue({
        id: 'qq1',
        quizId: 'quiz-1',
        questionId: 'q1',
        order: 4,
        points: 5,
      });

      const out = await service.addQuestion(owner, 'quiz-1', { questionId: 'q1' });
      expect(out.order).toBe(4);
      expect(prisma.client.quizQuestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ order: 4, points: 5 }),
        }),
      );
    });
  });

  // =====================================================
  // addQuestionsBulk — skip duplicates, preserve order
  // =====================================================
  describe('addQuestionsBulk', () => {
    beforeEach(() => {
      prisma.client.quiz.findUnique.mockResolvedValue({
        id: 'quiz-1',
        lesson: { chapter: { course: { id: 'course-1', instructorId: owner.id } } },
      });
    });

    it('skips duplicates and respects existing order offset', async () => {
      prisma.client.questionBank.findMany.mockResolvedValue([
        { id: 'a', points: 1 },
        { id: 'b', points: 2 },
        { id: 'c', points: 3 },
      ]);
      prisma.client.quizQuestion.findMany.mockResolvedValue([{ questionId: 'b' }]);
      prisma.client.quizQuestion.findFirst.mockResolvedValue({ order: 2 });

      const res = await service.addQuestionsBulk(owner, 'quiz-1', ['a', 'b', 'c']);
      expect(res.added).toBe(2);
      expect(res.skipped).toBe(1);
      expect(prisma.client.quizQuestion.createMany).toHaveBeenCalledWith({
        data: [
          { quizId: 'quiz-1', questionId: 'a', order: 3, points: 1 },
          { quizId: 'quiz-1', questionId: 'c', order: 4, points: 3 },
        ],
      });
    });
  });

  // =====================================================
  // getForLesson redaction
  // =====================================================
  describe('getForLesson', () => {
    const student = { id: 's1', role: Role.STUDENT };

    it('returns null when quiz does not exist', async () => {
      prisma.client.lesson.findUnique.mockResolvedValue(lessonWithOwner(owner.id));
      prisma.client.quiz.findFirst.mockResolvedValue(null);
      const res = await service.getForLesson(owner, 'lesson-1', { hideAnswers: true });
      expect(res).toBeNull();
    });

    it('redacts options.isCorrect + correctAnswer for students', async () => {
      prisma.client.lesson.findUnique.mockResolvedValue(lessonWithOwner(owner.id));
      prisma.client.quiz.findFirst.mockResolvedValue({
        id: 'quiz-1',
        lessonId: 'lesson-1',
        title: 't',
        timeLimit: null,
        shuffleQuestions: false,
        showAnswerAfter: true,
        passScore: 50,
        maxAttempts: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
        questions: [
          {
            id: 'qq1',
            questionId: 'q1',
            order: 0,
            points: 1,
            question: {
              id: 'q1',
              question: 'x',
              type: 'SINGLE_CHOICE',
              difficulty: 'MEDIUM',
              tags: [],
              options: [
                { id: 'a', text: 'A', isCorrect: true },
                { id: 'b', text: 'B', isCorrect: false },
              ],
              correctAnswer: ['a'],
              explanation: 'because A',
            },
          },
        ],
      });

      const res = await service.getForLesson(student, 'lesson-1', { hideAnswers: true });
      expect(res).not.toBeNull();
      const q = res!.questions[0]!.question;
      expect(q.correctAnswer).toEqual([]);
      expect(q.explanation).toBeNull();
      expect((q.options as Array<{ isCorrect: boolean }>).every((o) => o.isCorrect === false)).toBe(
        true,
      );
    });

    it('keeps answers visible for the course owner', async () => {
      prisma.client.lesson.findUnique.mockResolvedValue(lessonWithOwner(owner.id));
      prisma.client.quiz.findFirst.mockResolvedValue({
        id: 'quiz-1',
        lessonId: 'lesson-1',
        title: 't',
        timeLimit: null,
        shuffleQuestions: false,
        showAnswerAfter: true,
        passScore: 50,
        maxAttempts: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
        questions: [
          {
            id: 'qq1',
            questionId: 'q1',
            order: 0,
            points: 1,
            question: {
              id: 'q1',
              question: 'x',
              type: 'SINGLE_CHOICE',
              difficulty: 'MEDIUM',
              tags: [],
              options: [
                { id: 'a', text: 'A', isCorrect: true },
                { id: 'b', text: 'B', isCorrect: false },
              ],
              correctAnswer: ['a'],
              explanation: 'because A',
            },
          },
        ],
      });

      const res = await service.getForLesson(owner, 'lesson-1', { hideAnswers: false });
      const q = res!.questions[0]!.question;
      expect(q.correctAnswer).toEqual(['a']);
      expect(q.explanation).toBe('because A');
    });

    it('404s when the lesson does not exist', async () => {
      prisma.client.lesson.findUnique.mockResolvedValue(null);
      await expect(service.getForLesson(owner, 'missing', { hideAnswers: false })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
