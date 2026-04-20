import { Role } from '@lms/types';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';

import { ChaptersService } from './chapters.service';

/**
 * Phase 18 — test logic xoá chapter mới nới cho INSTRUCTOR.
 *
 * Rule:
 *   - INSTRUCTOR xoá được chapter của course mình KHI course.status === DRAFT
 *     VÀ course chưa có enrollment nào
 *   - ADMIN+ bypass mọi check (vẫn xoá được sau khi published)
 *   - INSTRUCTOR KHÔNG xoá được course của người khác (ForbiddenException)
 */
describe('ChaptersService — remove() (Phase 18 instructor-friendly)', () => {
  let service: ChaptersService;
  let prisma: {
    client: {
      chapter: { findUnique: jest.Mock; delete: jest.Mock };
    };
  };

  const instructorOwner = { id: 'inst-1', role: Role.INSTRUCTOR };
  const instructorOther = { id: 'inst-other', role: Role.INSTRUCTOR };
  const admin = { id: 'admin-1', role: Role.ADMIN };

  beforeEach(async () => {
    prisma = {
      client: {
        chapter: {
          findUnique: jest.fn(),
          delete: jest.fn().mockResolvedValue({ id: 'c1' }),
        },
      },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [ChaptersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(ChaptersService);
  });

  const baseChapter = {
    id: 'c1',
    course: {
      id: 'course-1',
      instructorId: 'inst-1',
      status: 'DRAFT',
      _count: { enrollments: 0 },
    },
  };

  it('INSTRUCTOR owner xoá được khi course DRAFT + 0 enrollment', async () => {
    prisma.client.chapter.findUnique.mockResolvedValue(baseChapter);
    const res = await service.remove(instructorOwner, 'c1');
    expect(prisma.client.chapter.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(res.message).toMatch(/Đã xoá/);
  });

  it('INSTRUCTOR của course khác → 403', async () => {
    prisma.client.chapter.findUnique.mockResolvedValue(baseChapter);
    await expect(service.remove(instructorOther, 'c1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.client.chapter.delete).not.toHaveBeenCalled();
  });

  it('INSTRUCTOR owner nhưng course PENDING_REVIEW → 400', async () => {
    prisma.client.chapter.findUnique.mockResolvedValue({
      ...baseChapter,
      course: { ...baseChapter.course, status: 'PENDING_REVIEW' },
    });
    await expect(service.remove(instructorOwner, 'c1')).rejects.toThrow(
      /trạng thái PENDING_REVIEW/,
    );
    expect(prisma.client.chapter.delete).not.toHaveBeenCalled();
  });

  it('INSTRUCTOR owner nhưng course PUBLISHED → 400', async () => {
    prisma.client.chapter.findUnique.mockResolvedValue({
      ...baseChapter,
      course: { ...baseChapter.course, status: 'PUBLISHED' },
    });
    await expect(service.remove(instructorOwner, 'c1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('INSTRUCTOR owner course DRAFT nhưng có enrollment → 400', async () => {
    prisma.client.chapter.findUnique.mockResolvedValue({
      ...baseChapter,
      course: { ...baseChapter.course, _count: { enrollments: 5 } },
    });
    await expect(service.remove(instructorOwner, 'c1')).rejects.toThrow(/5 học viên đăng ký/);
  });

  it('ADMIN bypass mọi check — xoá được ngay cả khi PUBLISHED + có enrollment', async () => {
    prisma.client.chapter.findUnique.mockResolvedValue({
      ...baseChapter,
      course: {
        ...baseChapter.course,
        status: 'PUBLISHED',
        _count: { enrollments: 100 },
      },
    });
    await service.remove(admin, 'c1');
    expect(prisma.client.chapter.delete).toHaveBeenCalled();
  });

  it('Chapter không tồn tại → 404', async () => {
    prisma.client.chapter.findUnique.mockResolvedValue(null);
    await expect(service.remove(admin, 'ghost')).rejects.toBeInstanceOf(NotFoundException);
  });
});
