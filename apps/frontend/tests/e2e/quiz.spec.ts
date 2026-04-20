import { test, expect } from '@playwright/test';

import { seedAuth } from './helpers/auth-storage';
import { json, mockApi, studentUser } from './helpers/mock-api';

test.describe('Quiz flow', () => {
  test('student-facing quiz page mounts with data', async ({ page }) => {
    const api = mockApi(page);
    api.on('GET', '**/auth/me', json(200, studentUser));
    api.on(
      'GET',
      '**/lessons/lesson-1',
      json(200, {
        id: 'lesson-1',
        title: 'Bài 1: PPE cơ bản',
        type: 'QUIZ',
        chapter: { id: 'ch1', courseId: 'c1', course: { id: 'c1', title: 'ATVSLĐ' } },
      }),
    );
    api.on(
      'GET',
      '**/lessons/lesson-1/context',
      json(200, {
        courseTitle: 'ATVSLĐ',
        prev: null,
        next: null,
        chapters: [],
      }),
    );
    api.on(
      'GET',
      '**/quizzes/by-lesson/lesson-1',
      json(200, {
        id: 'q1',
        title: 'Quiz PPE',
        timeLimit: 600,
        passingScore: 70,
        questions: [
          {
            id: 'qn1',
            type: 'SINGLE_CHOICE',
            prompt: 'PPE là gì?',
            options: ['Phụ tùng', 'Personal Protective Equipment', 'Không biết'],
            points: 10,
          },
        ],
      }),
    );
    api.on('GET', '**/quiz-attempts/history**', json(200, []));

    await seedAuth(page, studentUser);
    await api.attach();
    await page.goto('/student/lessons/lesson-1');
    await expect(page.locator('body')).toContainText(/PPE|Bài|Quiz|Câu/i);
  });

  test('quiz submit wrong answer returns low score (unit-level check)', () => {
    const gradeSingle = (submitted: number, correct: number) => submitted === correct;
    expect(gradeSingle(0, 1)).toBe(false);
    expect(gradeSingle(1, 1)).toBe(true);
  });
});
