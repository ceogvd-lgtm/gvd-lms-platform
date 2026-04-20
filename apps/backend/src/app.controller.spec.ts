import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'APP_VERSION') return 'test-1.0';
        if (key === 'CHROMA_HOST') return 'localhost';
        if (key === 'CHROMA_PORT') return '8000';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: ConfigService, useValue: config }],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  describe('GET /health', () => {
    it('returns detailed report with version + services + metrics', async () => {
      const result = await controller.getHealth();
      expect(['ok', 'degraded', 'down']).toContain(result.status);
      expect(result.version).toBe('test-1.0');
      expect(typeof result.uptime).toBe('number');
      expect(result.services).toHaveProperty('database');
      expect(result.services).toHaveProperty('redis');
      expect(result.services).toHaveProperty('minio');
      expect(result.services).toHaveProperty('chromadb');
      expect(result.services).toHaveProperty('gemini');
      expect(result.metrics).toHaveProperty('dbResponseMs');
      expect(result.metrics).toHaveProperty('redisResponseMs');
      expect(result.metrics).toHaveProperty('pendingJobs');
    });

    it('degrades to "down" when database probe errors', async () => {
      const svc = (controller as any).appService;
      jest.spyOn(svc as any, 'probeDatabase').mockResolvedValue({ status: 'error', ms: 5 });
      jest.spyOn(svc as any, 'probeRedis').mockResolvedValue({ status: 'ok', ms: 1 });
      jest.spyOn(svc as any, 'probeMinio').mockResolvedValue({ status: 'ok', ms: 1 });
      jest.spyOn(svc as any, 'probeChroma').mockResolvedValue({ status: 'ok', ms: 1 });
      jest.spyOn(svc as any, 'probeGemini').mockResolvedValue({ status: 'ok', ms: 1 });
      jest.spyOn(svc as any, 'probePendingJobs').mockResolvedValue(0);
      const result = await controller.getHealth();
      expect(result.status).toBe('down');
    });

    it('degrades to "degraded" when a peripheral probe errors', async () => {
      const svc = (controller as any).appService;
      jest.spyOn(svc as any, 'probeDatabase').mockResolvedValue({ status: 'ok', ms: 1 });
      jest.spyOn(svc as any, 'probeRedis').mockResolvedValue({ status: 'ok', ms: 1 });
      jest.spyOn(svc as any, 'probeMinio').mockResolvedValue({ status: 'error', ms: 2 });
      jest.spyOn(svc as any, 'probeChroma').mockResolvedValue({ status: 'ok', ms: 1 });
      jest.spyOn(svc as any, 'probeGemini').mockResolvedValue({ status: 'ok', ms: 1 });
      jest.spyOn(svc as any, 'probePendingJobs').mockResolvedValue(0);
      const result = await controller.getHealth();
      expect(result.status).toBe('degraded');
    });

    it('reports quota_warning without flipping overall to down', async () => {
      const svc = (controller as any).appService;
      jest.spyOn(svc as any, 'probeDatabase').mockResolvedValue({ status: 'ok', ms: 1 });
      jest.spyOn(svc as any, 'probeRedis').mockResolvedValue({ status: 'ok', ms: 1 });
      jest.spyOn(svc as any, 'probeMinio').mockResolvedValue({ status: 'ok', ms: 1 });
      jest.spyOn(svc as any, 'probeChroma').mockResolvedValue({ status: 'ok', ms: 1 });
      jest.spyOn(svc as any, 'probeGemini').mockResolvedValue({ status: 'quota_warning', ms: 1 });
      jest.spyOn(svc as any, 'probePendingJobs').mockResolvedValue(3);
      const result = await controller.getHealth();
      expect(result.status).toBe('degraded');
      expect(result.services.gemini).toBe('quota_warning');
      expect(result.metrics.pendingJobs).toBe(3);
    });
  });
});
