import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';

import { AI_DAILY_WARN_THRESHOLD } from './ai.constants';
import { QuotaService } from './quota.service';

describe('QuotaService', () => {
  let service: QuotaService;
  let prismaMock: {
    client: {
      aiQuotaLog: {
        upsert: jest.Mock;
        findMany: jest.Mock;
      };
    };
  };
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    prismaMock = {
      client: {
        aiQuotaLog: {
          upsert: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [QuotaService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get(QuotaService);
    warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('checkAndIncrement', () => {
    it('increments the day/model bucket and returns the running total', async () => {
      prismaMock.client.aiQuotaLog.upsert.mockResolvedValue({
        requests: 42,
        tokens: 1_234,
      });

      const result = await service.checkAndIncrement('chat', 100);

      expect(result).toEqual({ requests: 42, tokens: 1_234 });
      const call = prismaMock.client.aiQuotaLog.upsert.mock.calls[0]![0];
      expect(call.where.date_model.model).toBe('chat');
      expect(call.update.requests).toEqual({ increment: 1 });
      expect(call.update.tokens).toEqual({ increment: 100 });
      expect(call.create.requests).toBe(1);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('logs a warning once the counter crosses the soft threshold', async () => {
      prismaMock.client.aiQuotaLog.upsert.mockResolvedValue({
        requests: AI_DAILY_WARN_THRESHOLD + 1,
        tokens: 0,
      });

      await service.checkAndIncrement('lite');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]![0]).toContain('AI quota warning');
    });

    it('uses UTC YYYY-MM-DD as the date half of the key', async () => {
      prismaMock.client.aiQuotaLog.upsert.mockResolvedValue({ requests: 1, tokens: 0 });
      await service.checkAndIncrement('chat');
      const call = prismaMock.client.aiQuotaLog.upsert.mock.calls[0]![0];
      expect(call.where.date_model.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getTodaySnapshot', () => {
    it('always returns three buckets even when some have no rows', async () => {
      prismaMock.client.aiQuotaLog.findMany.mockResolvedValue([
        { model: 'chat', requests: 7, tokens: 100 },
      ]);

      const snap = await service.getTodaySnapshot();

      expect(snap).toHaveLength(3);
      expect(snap.map((s) => s.model).sort()).toEqual(['chat', 'embedding', 'lite'].sort());
      expect(snap.find((s) => s.model === 'chat')?.requests).toBe(7);
      expect(snap.find((s) => s.model === 'lite')?.requests).toBe(0);
    });
  });
});
