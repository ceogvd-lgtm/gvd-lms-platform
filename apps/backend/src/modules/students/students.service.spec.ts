import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';

import { StudentsService } from './students.service';
import { XpService } from './xp.service';

/**
 * Unit tests for the Phase 14 students service.
 *
 * Primary coverage:
 *   - getDashboard returns the expected top-level shape
 *   - getMyLearning lock logic: lesson N locked iff lesson N-1 not COMPLETED
 */
describe('StudentsService', () => {
  let service: StudentsService;
  let prisma: {
    client: {
      user: { findUnique: jest.Mock };
      courseEnrollment: { findMany: jest.Mock };
      chapter: { findMany: jest.Mock };
      lesson: { findMany: jest.Mock };
      lessonProgress: { findMany: jest.Mock };
      quizAttempt: { findMany: jest.Mock };
    };
  };
  let xp: { getForStudent: jest.Mock };

  beforeEach(async () => {
    prisma = {
      client: {
        user: { findUnique: jest.fn() },
        courseEnrollment: { findMany: jest.fn() },
        chapter: { findMany: jest.fn() },
        lesson: { findMany: jest.fn() },
        lessonProgress: { findMany: jest.fn() },
        quizAttempt: { findMany: jest.fn() },
      },
    };
    xp = { getForStudent: jest.fn().mockResolvedValue({ totalXP: 40, level: 1 }) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: XpService, useValue: xp },
      ],
    }).compile();
    service = mod.get(StudentsService);
  });

  it('getDashboard: returns the documented top-level shape', async () => {
    prisma.client.user.findUnique.mockResolvedValue({
      id: 'S1',
      name: 'Học viên',
      email: 's@a.b',
      avatar: null,
      role: 'STUDENT',
    });
    prisma.client.courseEnrollment.findMany.mockResolvedValue([]); // no enrollments
    prisma.client.chapter.findMany.mockResolvedValue([]); // no chapters
    prisma.client.lesson.findMany.mockResolvedValue([]); // no lessons
    prisma.client.lessonProgress.findMany.mockResolvedValue([]); // no progress + streak window
    prisma.client.quizAttempt.findMany.mockResolvedValue([]); // streak + recent

    const res = await service.getDashboard('S1');

    expect(res.user).toEqual(expect.objectContaining({ name: 'Học viên' }));
    expect(res.xp).toEqual({ totalXP: 40, level: 1 });
    expect(res.overallProgress).toEqual({
      percent: 0,
      completedLessons: 0,
      totalLessons: 0,
    });
    expect(res.streak).toEqual(expect.objectContaining({ current: expect.any(Number) }));
    expect(res.enrolledCourses).toEqual([]);
    expect(res.nextLesson).toBeNull();
    expect(res.recentScores).toEqual([]);
  });

  it('getMyLearning: locks lesson N when lesson N-1 is not COMPLETED', async () => {
    const L1 = { id: 'L1', title: 'Lesson 1', type: 'THEORY', order: 0, chapterId: 'C1' };
    const L2 = { id: 'L2', title: 'Lesson 2', type: 'THEORY', order: 1, chapterId: 'C1' };
    const L3 = { id: 'L3', title: 'Lesson 3', type: 'THEORY', order: 2, chapterId: 'C1' };

    prisma.client.courseEnrollment.findMany.mockResolvedValue([
      {
        id: 'E1',
        courseId: 'CRS1',
        studentId: 'S1',
        enrolledAt: new Date(),
        completedAt: null,
        course: {
          id: 'CRS1',
          title: 'Course',
          thumbnailUrl: null,
          isDeleted: false,
          subject: {
            id: 'SUB1',
            name: 'Subject',
            department: { id: 'D1', name: 'Dept' },
          },
          chapters: [
            {
              id: 'C1',
              title: 'Ch 1',
              order: 0,
              lessons: [
                { ...L1, theoryContent: { duration: 600 } },
                { ...L2, theoryContent: { duration: 600 } },
                { ...L3, theoryContent: { duration: 600 } },
              ],
            },
          ],
        },
      },
    ]);
    prisma.client.lessonProgress.findMany.mockResolvedValue([
      {
        lessonId: 'L1',
        studentId: 'S1',
        status: 'COMPLETED',
        score: 80,
      },
      // L2 has a progress row but NOT completed → L3 should still be locked
      {
        lessonId: 'L2',
        studentId: 'S1',
        status: 'IN_PROGRESS',
        score: null,
      },
    ]);

    const res = await service.getMyLearning('S1');
    const lessons = res[0]!.subjects[0]!.courses[0]!.chapters[0]!.lessons;

    expect(lessons[0]!.isLocked).toBe(false); // first lesson never locked
    expect(lessons[1]!.isLocked).toBe(false); // L1 is COMPLETED → L2 unlocked
    expect(lessons[2]!.isLocked).toBe(true); //  L2 IN_PROGRESS (not completed) → L3 locked
  });

  it('getMyLearning: returns empty array when student has no enrollments', async () => {
    prisma.client.courseEnrollment.findMany.mockResolvedValue([]);
    prisma.client.lessonProgress.findMany.mockResolvedValue([]);

    const res = await service.getMyLearning('S1');
    expect(res).toEqual([]);
  });
});
