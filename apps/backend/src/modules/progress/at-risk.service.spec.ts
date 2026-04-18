import { Role } from '@lms/database';
import { ForbiddenException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailService } from '../notifications/email.service';
import { NotificationsService } from '../notifications/notifications.service';

import { AT_RISK, AtRiskService } from './at-risk.service';

/**
 * Phase 15 — Unit tests for the AT-RISK detector.
 *
 * Four flagging conditions; each test sets up a single enrollment in
 * the state the rule is meant to catch and confirms the correct
 * reason code appears. A fifth test sets up a healthy enrollment and
 * verifies NO flag.
 */
describe('AtRiskService', () => {
  let service: AtRiskService;
  let prisma: {
    client: {
      courseEnrollment: { findMany: jest.Mock };
      quizAttempt: { findMany: jest.Mock };
      practiceAttempt: { findFirst: jest.Mock };
      lessonProgress: { aggregate: jest.Mock };
    };
  };
  const notifications = { create: jest.fn() };
  const email = { sendAtRiskAlert: jest.fn(), enqueue: jest.fn() };
  const audit = { log: jest.fn() };

  beforeEach(async () => {
    prisma = {
      client: {
        courseEnrollment: { findMany: jest.fn() },
        quizAttempt: { findMany: jest.fn().mockResolvedValue([]) },
        practiceAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
        lessonProgress: { aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }) },
      },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        AtRiskService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: EmailService, useValue: email },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = mod.get(AtRiskService);
  });

  const DAY = 24 * 60 * 60 * 1000;

  function makeEnrollment(overrides: {
    progressPercent?: number;
    daysAgoEnrolled?: number;
    daysAgoActive?: number;
  }): unknown {
    return {
      studentId: 'student-1',
      courseId: 'course-1',
      enrolledAt: new Date(Date.now() - (overrides.daysAgoEnrolled ?? 1) * DAY),
      lastActiveAt: new Date(Date.now() - (overrides.daysAgoActive ?? 0) * DAY),
      progressPercent: overrides.progressPercent ?? 50,
      student: { id: 'student-1', name: 'Alice', email: 'alice@test', avatar: null },
      course: { id: 'course-1', title: 'Course 1' },
    };
  }

  // =====================================================
  // 1. SLOW_START — progress<30% AND >=7 days enrolled
  // =====================================================
  it('flags SLOW_START when progress<30% after >=7 days', async () => {
    prisma.client.courseEnrollment.findMany.mockResolvedValue([
      makeEnrollment({ progressPercent: 10, daysAgoEnrolled: 10, daysAgoActive: 1 }),
    ]);

    const rows = await service.detectAtRisk({ id: 'admin', role: Role.ADMIN });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reasons).toContain('SLOW_START');
  });

  it('does NOT flag SLOW_START if still in grace period (<7 days)', async () => {
    prisma.client.courseEnrollment.findMany.mockResolvedValue([
      makeEnrollment({ progressPercent: 10, daysAgoEnrolled: 3, daysAgoActive: 0 }),
    ]);
    const rows = await service.detectAtRisk({ id: 'admin', role: Role.ADMIN });
    expect(rows).toHaveLength(0);
  });

  // =====================================================
  // 2. INACTIVE — lastActiveAt older than 5 days
  // =====================================================
  it('flags INACTIVE when lastActiveAt > 5 days ago', async () => {
    prisma.client.courseEnrollment.findMany.mockResolvedValue([
      makeEnrollment({ progressPercent: 60, daysAgoEnrolled: 20, daysAgoActive: 7 }),
    ]);

    const rows = await service.detectAtRisk({ id: 'admin', role: Role.ADMIN });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reasons).toContain('INACTIVE');
    expect(rows[0]!.reasons).not.toContain('SLOW_START');
  });

  // =====================================================
  // 3. LOW_SCORE — avg<50% across >=3 quiz attempts
  // =====================================================
  it('flags LOW_SCORE when avg quiz score < 50% with >=3 attempts', async () => {
    prisma.client.courseEnrollment.findMany.mockResolvedValue([
      makeEnrollment({ progressPercent: 60, daysAgoEnrolled: 20, daysAgoActive: 1 }),
    ]);
    prisma.client.quizAttempt.findMany.mockResolvedValue([
      { score: 30, maxScore: 100 },
      { score: 40, maxScore: 100 },
      { score: 35, maxScore: 100 },
    ]);

    const rows = await service.detectAtRisk({ id: 'admin', role: Role.ADMIN });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reasons).toEqual(['LOW_SCORE']);
  });

  it('does NOT flag LOW_SCORE with fewer than 3 attempts', async () => {
    prisma.client.courseEnrollment.findMany.mockResolvedValue([
      makeEnrollment({ progressPercent: 60, daysAgoEnrolled: 20, daysAgoActive: 1 }),
    ]);
    prisma.client.quizAttempt.findMany.mockResolvedValue([
      { score: 10, maxScore: 100 },
      { score: 20, maxScore: 100 },
    ]);
    const rows = await service.detectAtRisk({ id: 'admin', role: Role.ADMIN });
    expect(rows).toHaveLength(0);
  });

  // =====================================================
  // 4. SAFETY_VIOLATION — practice with hasCriticalViolation=true
  // =====================================================
  it('flags SAFETY_VIOLATION when a practice attempt has a critical violation', async () => {
    prisma.client.courseEnrollment.findMany.mockResolvedValue([
      makeEnrollment({ progressPercent: 70, daysAgoEnrolled: 20, daysAgoActive: 1 }),
    ]);
    prisma.client.practiceAttempt.findFirst.mockResolvedValue({ id: 'pa-1' });

    const rows = await service.detectAtRisk({ id: 'admin', role: Role.ADMIN });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reasons).toContain('SAFETY_VIOLATION');
  });

  // =====================================================
  // 5. Healthy student — no flag
  // =====================================================
  it('does NOT flag a healthy student (good progress, recent activity, no violations)', async () => {
    prisma.client.courseEnrollment.findMany.mockResolvedValue([
      makeEnrollment({ progressPercent: 80, daysAgoEnrolled: 20, daysAgoActive: 1 }),
    ]);
    const rows = await service.detectAtRisk({ id: 'admin', role: Role.ADMIN });
    expect(rows).toHaveLength(0);
  });

  // =====================================================
  // Authz — STUDENT is forbidden from running this
  // =====================================================
  it('rejects STUDENT actor', async () => {
    await expect(service.detectAtRisk({ id: 'u1', role: Role.STUDENT })).rejects.toThrow(
      ForbiddenException,
    );
  });

  // Sanity: the thresholds constant is wired up and reasonable
  it('thresholds are exported with expected values', () => {
    expect(AT_RISK.PROGRESS_BELOW).toBe(30);
    expect(AT_RISK.PROGRESS_GRACE_DAYS).toBe(7);
    expect(AT_RISK.INACTIVE_DAYS).toBe(5);
    expect(AT_RISK.AVG_SCORE_BELOW).toBe(50);
    expect(AT_RISK.MIN_ATTEMPTS_FOR_SCORE).toBe(3);
  });
});
