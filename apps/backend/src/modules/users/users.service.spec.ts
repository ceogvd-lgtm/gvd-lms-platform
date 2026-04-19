import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';

import { UsersService } from './users.service';

/**
 * Unit tests cho self-service endpoints /users/me.
 *
 * Phạm vi:
 *   - getMe trả đúng shape (id + email + name + role + avatar + createdAt +
 *     emailVerified + is2FAEnabled)
 *   - getMe ném NotFoundException nếu user không tồn tại (edge case:
 *     token còn hạn nhưng user đã bị xoá giữa chừng)
 *   - updateMe cập nhật được name
 *   - updateMe CHỈ truyền `name` xuống Prisma — dù caller có nhét thêm
 *     role/email/password vào body, ValidationPipe đã strip từ DTO,
 *     service không có cơ hội đụng tới
 *   - Spec không kiểm tra validation min/max vì class-validator test đó
 *     cấp DTO (end-to-end qua ValidationPipe) — đã cover ở integration.
 */
describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    client: {
      user: { findUnique: jest.Mock; update: jest.Mock };
    };
  };

  const fakeUser = {
    id: 'U1',
    email: 'demo@lms.local',
    name: 'Demo User',
    role: 'STUDENT' as const,
    avatar: null,
    createdAt: new Date('2026-04-17T00:00:00.000Z'),
    emailVerified: true,
    is2FAEnabled: false,
  };

  beforeEach(async () => {
    prisma = {
      client: {
        user: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      },
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(UsersService);
  });

  describe('getMe', () => {
    it('trả đúng 8 field của user hiện tại', async () => {
      prisma.client.user.findUnique.mockResolvedValue(fakeUser);

      const res = await service.getMe('U1');

      expect(prisma.client.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'U1' },
        select: expect.objectContaining({
          id: true,
          email: true,
          name: true,
          role: true,
          avatar: true,
          createdAt: true,
          emailVerified: true,
          is2FAEnabled: true,
        }),
      });
      expect(res).toEqual(fakeUser);
    });

    it('ném NotFoundException khi user bị xoá giữa chừng', async () => {
      prisma.client.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateMe', () => {
    it('cập nhật name và trả hồ sơ đầy đủ', async () => {
      prisma.client.user.update.mockResolvedValue({ ...fakeUser, name: 'Tên mới' });

      const res = await service.updateMe('U1', { name: 'Tên mới' });

      expect(prisma.client.user.update).toHaveBeenCalledWith({
        where: { id: 'U1' },
        data: { name: 'Tên mới' },
        select: expect.any(Object),
      });
      expect(res.name).toBe('Tên mới');
      expect(res.role).toBe('STUDENT');
    });

    it('cập nhật avatar khi chỉ truyền avatar', async () => {
      prisma.client.user.update.mockResolvedValue({ ...fakeUser, avatar: '/minio/avatars/x.webp' });

      const res = await service.updateMe('U1', { avatar: '/minio/avatars/x.webp' });

      expect(prisma.client.user.update).toHaveBeenCalledWith({
        where: { id: 'U1' },
        data: { avatar: '/minio/avatars/x.webp' },
        select: expect.any(Object),
      });
      expect(res.avatar).toBe('/minio/avatars/x.webp');
    });

    it('truyền cả name và avatar khi DTO có cả hai', async () => {
      prisma.client.user.update.mockResolvedValue(fakeUser);

      await service.updateMe('U1', { name: 'Ten', avatar: '/minio/x.webp' });

      expect(prisma.client.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: 'Ten', avatar: '/minio/x.webp' },
        }),
      );
    });

    it('KHÔNG truyền field nào ngoài name/avatar xuống Prisma — chống leak role/email/password', async () => {
      prisma.client.user.update.mockResolvedValue(fakeUser);

      // Caller cố nhét field nhạy cảm; dù nếu validator bị bypass (VD future
      // refactor bỏ `whitelist`), service vẫn phải chỉ truyền field safe.
      const dto = {
        name: 'X',
        role: 'SUPER_ADMIN',
        email: 'x@y',
        password: 'p',
      } as unknown as { name: string };
      await service.updateMe('U1', dto);

      const callArg = prisma.client.user.update.mock.calls[0][0];
      expect(callArg.data).toEqual({ name: 'X' });
      expect(callArg.data).not.toHaveProperty('role');
      expect(callArg.data).not.toHaveProperty('email');
      expect(callArg.data).not.toHaveProperty('password');
    });

    it('không truyền DTO field nào → skip update, trả profile hiện tại', async () => {
      prisma.client.user.findUnique.mockResolvedValue(fakeUser);

      const res = await service.updateMe('U1', {});

      expect(prisma.client.user.update).not.toHaveBeenCalled();
      expect(prisma.client.user.findUnique).toHaveBeenCalled();
      expect(res).toEqual(fakeUser);
    });
  });
});
