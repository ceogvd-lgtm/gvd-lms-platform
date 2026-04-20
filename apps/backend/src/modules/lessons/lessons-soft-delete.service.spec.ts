import { Role } from '@lms/types';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { GEMINI_QUEUE } from '../ai/ai.constants';
import { QuotaService } from '../ai/quota.service';
import { CertificatesService } from '../certificates/certificates.service';
import { ProgressService } from '../progress/progress.service';
import { XpService } from '../students/xp.service';

import { LessonsService } from './lessons.service';

/**
 * Phase 18 — INSTRUCTOR softDelete lesson nới lỏng điều kiện:
 *   ✅ Course mình + DRAFT + 0 enrollment + 0 progress record → được xoá
 *   ❌ Course người khác → 403
 *   ❌ Course PENDING_REVIEW / PUBLISHED → 400
 *   ❌ Có enrollment hoặc progress → 400 (bảo toàn tiến độ)
 *   ADMIN+ bypass mọi check (giữ rule cũ).
 */
describe('LessonsService — softDelete() (Phase 18 instructor-friendly)', () => {
  let service: LessonsService;
  let prisma: {
    client: {
      lesson: { findUnique: jest.Mock; update: jest.Mock };
    };
  };
  let storage: { delete: jest.Mock; deletePrefix: jest.Mock };
  let audit: { log: jest.Mock };

  const instructorOwner = { id: 'inst-1', role: Role.INSTRUCTOR };
  const instructorOther = { id: 'inst-other', role: Role.INSTRUCTOR };
  const admin = { id: 'admin-1', role: Role.ADMIN };
  const meta = { ip: '127.0.0.1' };

  beforeEach(async () => {
    prisma = {
      client: {
        lesson: {
          findUnique: jest.fn(),
          update: jest.fn().mockResolvedValue({ id: 'L1', title: 'Lesson', isDeleted: true }),
        },
      },
    };
    storage = { delete: jest.fn(), deletePrefix: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        LessonsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: XpService, useValue: { award: jest.fn() } },
        { provide: ProgressService, useValue: { calculateCourseProgress: jest.fn() } },
        { provide: CertificatesService, useValue: { checkAndIssueCertificate: jest.fn() } },
        { provide: StorageService, useValue: storage },
        { provide: getQueueToken(GEMINI_QUEUE), useValue: { add: jest.fn() } },
        { provide: QuotaService, useValue: { hasQuotaFor: jest.fn() } },
      ],
    }).compile();
    service = mod.get(LessonsService);
  });

  const baseLesson = {
    id: 'L1',
    title: 'Lesson One',
    isDeleted: false,
    theoryContent: null,
    practiceContent: null,
    attachments: [],
    chapter: {
      course: {
        instructorId: 'inst-1',
        status: 'DRAFT',
        _count: { enrollments: 0 },
      },
    },
    _count: { progress: 0 },
  };

  it('INSTRUCTOR owner xoá được lesson khi DRAFT + 0 enrollment + 0 progress', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue(baseLesson);
    const res = await service.softDelete(instructorOwner, 'L1', meta);
    expect(prisma.client.lesson.update).toHaveBeenCalledWith({
      where: { id: 'L1' },
      data: { isDeleted: true },
      select: expect.any(Object),
    });
    expect(res.message).toMatch(/Đã xoá/);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LESSON_DELETE', userId: 'inst-1' }),
    );
  });

  it('INSTRUCTOR của course khác → 403', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue(baseLesson);
    await expect(service.softDelete(instructorOther, 'L1', meta)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.client.lesson.update).not.toHaveBeenCalled();
  });

  it('INSTRUCTOR course PUBLISHED → 400 (không xoá, bảo toàn lịch sử)', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({
      ...baseLesson,
      chapter: {
        course: { ...baseLesson.chapter.course, status: 'PUBLISHED' },
      },
    });
    await expect(service.softDelete(instructorOwner, 'L1', meta)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('INSTRUCTOR course DRAFT nhưng có enrollment → 400', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({
      ...baseLesson,
      chapter: {
        course: { ...baseLesson.chapter.course, _count: { enrollments: 3 } },
      },
    });
    await expect(service.softDelete(instructorOwner, 'L1', meta)).rejects.toThrow(
      /3 học viên đăng ký/,
    );
  });

  it('INSTRUCTOR course DRAFT nhưng có progress → 400', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({
      ...baseLesson,
      _count: { progress: 2 },
    });
    await expect(service.softDelete(instructorOwner, 'L1', meta)).rejects.toThrow(
      /học viên học bài này/,
    );
  });

  it('ADMIN bypass mọi check — xoá được kể cả PUBLISHED + có enrollment + có progress', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({
      ...baseLesson,
      chapter: {
        course: { ...baseLesson.chapter.course, status: 'PUBLISHED', _count: { enrollments: 50 } },
      },
      _count: { progress: 20 },
    });
    await service.softDelete(admin, 'L1', meta);
    expect(prisma.client.lesson.update).toHaveBeenCalled();
  });

  it('Lesson không tồn tại → 404', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue(null);
    await expect(service.softDelete(admin, 'ghost', meta)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('Lesson đã bị xoá trước đó → 404', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({ ...baseLesson, isDeleted: true });
    await expect(service.softDelete(admin, 'L1', meta)).rejects.toBeInstanceOf(NotFoundException);
  });
});
