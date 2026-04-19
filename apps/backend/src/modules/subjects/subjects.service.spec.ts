import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';

import { SubjectsService } from './subjects.service';

/**
 * Tests cho Phase 18 fix curriculum — focus vào soft-delete.
 * Phạm vi:
 *   - remove thành công khi không còn Course active
 *   - remove throw 400 khi còn Course active
 *   - remove throw 404 khi subject đã bị xoá (isDeleted=true)
 *   - remove ghi AuditLog với action SUBJECT_DELETED
 *   - list filter isDeleted=false (không trả subject đã xoá)
 */
describe('SubjectsService', () => {
  let service: SubjectsService;
  let prisma: {
    client: {
      subject: {
        findMany: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
      };
    };
  };
  let audit: { log: jest.Mock };
  let storage: { delete: jest.Mock };

  const actor = { id: 'admin1', ip: '127.0.0.1' };

  beforeEach(async () => {
    prisma = {
      client: {
        subject: {
          findMany: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    storage = { delete: jest.fn().mockResolvedValue(undefined) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SubjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    service = mod.get(SubjectsService);
  });

  describe('list', () => {
    it('chỉ trả subject có isDeleted=false', async () => {
      prisma.client.subject.findMany.mockResolvedValue([]);
      await service.list();
      expect(prisma.client.subject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isDeleted: false }),
        }),
      );
    });

    it('kết hợp filter departmentId khi có', async () => {
      prisma.client.subject.findMany.mockResolvedValue([]);
      await service.list('dept-1');
      const call = prisma.client.subject.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ isDeleted: false, departmentId: 'dept-1' });
    });
  });

  describe('remove', () => {
    it('xoá thành công khi không còn Course active', async () => {
      prisma.client.subject.findUnique.mockResolvedValue({
        id: 'subj-1',
        name: 'An toàn lao động',
        code: 'SAFE101',
        isDeleted: false,
        _count: { courses: 0 }, // 0 khoá đang active
      });
      prisma.client.subject.update.mockResolvedValue({ id: 'subj-1', isDeleted: true });

      const res = await service.remove('subj-1', actor);

      expect(prisma.client.subject.update).toHaveBeenCalledWith({
        where: { id: 'subj-1' },
        data: { isDeleted: true },
      });
      expect(res.message).toContain('Đã xoá');
    });

    it('throw 400 khi còn Course active (count > 0)', async () => {
      prisma.client.subject.findUnique.mockResolvedValue({
        id: 'subj-1',
        name: 'An toàn lao động',
        code: 'SAFE101',
        isDeleted: false,
        _count: { courses: 3 },
      });

      await expect(service.remove('subj-1', actor)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.remove('subj-1', actor)).rejects.toThrow(/còn 3 khoá/);
      expect(prisma.client.subject.update).not.toHaveBeenCalled();
    });

    it('throw 404 khi subject đã bị xoá (isDeleted=true)', async () => {
      prisma.client.subject.findUnique.mockResolvedValue({
        id: 'subj-1',
        isDeleted: true,
        _count: { courses: 0 },
      });
      await expect(service.remove('subj-1', actor)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throw 404 khi subject không tồn tại', async () => {
      prisma.client.subject.findUnique.mockResolvedValue(null);
      await expect(service.remove('ghost', actor)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('gọi storage.delete với key MinIO tách từ thumbnail URL', async () => {
      prisma.client.subject.findUnique.mockResolvedValue({
        id: 'subj-1',
        name: 'X',
        code: 'X1',
        isDeleted: false,
        thumbnailUrl: '/minio/thumbnails/x.webp',
        _count: { courses: 0 },
      });
      prisma.client.subject.update.mockResolvedValue({});

      await service.remove('subj-1', actor);

      expect(storage.delete).toHaveBeenCalledWith('thumbnails/x.webp');
    });

    it('KHÔNG throw khi storage.delete fail — flow vẫn hoàn tất', async () => {
      prisma.client.subject.findUnique.mockResolvedValue({
        id: 'subj-1',
        name: 'X',
        code: 'X1',
        isDeleted: false,
        thumbnailUrl: '/minio/thumbnails/x.webp',
        _count: { courses: 0 },
      });
      prisma.client.subject.update.mockResolvedValue({});
      storage.delete.mockRejectedValue(new Error('MinIO down'));

      await expect(service.remove('subj-1', actor)).resolves.toEqual({
        message: 'Đã xoá môn học',
      });
    });

    it('bỏ qua cleanup nếu thumbnailUrl null', async () => {
      prisma.client.subject.findUnique.mockResolvedValue({
        id: 'subj-1',
        name: 'X',
        code: 'X1',
        isDeleted: false,
        thumbnailUrl: null,
        _count: { courses: 0 },
      });
      prisma.client.subject.update.mockResolvedValue({});

      await service.remove('subj-1', actor);

      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('ghi AuditLog với action SUBJECT_DELETED + oldValue', async () => {
      prisma.client.subject.findUnique.mockResolvedValue({
        id: 'subj-1',
        name: 'An toàn lao động',
        code: 'SAFE101',
        isDeleted: false,
        _count: { courses: 0 },
      });
      prisma.client.subject.update.mockResolvedValue({});

      await service.remove('subj-1', actor);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin1',
          action: 'SUBJECT_DELETED',
          targetType: 'Subject',
          targetId: 'subj-1',
          ipAddress: '127.0.0.1',
          oldValue: expect.objectContaining({ name: 'An toàn lao động', code: 'SAFE101' }),
        }),
      );
    });
  });
});
