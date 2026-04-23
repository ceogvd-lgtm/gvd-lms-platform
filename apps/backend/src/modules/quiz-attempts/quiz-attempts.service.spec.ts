import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';
import { XpService } from '../students/xp.service';

import { gradeAnswer, QuizAttemptsService } from './quiz-attempts.service';

/**
 * Unit tests for the Phase 14 quiz-attempts grading + cascade.
 *
 * Covers:
 *   - Pure `gradeAnswer()` for SINGLE / MULTI / TRUE_FALSE / FILL_BLANK
 *   - submitAttempt → score >= passScore cascades to LessonProgress + XP
 *   - submitAttempt → score < passScore leaves LessonProgress alone
 */
describe('quiz-attempts / grading', () => {
  it('SINGLE_CHOICE: index match returns correct', () => {
    expect(gradeAnswer('SINGLE_CHOICE' as never, 1, [1])).toBe(true);
    expect(gradeAnswer('SINGLE_CHOICE' as never, 0, [1])).toBe(false);
  });

  it('MULTI_CHOICE: must match ALL correct indices (order-independent)', () => {
    expect(gradeAnswer('MULTI_CHOICE' as never, [0, 1, 3], [0, 1, 3])).toBe(true);
    // Different order but same set
    expect(gradeAnswer('MULTI_CHOICE' as never, [3, 1, 0], [0, 1, 3])).toBe(true);
    // Missing one → wrong
    expect(gradeAnswer('MULTI_CHOICE' as never, [0, 1], [0, 1, 3])).toBe(false);
    // Extra → wrong
    expect(gradeAnswer('MULTI_CHOICE' as never, [0, 1, 2, 3], [0, 1, 3])).toBe(false);
  });

  it('TRUE_FALSE: 0/1 index match', () => {
    expect(gradeAnswer('TRUE_FALSE' as never, 1, [1])).toBe(true);
    expect(gradeAnswer('TRUE_FALSE' as never, 0, [1])).toBe(false);
  });

  it('FILL_BLANK: case-insensitive + trim', () => {
    expect(gradeAnswer('FILL_BLANK' as never, '  2606:2018  ', ['2606:2018'])).toBe(true);
    expect(gradeAnswer('FILL_BLANK' as never, 'TCVN 2606', ['tcvn 2606'])).toBe(true);
    expect(gradeAnswer('FILL_BLANK' as never, 'wrong', ['2606:2018'])).toBe(false);
  });

  it('FILL_BLANK: accepts any string in the correct-answer array', () => {
    expect(
      gradeAnswer('FILL_BLANK' as never, 'ppe', ['personal protective equipment', 'ppe']),
    ).toBe(true);
  });

  // =====================================================
  // Regression: shipping DB stores option IDs as CUID strings
  // (`opt_cd0d38ef588a0c99`), not numeric indices. A previous
  // `Number(value)` coercion turned every id into NaN, and because
  // `new Set([NaN]).has(NaN)` is true, every SINGLE_CHOICE + TRUE_FALSE
  // submission graded as correct regardless of the student's answer.
  // =====================================================

  it('SINGLE_CHOICE with CUID option ids: grades only when ids match', () => {
    const correct = ['opt_a849b6370cc85067'];
    expect(gradeAnswer('SINGLE_CHOICE' as never, 'opt_a849b6370cc85067', correct)).toBe(true);
    expect(gradeAnswer('SINGLE_CHOICE' as never, 'opt_cd0d38ef588a0c99', correct)).toBe(false);
  });

  it('TRUE_FALSE with CUID option ids: only the right id passes', () => {
    const correct = ['opt_true_id'];
    expect(gradeAnswer('TRUE_FALSE' as never, 'opt_true_id', correct)).toBe(true);
    expect(gradeAnswer('TRUE_FALSE' as never, 'opt_false_id', correct)).toBe(false);
  });

  it('MULTI_CHOICE with CUID option ids: exact set match', () => {
    const correct = ['opt_a', 'opt_c'];
    expect(gradeAnswer('MULTI_CHOICE' as never, ['opt_a', 'opt_c'], correct)).toBe(true);
    expect(gradeAnswer('MULTI_CHOICE' as never, ['opt_c', 'opt_a'], correct)).toBe(true);
    expect(gradeAnswer('MULTI_CHOICE' as never, ['opt_a'], correct)).toBe(false);
    expect(gradeAnswer('MULTI_CHOICE' as never, ['opt_a', 'opt_b'], correct)).toBe(false);
  });

  it('rejects NaN-collision from legacy Number() coercion (SINGLE_CHOICE)', () => {
    // Simulates the exact bug path: frontend sent `Number("opt_xxx") = NaN`
    // and backend compared with `Number(correctCuid) = NaN`. The naive
    // Set-of-numbers comparison would return true here; the fixed string
    // comparison must return false because `"NaN" !== "opt_xxx"`.
    expect(gradeAnswer('SINGLE_CHOICE' as never, Number.NaN, ['opt_a849b6370cc85067'])).toBe(false);
  });

  it('empty submission is never correct', () => {
    expect(gradeAnswer('SINGLE_CHOICE' as never, null, ['opt_x'])).toBe(false);
    expect(gradeAnswer('SINGLE_CHOICE' as never, undefined, ['opt_x'])).toBe(false);
    expect(gradeAnswer('MULTI_CHOICE' as never, [], ['opt_x'])).toBe(false);
    expect(gradeAnswer('FILL_BLANK' as never, '', ['answer'])).toBe(false);
  });
});

