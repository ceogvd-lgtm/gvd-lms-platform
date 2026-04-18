import { Role } from '@lms/database';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';

import { CertificateCriteriaService } from './certificate-criteria.service';

/**
 * Phase 16 — unit tests for CertificateCriteriaService.
 */
describe('CertificateCriteriaService', () => {
  let service: CertificateCriteriaService;
  let prisma: {
    client: {
      certificateCriteria: {
        findUnique: jest.Mock;
        upsert: jest.Mock;
        delete: jest.Mock;
      };
      course: { findUnique: jest.Mock };
    };
  };

  beforeEach(async () => {
    prisma = {
      client: {
        certificateCriteria: {
          findUnique: jest.fn(),
          upsert: jest.fn(),
          delete: jest.fn(),
        },
        course: { findUnique: jest.fn() },
      },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [CertificateCriteriaService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(CertificateCriteriaService);
  });

  // =====================================================
  // get — returns defaults when no row
  // =====================================================
  it('get: returns defaults when no row exists', async () => {
    prisma.client.certificateCriteria.findUnique.mockResolvedValue(null);
    const result = await service.get('course-1');
    expect(result.exists).toBe(false);
    expect(result.minPassScore).toBe(70);
    expect(result.minProgress).toBe(100);
    expect(result.noSafetyViolation).toBe(true);
    expect(result.gradeThresholds).toEqual({ excellent: 90, good: 80, pass: 70 });
  });

  it('get: returns stored values when row exists', async () => {
    prisma.client.certificateCriteria.findUnique.mockResolvedValue({
      id: 'crit-1',
      courseId: 'course-1',
      minPassScore: 80,
      minProgress: 90,
      minPracticeScore: 60,
      noSafetyViolation: false,
      requiredLessons: ['l-1', 'l-2'],
      validityMonths: 24,
      gradeThresholds: { excellent: 95, good: 85, pass: 75 },
      customCriteria: null,
    });
    const result = await service.get('course-1');
    expect(result.exists).toBe(true);
    expect(result.minPassScore).toBe(80);
    expect(result.gradeThresholds.excellent).toBe(95);
    expect(result.requiredLessons).toEqual(['l-1', 'l-2']);
  });

  // =====================================================
  // upsert — INSTRUCTOR ownership
  // =====================================================
  it('upsert: INSTRUCTOR who owns the course → saves', async () => {
    prisma.client.course.findUnique.mockResolvedValue({
      instructorId: 'instr-1',
      isDeleted: false,
    });
    prisma.client.certificateCriteria.upsert.mockResolvedValue({
      id: 'crit-new',
      courseId: 'course-1',
      minPassScore: 75,
      minProgress: 100,
      minPracticeScore: 0,
      noSafetyViolation: true,
      requiredLessons: [],
      validityMonths: null,
      gradeThresholds: { excellent: 90, good: 80, pass: 70 },
      customCriteria: null,
    });

    const result = await service.upsert({ id: 'instr-1', role: Role.INSTRUCTOR }, 'course-1', {
      minPassScore: 75,
    });
    expect(result.exists).toBe(true);
    expect(prisma.client.certificateCriteria.upsert).toHaveBeenCalled();
  });

  it('upsert: INSTRUCTOR who does NOT own the course → 403', async () => {
    prisma.client.course.findUnique.mockResolvedValue({
      instructorId: 'other-instr',
      isDeleted: false,
    });
    await expect(
      service.upsert({ id: 'instr-1', role: Role.INSTRUCTOR }, 'course-1', {}),
    ).rejects.toThrow(ForbiddenException);
  });

  it('upsert: ADMIN can save for any course (no ownership check)', async () => {
    prisma.client.certificateCriteria.upsert.mockResolvedValue({
      id: 'crit-new',
      courseId: 'course-1',
      minPassScore: 70,
      minProgress: 100,
      minPracticeScore: 0,
      noSafetyViolation: true,
      requiredLessons: [],
      validityMonths: null,
      gradeThresholds: { excellent: 90, good: 80, pass: 70 },
      customCriteria: null,
    });
    const result = await service.upsert({ id: 'admin-1', role: Role.ADMIN }, 'course-1', {});
    expect(result.exists).toBe(true);
    expect(prisma.client.course.findUnique).not.toHaveBeenCalled();
  });

  // =====================================================
  // remove — ADMIN only
  // =====================================================
  it('remove: STUDENT → 403', async () => {
    await expect(service.remove({ id: 'u-1', role: Role.STUDENT }, 'course-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('remove: ADMIN with no existing row → 404', async () => {
    prisma.client.certificateCriteria.findUnique.mockResolvedValue(null);
    await expect(service.remove({ id: 'admin', role: Role.ADMIN }, 'course-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
