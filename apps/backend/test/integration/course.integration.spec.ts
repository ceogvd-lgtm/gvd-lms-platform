/**
 * Integration tests for the course lifecycle:
 *
 *   INSTRUCTOR creates (DRAFT) → submits (PENDING_REVIEW) → ADMIN approves
 *   (PUBLISHED) → auto-enroll by department fires → student sees course
 *   → student completes lessons → quiz submission graded server-side
 *   → certificate check runs
 *
 * Wires real CoursesService + EnrollmentsService + QuizAttemptsService with
 * stubbed Prisma/Audit/Storage/Notifications. The goal is to catch cross-
 * module regressions that unit specs miss (e.g. the APPROVE hook forgets
 * to call autoEnrollByDepartment).
 */
import { CourseStatus, QuestionType, Role } from '@lms/database';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../src/common/audit/audit.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { StorageService } from '../../src/common/storage/storage.service';
import { CoursesService } from '../../src/modules/courses/courses.service';
import { EnrollmentsService } from '../../src/modules/enrollments/enrollments.service';
import {
  QuizAttemptsService,
  gradeAnswer,
} from '../../src/modules/quiz-attempts/quiz-attempts.service';
import { XpService } from '../../src/modules/students/xp.service';

import { createPrismaStub } from './helpers/prisma-stub';

type Ctx = {
  prisma: ReturnType<typeof createPrismaStub>;
  courses: CoursesService;
  enrollments: EnrollmentsService;
  quizAttempts: QuizAttemptsService;
  audit: { log: jest.Mock };
  storage: { remove: jest.Mock; removeMany: jest.Mock; listKeys: jest.Mock };
};

async function build(): Promise<Ctx> {
  const prisma = createPrismaStub();
  const audit = { log: jest.fn() };
  const storage = {
    remove: jest.fn(),
    removeMany: jest.fn(),
    listKeys: jest.fn().mockResolvedValue([]),
  };
  const xp = { award: jest.fn().mockResolvedValue(undefined) };

  const mod = await Test.createTestingModule({
    providers: [
      CoursesService,
      EnrollmentsService,
      QuizAttemptsService,
      { provide: PrismaService, useValue: prisma },
      { provide: AuditService, useValue: audit },
      { provide: StorageService, useValue: storage },
      { provide: XpService, useValue: xp },
    ],
  }).compile();

  return {
    prisma,
    courses: mod.get(CoursesService),
    enrollments: mod.get(EnrollmentsService),
    quizAttempts: mod.get(QuizAttemptsService),
    audit,
    storage,
  };
}

const adminActor = { id: 'admin-1', role: Role.ADMIN };
const instructorActor = { id: 'inst-1', role: Role.INSTRUCTOR };
const studentActor = { id: 'stu-1', role: Role.STUDENT };