describe('QuizAttemptsService.submitAttempt', () => {
  let service: QuizAttemptsService;
  let prisma: {
    client: {
      quiz: { findUnique: jest.Mock };
      quizAttempt: { findFirst: jest.Mock; create: jest.Mock };
      lessonProgress: { upsert: jest.Mock };
    };
  };
  let xp: { award: jest.Mock };

  beforeEach(async () => {
    prisma = {
      client: {
        quiz: { findUnique: jest.fn() },
        quizAttempt: { findFirst: jest.fn(), create: jest.fn() },
        lessonProgress: { upsert: jest.fn() },
      },
    };
    xp = { award: jest.fn().mockResolvedValue({ totalXP: 20, level: 1, delta: 20 }) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        QuizAttemptsService,
        { provide: PrismaService, useValue: prisma },
        { provide: XpService, useValue: xp },
      ],
    }).compile();
    service = mod.get(QuizAttemptsService);
  });

  const baseQuiz = {
    id: 'Q1',
    lessonId: 'L1',
    passScore: 70,
    questions: [
      {
        questionId: 'QA',
        points: 50,
        question: {
          id: 'QA',
          type: 'SINGLE_CHOICE',
          correctAnswer: [1],
          explanation: 'A1',
        },
      },
      {
        questionId: 'QB',
        points: 50,
        question: {
          id: 'QB',
          type: 'SINGLE_CHOICE',
          correctAnswer: [0],
          explanation: 'A2',
        },
      },
    ],
  };

  it('score >= passScore → passed + cascades LessonProgress COMPLETED + awards XP', async () => {
    prisma.client.quiz.findUnique.mockResolvedValue(baseQuiz);
    prisma.client.quizAttempt.findFirst.mockResolvedValue(null); // first-ever pass
    prisma.client.quizAttempt.create.mockResolvedValue({ id: 'attempt1' });
    prisma.client.lessonProgress.upsert.mockResolvedValue({});

    const res = await service.submitAttempt('student1', {
      quizId: 'Q1',
      answers: [
        { questionId: 'QA', answer: 1 },
        { questionId: 'QB', answer: 0 },
      ],
    });

    expect(res.passed).toBe(true);
    expect(res.percent).toBe(100);
    expect(res.score).toBe(100);
    expect(res.maxScore).toBe(100);
    expect(prisma.client.lessonProgress.upsert).toHaveBeenCalledTimes(1);
    expect(xp.award).toHaveBeenCalledTimes(1);
  });

  it('score < passScore → not passed, no cascade, no XP', async () => {
    prisma.client.quiz.findUnique.mockResolvedValue(baseQuiz);
    prisma.client.quizAttempt.create.mockResolvedValue({ id: 'attempt2' });

    const res = await service.submitAttempt('student2', {
      quizId: 'Q1',
      answers: [
        { questionId: 'QA', answer: 0 }, // wrong
        { questionId: 'QB', answer: 1 }, // wrong
      ],
    });

    expect(res.passed).toBe(false);
    expect(res.percent).toBe(0);
    expect(prisma.client.lessonProgress.upsert).not.toHaveBeenCalled();
    expect(xp.award).not.toHaveBeenCalled();
  });

  it('second pass on same quiz: cascades progress but does NOT re-award XP', async () => {
    prisma.client.quiz.findUnique.mockResolvedValue(baseQuiz);
    // Student already passed before
    prisma.client.quizAttempt.findFirst.mockResolvedValue({
      id: 'priorAttempt',
      score: 100,
      maxScore: 100,
    });
    prisma.client.quizAttempt.create.mockResolvedValue({ id: 'attempt3' });
    prisma.client.lessonProgress.upsert.mockResolvedValue({});

    const res = await service.submitAttempt('student3', {
      quizId: 'Q1',
      answers: [
        { questionId: 'QA', answer: 1 },
        { questionId: 'QB', answer: 0 },
      ],
    });

    expect(res.passed).toBe(true);
    expect(xp.award).not.toHaveBeenCalled();
  });
});
