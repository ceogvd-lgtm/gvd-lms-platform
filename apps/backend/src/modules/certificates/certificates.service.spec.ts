import { CertificateStatus, Role } from '@lms/database';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import { CertificateCriteriaService } from './certificate-criteria.service';
import { CertificatesService } from './certificates.service';

describe('CertificatesService', () => {
  let service: CertificatesService;
  let prismaMock: {
    client: {
      certificate: {
        count: jest.Mock;
        findMany: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
        groupBy: jest.Mock;
      };
      course: {
        findMany: jest.Mock;
      };
    };
  };
  let auditMock: { log: jest.Mock };

  const ADMIN = { id: 'u-admin', role: Role.ADMIN };
  const META = { ip: '127.0.0.1' };

  beforeEach(async () => {
    prismaMock = {
      client: {
        certificate: {
          count: jest.fn(),
          findMany: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
          groupBy: jest.fn().mockResolvedValue([]),
        },
        course: { findMany: jest.fn().mockResolvedValue([]) },
      },
    };
    auditMock = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificatesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<CertificatesService>(CertificatesService);
  });

  // =====================================================
  // list
  // =====================================================
  describe('list', () => {
    beforeEach(() => {
      prismaMock.client.certificate.count.mockResolvedValue(0);
      prismaMock.client.certificate.findMany.mockResolvedValue([]);
    });

    it('combines status, courseId, and q filters', async () => {
      await service.list({
        status: CertificateStatus.ACTIVE,
        courseId: 'c1',
        q: 'CRT',
        page: 1,
        limit: 20,
      });
      const call = prismaMock.client.certificate.findMany.mock.calls[0]![0];
      expect(call.where.status).toBe(CertificateStatus.ACTIVE);
      expect(call.where.courseId).toBe('c1');
      expect(call.where.OR).toHaveLength(4);
    });
  });

  // =====================================================
  // findOne
  // =====================================================
  describe('findOne', () => {
    it('returns certificate with student + course detail', async () => {
      prismaMock.client.certificate.findUnique.mockResolvedValue({
        id: 'cert-1',
        code: 'CRT-001',
        student: { id: 's1', name: 'Alice', email: 'a@b.c' },
        course: { id: 'c1', title: 'Safety' },
      });
      const result = await service.findOne('cert-1');
      expect(result.id).toBe('cert-1');
    });

    it('throws NotFoundException when certificate is missing', async () => {
      prismaMock.client.certificate.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // =====================================================
  // revoke
  // =====================================================
  describe('revoke', () => {
    it('sets status=REVOKED, revokedAt, revokedReason and logs audit', async () => {
      prismaMock.client.certificate.findUnique.mockResolvedValue({
        id: 'c1',
        code: 'CRT-001',
        status: CertificateStatus.ACTIVE,
        studentId: 's1',
        courseId: 'co1',
      });
      prismaMock.client.certificate.update.mockResolvedValue({
        id: 'c1',
        status: CertificateStatus.REVOKED,
      });

      await service.revoke(ADMIN, 'c1', { reason: 'Gian lận' }, META);

      expect(prismaMock.client.certificate.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: {
          status: CertificateStatus.REVOKED,
          revokedAt: expect.any(Date),
          revokedReason: 'Gian lận',
        },
      });
      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CERTIFICATE_REVOKE',
          targetId: 'c1',
          newValue: expect.objectContaining({ reason: 'Gian lận' }),
        }),
      );
    });

    it('throws BadRequestException when already revoked', async () => {
      prismaMock.client.certificate.findUnique.mockResolvedValue({
        id: 'c1',
        status: CertificateStatus.REVOKED,
      });
      await expect(service.revoke(ADMIN, 'c1', { reason: 'x' }, META)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when certificate missing', async () => {
      prismaMock.client.certificate.findUnique.mockResolvedValue(null);
      await expect(service.revoke(ADMIN, 'missing', { reason: 'x' }, META)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =====================================================
  // getPassRateByCourse
  // =====================================================
  describe('getPassRateByCourse', () => {
    it('computes pass rate = active certificates / enrollments', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([
        {
          id: 'c1',
          title: 'Safety 101',
          _count: { enrollments: 10, certificates: 7 },
        },
        {
          id: 'c2',
          title: 'Welding',
          _count: { enrollments: 4, certificates: 2 },
        },
      ]);
      prismaMock.client.certificate.groupBy.mockResolvedValue([
        { courseId: 'c1', _count: { _all: 7 } },
        { courseId: 'c2', _count: { _all: 2 } },
      ]);

      const res = await service.getPassRateByCourse();
      expect(res.courses[0]).toEqual(
        expect.objectContaining({
          courseId: 'c1',
          enrolled: 10,
          passed: 7,
          passRate: 70,
        }),
      );
      expect(res.courses[1]!.passRate).toBe(50);
    });

    it('returns 0% pass rate for courses with no enrollments', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([
        { id: 'c1', title: 'New', _count: { enrollments: 0, certificates: 0 } },
      ]);
      const res = await service.getPassRateByCourse();
      expect(res.courses[0]!.passRate).toBe(0);
    });
  });

  // =====================================================
  // getStatsSummary
  // =====================================================
  describe('getStatsSummary', () => {
    it('returns per-status counts and avg pass rate across enrolled courses', async () => {
      prismaMock.client.certificate.count
        .mockResolvedValueOnce(50) // active
        .mockResolvedValueOnce(5) // revoked
        .mockResolvedValueOnce(2) // expired
        .mockResolvedValueOnce(57); // total
      prismaMock.client.course.findMany.mockResolvedValue([
        { id: 'c1', title: 'A', _count: { enrollments: 10, certificates: 6 } },
        { id: 'c2', title: 'B', _count: { enrollments: 0, certificates: 0 } }, // excluded
        { id: 'c3', title: 'C', _count: { enrollments: 5, certificates: 4 } },
      ]);
      prismaMock.client.certificate.groupBy.mockResolvedValue([
        { courseId: 'c1', _count: { _all: 6 } },
        { courseId: 'c3', _count: { _all: 4 } },
      ]);

      const summary = await service.getStatsSummary();
      expect(summary.total).toBe(57);
      expect(summary.active).toBe(50);
      expect(summary.revoked).toBe(5);
      expect(summary.expired).toBe(2);
      // (60 + 80) / 2 = 70
      expect(summary.avgPassRate).toBe(70);
    });
  });

  // =====================================================
  // Phase 16 — calculateGrade (static, no DI)
  // =====================================================
  describe('calculateGrade', () => {
    const thresholds = { excellent: 90, good: 80, pass: 70 };

    it('returns "Xuất sắc" for score 95', () => {
      expect(CertificatesService.calculateGrade(95, thresholds)).toBe('Xuất sắc');
    });
    it('returns "Giỏi" for score 83', () => {
      expect(CertificatesService.calculateGrade(83, thresholds)).toBe('Giỏi');
    });
    it('returns "Đạt" for score 72', () => {
      expect(CertificatesService.calculateGrade(72, thresholds)).toBe('Đạt');
    });
    it('returns null when score is below pass threshold', () => {
      expect(CertificatesService.calculateGrade(65, thresholds)).toBeNull();
    });
    it('respects exact threshold boundary (score===excellent → Xuất sắc)', () => {
      expect(CertificatesService.calculateGrade(90, thresholds)).toBe('Xuất sắc');
    });
  });

  // =====================================================
  // Phase 16 — checkAndIssueCertificate
  // =====================================================
  describe('checkAndIssueCertificate', () => {
    let svc: CertificatesService;
    let prisma2: typeof prismaMock.client & {
      courseEnrollment: { findUnique: jest.Mock };
      quizAttempt: { aggregate: jest.Mock };
      practiceAttempt: { aggregate: jest.Mock; count: jest.Mock };
      lessonProgress: { count: jest.Mock };
      certificate: typeof prismaMock.client.certificate & {
        findFirst: jest.Mock;
        create: jest.Mock;
      };
    };
    let criteriaMock: { get: jest.Mock };

    beforeEach(async () => {
      prisma2 = {
        ...prismaMock.client,
        certificate: {
          ...prismaMock.client.certificate,
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: 'new-cert',
            code: 'NEW-CODE',
            studentId: 's-1',
            courseId: 'c-1',
            grade: 'Xuất sắc',
            finalScore: 95,
            issuedAt: new Date(),
            status: CertificateStatus.ACTIVE,
          }),
        },
        courseEnrollment: {
          findUnique: jest.fn().mockResolvedValue({ progressPercent: 100, completedAt: null }),
        },
        quizAttempt: {
          aggregate: jest.fn().mockResolvedValue({
            _sum: { score: 95, maxScore: 100 },
            _count: { _all: 1 },
          }),
        },
        practiceAttempt: {
          aggregate: jest.fn().mockResolvedValue({
            _sum: { score: 0, maxScore: 0 },
            _count: { _all: 0 },
          }),
          count: jest.fn().mockResolvedValue(0),
        },
        lessonProgress: { count: jest.fn().mockResolvedValue(0) },
      } as never;

      criteriaMock = {
        get: jest.fn().mockResolvedValue({
          minPassScore: 70,
          minProgress: 100,
          minPracticeScore: 0,
          noSafetyViolation: true,
          requiredLessons: [],
          validityMonths: null,
          gradeThresholds: { excellent: 90, good: 80, pass: 70 },
          customCriteria: null,
          exists: true,
        }),
      };

      const mod: TestingModule = await Test.createTestingModule({
        providers: [
          CertificatesService,
          { provide: PrismaService, useValue: { client: prisma2 } },
          { provide: AuditService, useValue: { log: jest.fn() } },
          {
            provide: CertificateCriteriaService,
            useValue: criteriaMock,
          },
        ],
      }).compile();
      svc = mod.get(CertificatesService);
    });

    it('issues cert when all criteria are met', async () => {
      const result = await svc.checkAndIssueCertificate('s-1', 'c-1');
      expect(result.issued).toBe(true);
      expect(result.grade).toBe('Xuất sắc');
      expect(result.finalScore).toBe(95);
      expect(prisma2.certificate.create).toHaveBeenCalled();
    });

    it('does NOT issue when progressPercent < minProgress', async () => {
      prisma2.courseEnrollment.findUnique.mockResolvedValue({
        progressPercent: 60,
        completedAt: null,
      });
      const result = await svc.checkAndIssueCertificate('s-1', 'c-1');
      expect(result.issued).toBe(false);
      expect(result.reason).toContain('progress');
      expect(prisma2.certificate.create).not.toHaveBeenCalled();
    });

    it('does NOT issue when student has a critical safety violation', async () => {
      prisma2.practiceAttempt.count.mockResolvedValue(1);
      const result = await svc.checkAndIssueCertificate('s-1', 'c-1');
      expect(result.issued).toBe(false);
      expect(result.reason).toContain('safety');
      expect(prisma2.certificate.create).not.toHaveBeenCalled();
    });

    it('does NOT re-issue when student already has an ACTIVE cert (idempotent)', async () => {
      prisma2.certificate.findFirst.mockResolvedValue({ id: 'existing' });
      const result = await svc.checkAndIssueCertificate('s-1', 'c-1');
      expect(result.issued).toBe(false);
      expect(result.reason).toBe('ALREADY_ISSUED');
    });

    it('does NOT issue when a required lesson is not COMPLETED', async () => {
      criteriaMock.get.mockResolvedValue({
        minPassScore: 70,
        minProgress: 100,
        minPracticeScore: 0,
        noSafetyViolation: true,
        requiredLessons: ['l-a', 'l-b'],
        validityMonths: null,
        gradeThresholds: { excellent: 90, good: 80, pass: 70 },
        customCriteria: null,
        exists: true,
      });
      prisma2.lessonProgress.count.mockResolvedValue(1); // only 1/2 done
      const result = await svc.checkAndIssueCertificate('s-1', 'c-1');
      expect(result.issued).toBe(false);
      expect(result.reason).toContain('required lessons');
    });

    it('does NOT issue when avg quiz score is below minPassScore', async () => {
      prisma2.quizAttempt.aggregate.mockResolvedValue({
        _sum: { score: 50, maxScore: 100 },
        _count: { _all: 2 },
      });
      const result = await svc.checkAndIssueCertificate('s-1', 'c-1');
      expect(result.issued).toBe(false);
      expect(result.reason).toMatch(/avgScore/);
    });
  });
});