describe('Course lifecycle integration', () => {
  let ctx: Ctx;

  beforeEach(async () => {
    ctx = await build();
  });

  // ============================================================
  // APPROVE → AUTO-ENROLL HOOK
  // ============================================================
  describe('APPROVE triggers auto-enroll by department', () => {
    it('publishes course + enrolls all students of the course department', async () => {
      const courseId = 'course-1';
      const deptId = 'dept-1';

      // Course lookup before updateStatus
      ctx.prisma.client.course.findUnique
        .mockResolvedValueOnce({
          id: courseId,
          title: 'An toàn lao động',
          instructorId: 'inst-1',
          status: CourseStatus.PENDING_REVIEW,
          isDeleted: false,
          publishedAt: null,
        })
        // Second call inside autoEnrollByDepartment (subject → department)
        .mockResolvedValueOnce({
          id: courseId,
          title: 'An toàn lao động',
          subject: { department: { id: deptId, name: 'ATVSLĐ' } },
        });

      ctx.prisma.client.course.update.mockResolvedValue({
        id: courseId,
        status: CourseStatus.PUBLISHED,
      });

      // 3 students in the department
      ctx.prisma.client.user.findMany.mockResolvedValue([
        { id: 'stu-1' },
        { id: 'stu-2' },
        { id: 'stu-3' },
      ]);

      ctx.prisma.client.courseEnrollment.createMany.mockResolvedValue({ count: 3 });

      const res = await ctx.courses.updateStatus(
        adminActor,
        courseId,
        { action: 'APPROVE' },
        { ip: '127.0.0.1' },
      );

      expect(res.status).toBe(CourseStatus.PUBLISHED);
      expect(res.autoEnroll).toBeDefined();
      expect(res.autoEnroll?.enrolled).toBe(3);
      expect(res.autoEnroll?.total).toBe(3);
      expect(res.autoEnroll?.departmentName).toBe('ATVSLĐ');

      // createMany must have been called with skipDuplicates
      expect(ctx.prisma.client.courseEnrollment.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true }),
      );

      // Audit must record both COURSE_APPROVE and AUTO_ENROLL_ON_APPROVE
      const actions = ctx.audit.log.mock.calls.map((c) => c[0].action);
      expect(actions).toContain('COURSE_APPROVE');
      expect(actions).toContain('AUTO_ENROLL_ON_APPROVE');
    });

    it('SUBMIT does NOT trigger auto-enroll (only APPROVE does)', async () => {
      ctx.prisma.client.course.findUnique.mockResolvedValue({
        id: 'c1',
        title: 'X',
        instructorId: 'inst-1',
        status: CourseStatus.DRAFT,
        isDeleted: false,
      });
      ctx.prisma.client.course.update.mockResolvedValue({
        id: 'c1',
        status: CourseStatus.PENDING_REVIEW,
      });

      await ctx.courses.updateStatus(
        instructorActor,
        'c1',
        { action: 'SUBMIT' },
        { ip: '127.0.0.1' },
      );

      expect(ctx.prisma.client.courseEnrollment.createMany).not.toHaveBeenCalled();
    });

    it('course without department → auto-enroll returns zero, does not crash', async () => {
      const courseId = 'c-no-dept';
      ctx.prisma.client.course.findUnique
        .mockResolvedValueOnce({
          id: courseId,
          title: 'Orphan',
          instructorId: 'inst-1',
          status: CourseStatus.PENDING_REVIEW,
          isDeleted: false,
        })
        .mockResolvedValueOnce({
          id: courseId,
          title: 'Orphan',
          subject: null,
        });

      ctx.prisma.client.course.update.mockResolvedValue({
        id: courseId,
        status: CourseStatus.PUBLISHED,
      });

      const res = await ctx.courses.updateStatus(
        adminActor,
        courseId,
        { action: 'APPROVE' },
        { ip: '127.0.0.1' },
      );

      expect(res.status).toBe(CourseStatus.PUBLISHED);
      expect(res.autoEnroll?.enrolled).toBe(0);
      expect(ctx.prisma.client.user.findMany).not.toHaveBeenCalled();
    });

    it('already-enrolled students are skipped (idempotent)', async () => {
      ctx.prisma.client.course.findUnique
        .mockResolvedValueOnce({
          id: 'c1',
          title: 'T',
          instructorId: 'inst-1',
          status: CourseStatus.PENDING_REVIEW,
          isDeleted: false,
        })
        .mockResolvedValueOnce({
          id: 'c1',
          title: 'T',
          subject: { department: { id: 'd1', name: 'D1' } },
        });
      ctx.prisma.client.course.update.mockResolvedValue({
        id: 'c1',
        status: CourseStatus.PUBLISHED,
      });
      ctx.prisma.client.user.findMany.mockResolvedValue([
        { id: 's1' },
        { id: 's2' },
        { id: 's3' },
        { id: 's4' },
      ]);
      // Only 1 actually created; 3 were already enrolled
      ctx.prisma.client.courseEnrollment.createMany.mockResolvedValue({ count: 1 });

      const res = await ctx.courses.updateStatus(
        adminActor,
        'c1',
        { action: 'APPROVE' },
        { ip: '127.0.0.1' },
      );

      expect(res.autoEnroll?.enrolled).toBe(1);
      expect(res.autoEnroll?.skipped).toBe(3);
      expect(res.autoEnroll?.total).toBe(4);
    });

    it('INSTRUCTOR cannot APPROVE (only ADMIN+ can)', async () => {
      ctx.prisma.client.course.findUnique.mockResolvedValueOnce({
        id: 'c1',
        title: 'X',
        instructorId: 'inst-1',
        status: CourseStatus.PENDING_REVIEW,
        isDeleted: false,
      });

      await expect(
        ctx.courses.updateStatus(instructorActor, 'c1', { action: 'APPROVE' }, { ip: '127.0.0.1' }),
      ).rejects.toThrow(/admin/i);
    });
  });

  // ============================================================
  // STUDENT ENROLL FLOW
  // ============================================================
  describe('student enrollment', () => {
    it('student can self-enroll into a PUBLISHED course', async () => {
      ctx.prisma.client.course.findUnique.mockResolvedValue({
        id: 'c1',
        status: CourseStatus.PUBLISHED,
        isDeleted: false,
      });
      ctx.prisma.client.courseEnrollment.create.mockResolvedValue({
        id: 'enr-1',
        courseId: 'c1',
        studentId: 'stu-1',
      });

      const res = await ctx.enrollments.enroll(studentActor, { courseId: 'c1' });
      expect(res.id).toBe('enr-1');
    });

    it('student cannot self-enroll into a DRAFT course', async () => {
      ctx.prisma.client.course.findUnique.mockResolvedValue({
        id: 'c1',
        status: CourseStatus.DRAFT,
        isDeleted: false,
      });

      await expect(ctx.enrollments.enroll(studentActor, { courseId: 'c1' })).rejects.toThrow(
        /xuất bản/,
      );
    });

    it('student cannot enroll someone else', async () => {
      ctx.prisma.client.course.findUnique.mockResolvedValue({
        id: 'c1',
        status: CourseStatus.PUBLISHED,
        isDeleted: false,
      });

      await expect(
        ctx.enrollments.enroll(studentActor, { courseId: 'c1', studentId: 'someone-else' }),
      ).rejects.toThrow(/ADMIN/);
    });

    it('duplicate enrollment → 409', async () => {
      ctx.prisma.client.course.findUnique.mockResolvedValue({
        id: 'c1',
        status: CourseStatus.PUBLISHED,
        isDeleted: false,
      });
      const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
      ctx.prisma.client.courseEnrollment.create.mockRejectedValue(p2002);

      await expect(ctx.enrollments.enroll(studentActor, { courseId: 'c1' })).rejects.toThrow(
        /ghi danh/,
      );
    });
  });

  // ============================================================
  // QUIZ GRADING — SERVER-SIDE, NOT AUTO-PASS
  // ============================================================
  describe('quiz grading', () => {
    it('SINGLE_CHOICE: correct answer returns true', () => {
      expect(gradeAnswer(QuestionType.SINGLE_CHOICE, 2, 2)).toBe(true);
    });

    it('SINGLE_CHOICE: wrong answer returns false', () => {
      expect(gradeAnswer(QuestionType.SINGLE_CHOICE, 1, 2)).toBe(false);
    });

    it('MULTI_CHOICE: identical sets match regardless of order', () => {
      expect(gradeAnswer(QuestionType.MULTI_CHOICE, [2, 0, 1], [0, 1, 2])).toBe(true);
    });

    it('MULTI_CHOICE: subset does NOT match', () => {
      expect(gradeAnswer(QuestionType.MULTI_CHOICE, [0, 1], [0, 1, 2])).toBe(false);
    });

    it('FILL_BLANK: case + whitespace insensitive', () => {
      expect(gradeAnswer(QuestionType.FILL_BLANK, '  PPE ', 'ppe')).toBe(true);
    });

    it('FILL_BLANK: array of acceptable answers', () => {
      expect(gradeAnswer(QuestionType.FILL_BLANK, 'helmet', ['mũ', 'helmet'])).toBe(true);
    });

    it('TRUE_FALSE: index comparison', () => {
      expect(gradeAnswer(QuestionType.TRUE_FALSE, 0, 0)).toBe(true);
      expect(gradeAnswer(QuestionType.TRUE_FALSE, 0, 1)).toBe(false);
    });

    it('all-correct submission yields high score (hand-graded)', () => {
      // Simulate a 10-question quiz — all correct
      const results = [
        gradeAnswer(QuestionType.SINGLE_CHOICE, 0, 0),
        gradeAnswer(QuestionType.SINGLE_CHOICE, 1, 1),
        gradeAnswer(QuestionType.MULTI_CHOICE, [0, 1], [0, 1]),
        gradeAnswer(QuestionType.TRUE_FALSE, 0, 0),
        gradeAnswer(QuestionType.FILL_BLANK, 'ppe', 'PPE'),
      ];
      const passed = results.filter(Boolean).length;
      expect(passed).toBe(results.length);
    });

    it('all-wrong submission yields low score', () => {
      const results = [
        gradeAnswer(QuestionType.SINGLE_CHOICE, 0, 1),
        gradeAnswer(QuestionType.SINGLE_CHOICE, 2, 1),
        gradeAnswer(QuestionType.MULTI_CHOICE, [0], [0, 1]),
        gradeAnswer(QuestionType.TRUE_FALSE, 0, 1),
        gradeAnswer(QuestionType.FILL_BLANK, 'wrong', 'right'),
      ];
      const passed = results.filter(Boolean).length;
      expect(passed).toBe(0);
    });
  });

  // ============================================================
  // WITHDRAW — phase 18 addition
  // ============================================================
  describe('instructor WITHDRAW', () => {
    it('owner can withdraw PENDING_REVIEW → DRAFT', async () => {
      ctx.prisma.client.course.findUnique.mockResolvedValue({
        id: 'c1',
        title: 'X',
        instructorId: 'inst-1',
        status: CourseStatus.PENDING_REVIEW,
        isDeleted: false,
      });
      ctx.prisma.client.course.update.mockResolvedValue({
        id: 'c1',
        status: CourseStatus.DRAFT,
      });

      const res = await ctx.courses.updateStatus(
        instructorActor,
        'c1',
        { action: 'WITHDRAW' },
        { ip: '127.0.0.1' },
      );
      expect(res.status).toBe(CourseStatus.DRAFT);
      // NO auto-enroll on withdraw
      expect(ctx.prisma.client.courseEnrollment.createMany).not.toHaveBeenCalled();
    });

    it('non-owner instructor cannot withdraw', async () => {
      ctx.prisma.client.course.findUnique.mockResolvedValue({
        id: 'c1',
        instructorId: 'other-inst',
        status: CourseStatus.PENDING_REVIEW,
        isDeleted: false,
      });

      await expect(
        ctx.courses.updateStatus(
          instructorActor,
          'c1',
          { action: 'WITHDRAW' },
          { ip: '127.0.0.1' },
        ),
      ).rejects.toThrow(/giảng viên sở hữu/);
    });
  });
});
