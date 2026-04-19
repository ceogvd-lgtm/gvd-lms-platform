import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AdminQuestionsController } from './admin-questions.controller';
import { QuestionsService } from './questions.service';

/**
 * Thin controller tests for `/admin/questions` (Phase 18).
 *
 * Mục tiêu: verify wiring giữa controller và service — tests business logic
 * nặng hơn nằm ở `questions.service.spec.ts`. Tập trung vào:
 *   - list() call đúng method (listForAdmin)
 *   - bulkDelete() truyền đúng ids + ip
 */
describe('AdminQuestionsController', () => {
  let controller: AdminQuestionsController;
  let service: { listForAdmin: jest.Mock; bulkRemove: jest.Mock };

  beforeEach(async () => {
    service = {
      listForAdmin: jest
        .fn()
        .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 1 }),
      bulkRemove: jest
        .fn()
        .mockResolvedValue({ deleted: 2, skipped: 0, skippedIds: [], deletedIds: ['q1', 'q2'] }),
    };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [AdminQuestionsController],
      providers: [{ provide: QuestionsService, useValue: service }],
    }).compile();

    controller = mod.get(AdminQuestionsController);
  });

  const adminUser: JwtPayload = {
    sub: 'admin-1',
    email: 'admin@lms.local',
    role: Role.ADMIN,
  } as JwtPayload;

  describe('GET /admin/questions', () => {
    it('forwards actor + query to service.listForAdmin', async () => {
      await controller.list(adminUser, { page: 2, limit: 50, instructorId: 'inst-9' });

      expect(service.listForAdmin).toHaveBeenCalledWith(
        { id: 'admin-1', role: Role.ADMIN },
        { page: 2, limit: 50, instructorId: 'inst-9' },
      );
    });

    it('returns the pagination envelope from the service verbatim', async () => {
      service.listForAdmin.mockResolvedValueOnce({
        data: [{ id: 'q1' }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      const result = await controller.list(adminUser, {});
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('DELETE /admin/questions/bulk', () => {
    // Minimal Request-like stub — controller only reads headers + socket
    const reqStub = {
      headers: { 'x-forwarded-for': '1.2.3.4' },
      ip: undefined,
      socket: { remoteAddress: '5.6.7.8' },
    } as never;

    it('forwards ids + client IP to service.bulkRemove', async () => {
      await controller.bulkDelete(adminUser, { ids: ['q1', 'q2', 'q3'] }, reqStub);

      expect(service.bulkRemove).toHaveBeenCalledWith(
        { id: 'admin-1', role: Role.ADMIN },
        ['q1', 'q2', 'q3'],
        { ip: '1.2.3.4' },
      );
    });

    it('falls back to socket.remoteAddress when no x-forwarded-for', async () => {
      const req = { headers: {}, ip: undefined, socket: { remoteAddress: '9.9.9.9' } } as never;
      await controller.bulkDelete(adminUser, { ids: ['q1'] }, req);
      expect(service.bulkRemove).toHaveBeenCalledWith(expect.anything(), ['q1'], { ip: '9.9.9.9' });
    });

    it('returns the service result (deleted + skipped count)', async () => {
      service.bulkRemove.mockResolvedValueOnce({
        deleted: 1,
        skipped: 2,
        skippedIds: ['q2', 'q3'],
        deletedIds: ['q1'],
      });
      const result = await controller.bulkDelete(adminUser, { ids: ['q1', 'q2', 'q3'] }, reqStub);
      expect(result.deleted).toBe(1);
      expect(result.skipped).toBe(2);
    });
  });
});
