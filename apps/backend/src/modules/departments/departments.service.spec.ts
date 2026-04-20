import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { CacheService } from '../../common/cache/cache.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import { DepartmentsService } from './departments.service';

/**
 * Unit tests for DepartmentsService.remove() cascade-clean logic.
 *
 * Focus: khi xoá ngành, logic phân nhánh theo tình trạng con:
 *   - Còn subject active → reject
 *   - Còn active course trong soft-deleted subject → reject
 *   - Còn certificate đã phát → reject (bảo toàn lịch sử)
 *   - Soft-deleted tree sạch → cascade hard-delete + xoá department
 */
describe('DepartmentsService — remove() cascade', () => {
  let service: DepartmentsService;
  let prisma: {
    client: {
      department: { findUnique: jest.Mock; delete: jest.Mock };
      course: { deleteMany: jest.Mock };
      subject: { deleteMany: jest.Mock };
      $transaction: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      client: {
        department: { findUnique: jest.fn(), delete: jest.fn() },
        course: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        subject: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
          fn({
            course: prisma.client.course,
            subject: prisma.client.subject,
          }),
        ),
      },
    };

    const cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
      getOrSet: jest.fn(async (_ns: string, _k: string, _ttl: number, f: () => Promise<unknown>) =>
        f(),
      ),
      invalidateNamespace: jest.fn().mockResolvedValue(0),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();
    service = mod.get(DepartmentsService);
  });

  it('throws NotFound when department does not exist', async () => {
    prisma.client.department.findUnique.mockResolvedValue(null);
    await expect(service.remove('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when active subjects exist', async () => {
    prisma.client.department.findUnique.mockResolvedValue({
      id: 'd1',
      subjects: [
        { id: 's1', name: 'Môn A', isDeleted: false, courses: [] },
        { id: 's2', name: 'Môn B', isDeleted: true, courses: [] },
      ],
    });
    await expect(service.remove('d1')).rejects.toThrow(/còn 1 môn học chưa xoá/);
    expect(prisma.client.department.delete).not.toHaveBeenCalled();
  });

  it('deletes cleanly when no subjects at all', async () => {
    prisma.client.department.findUnique.mockResolvedValue({ id: 'd1', subjects: [] });
    prisma.client.department.delete.mockResolvedValue({ id: 'd1' });

    const result = await service.remove('d1');
    expect(result).toMatchObject({ message: expect.any(String) });
    expect(prisma.client.department.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });

  it('rejects when soft-deleted subject still has an ACTIVE course', async () => {
    prisma.client.department.findUnique.mockResolvedValue({
      id: 'd1',
      subjects: [
        {
          id: 's1',
          name: 'An toàn lao động',
          isDeleted: true,
          courses: [
            {
              id: 'c1',
              title: 'Khoá A đang hoạt động',
              isDeleted: false,
              _count: { certificates: 0 },
            },
          ],
        },
      ],
    });
    await expect(service.remove('d1')).rejects.toThrow(/khoá học hoạt động/);
    expect(prisma.client.department.delete).not.toHaveBeenCalled();
  });

  it('rejects when soft-deleted course has issued certificates', async () => {
    prisma.client.department.findUnique.mockResolvedValue({
      id: 'd1',
      subjects: [
        {
          id: 's1',
          name: 'Môn A',
          isDeleted: true,
          courses: [
            {
              id: 'c1',
              title: 'Khoá có chứng chỉ',
              isDeleted: true,
              _count: { certificates: 5 },
            },
          ],
        },
      ],
    });
    await expect(service.remove('d1')).rejects.toThrow(/chứng chỉ đã phát/);
    expect(prisma.client.department.delete).not.toHaveBeenCalled();
  });

  it('cascade-deletes soft-deleted subjects + their soft-deleted courses when safe', async () => {
    prisma.client.department.findUnique.mockResolvedValue({
      id: 'd1',
      subjects: [
        {
          id: 's1',
          name: 'An toàn lao động',
          isDeleted: true,
          courses: [
            { id: 'c1', title: 'Khoá cũ 1', isDeleted: true, _count: { certificates: 0 } },
            { id: 'c2', title: 'Khoá cũ 2', isDeleted: true, _count: { certificates: 0 } },
          ],
        },
        {
          id: 's2',
          name: 'Môn rỗng',
          isDeleted: true,
          courses: [],
        },
      ],
    });
    prisma.client.department.delete.mockResolvedValue({ id: 'd1' });

    const result = await service.remove('d1');

    expect(prisma.client.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.client.course.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['c1', 'c2'] } },
    });
    expect(prisma.client.subject.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['s1', 's2'] } },
    });
    expect(prisma.client.department.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
    expect(result).toMatchObject({
      cascaded: { subjects: 2, courses: 2 },
    });
  });

  it('cascade OK khi subjects soft-deleted đều rỗng course', async () => {
    prisma.client.department.findUnique.mockResolvedValue({
      id: 'd1',
      subjects: [{ id: 's1', name: 'Môn rỗng', isDeleted: true, courses: [] }],
    });
    prisma.client.department.delete.mockResolvedValue({ id: 'd1' });

    const result = await service.remove('d1');

    expect(prisma.client.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.client.course.deleteMany).not.toHaveBeenCalled();
    expect(prisma.client.subject.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['s1'] } },
    });
    expect(result.cascaded).toEqual({ subjects: 1, courses: 0 });
  });
});
