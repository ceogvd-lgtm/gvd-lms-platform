import { Role } from '@lms/database';
import { BadRequestException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import { SystemSettingsService } from './system-settings.service';

// Mock nodemailer so testSmtp never hits a real SMTP server.
const mockVerify = jest.fn();
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn().mockReturnValue({
      verify: (...args: unknown[]) => mockVerify(...args),
    }),
  },
}));

describe('SystemSettingsService', () => {
  let service: SystemSettingsService;
  let prismaMock: {
    client: {
      systemSetting: {
        findMany: jest.Mock;
        upsert: jest.Mock;
      };
    };
  };
  let auditMock: { log: jest.Mock };

  const SUPER = { id: 'u-super', role: Role.SUPER_ADMIN };
  const ADMIN = { id: 'u-admin', role: Role.ADMIN };
  const META = { ip: '127.0.0.1' };

  beforeEach(async () => {
    prismaMock = {
      client: {
        systemSetting: {
          findMany: jest.fn().mockResolvedValue([]),
          upsert: jest.fn().mockResolvedValue(undefined),
        },
      },
    };
    auditMock = { log: jest.fn().mockResolvedValue(undefined) };
    mockVerify.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemSettingsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<SystemSettingsService>(SystemSettingsService);
  });

  // =====================================================
  // getAll — masking
  // =====================================================
  describe('getAll', () => {
    const ROWS = [
      {
        key: 'org.name',
        value: 'GVD',
        description: null,
        updatedBy: null,
        updatedAt: new Date(),
      },
      {
        key: 'smtp.pass',
        value: 'supersecret',
        description: null,
        updatedBy: null,
        updatedAt: new Date(),
      },
      {
        key: 'rogue.key', // not in whitelist — should be filtered out
        value: 'x',
        description: null,
        updatedBy: null,
        updatedAt: new Date(),
      },
    ];

    beforeEach(() => {
      prismaMock.client.systemSetting.findMany.mockResolvedValue(ROWS);
    });

    it('masks smtp.pass for ADMIN', async () => {
      const result = await service.getAll(ADMIN);
      const pass = result.find((r) => r.key === 'smtp.pass');
      expect(pass?.value).toBe('***');
    });

    it('returns raw smtp.pass for SUPER_ADMIN', async () => {
      const result = await service.getAll(SUPER);
      const pass = result.find((r) => r.key === 'smtp.pass');
      expect(pass?.value).toBe('supersecret');
    });

    it('filters out keys that are not in the whitelist', async () => {
      const result = await service.getAll(SUPER);
      expect(result.find((r) => r.key === 'rogue.key')).toBeUndefined();
    });
  });

  // =====================================================
  // update — whitelist + value validation
  // =====================================================
  describe('update', () => {
    it('rejects request containing a non-whitelisted key', async () => {
      await expect(
        service.update(SUPER, { updates: [{ key: 'malicious.key', value: 'hack' }] }, META),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.client.systemSetting.upsert).not.toHaveBeenCalled();
    });

    it('rejects invalid value type (string for number key)', async () => {
      await expect(
        service.update(
          SUPER,
          { updates: [{ key: 'security.passwordMinLength', value: 'short' }] },
          META,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects out-of-range number', async () => {
      await expect(
        service.update(SUPER, { updates: [{ key: 'security.passwordMinLength', value: 1 }] }, META),
      ).rejects.toThrow(BadRequestException);
    });

    it('upserts each key and writes a per-key audit entry', async () => {
      prismaMock.client.systemSetting.findMany
        .mockResolvedValueOnce([
          {
            key: 'org.name',
            value: 'Old',
            description: null,
            updatedBy: null,
            updatedAt: new Date(),
          },
        ])
        .mockResolvedValueOnce([]); // for the final getAll call

      await service.update(
        SUPER,
        {
          updates: [
            { key: 'org.name', value: 'GVD next-gen' },
            { key: 'security.passwordMinLength', value: 10 },
          ],
        },
        META,
      );

      expect(prismaMock.client.systemSetting.upsert).toHaveBeenCalledTimes(2);
      expect(auditMock.log).toHaveBeenCalledTimes(2);
      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SYSTEM_SETTING_UPDATE',
          targetType: 'SystemSetting',
          targetId: 'org.name',
        }),
      );
    });

    it('masks smtp.pass in the audit newValue', async () => {
      prismaMock.client.systemSetting.findMany.mockResolvedValue([]);
      await service.update(SUPER, { updates: [{ key: 'smtp.pass', value: 'real-secret' }] }, META);
      const auditCall = auditMock.log.mock.calls[0]![0];
      expect(auditCall.newValue).toEqual({ value: '***' });
    });
  });

  // =====================================================
  // testSmtp — nodemailer mock
  // =====================================================
  describe('testSmtp', () => {
    it('returns ok:true when verify() resolves', async () => {
      prismaMock.client.systemSetting.findMany.mockResolvedValue([
        { key: 'smtp.host', value: 'smtp.gmail.com' },
        { key: 'smtp.port', value: 587 },
      ]);
      mockVerify.mockResolvedValue(true);

      const result = await service.testSmtp({});
      expect(result.ok).toBe(true);
    });

    it('returns ok:false with error message when verify() rejects', async () => {
      prismaMock.client.systemSetting.findMany.mockResolvedValue([
        { key: 'smtp.host', value: 'bad.smtp' },
        { key: 'smtp.port', value: 587 },
      ]);
      mockVerify.mockRejectedValue(new Error('Connection refused'));

      const result = await service.testSmtp({});
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Connection refused');
    });

    it('returns ok:false when smtp.host is missing', async () => {
      prismaMock.client.systemSetting.findMany.mockResolvedValue([]);
      const result = await service.testSmtp({});
      expect(result.ok).toBe(false);
      expect(result.error).toContain('SMTP host');
    });

    it('override takes precedence over stored settings', async () => {
      prismaMock.client.systemSetting.findMany.mockResolvedValue([
        { key: 'smtp.host', value: 'smtp.old.com' },
      ]);
      mockVerify.mockResolvedValue(true);
      const result = await service.testSmtp({ host: 'smtp.new.com', port: 465 });
      expect(result.ok).toBe(true);
    });
  });

  // =====================================================
  // triggerBackup — stub
  // =====================================================
  describe('triggerBackup', () => {
    it('writes SYSTEM_BACKUP_TRIGGER audit and returns stub flag', async () => {
      const result = await service.triggerBackup(SUPER, META);
      expect(result.ok).toBe(true);
      expect(result.stub).toBe(true);
      expect(result.id).toBeDefined();
      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SYSTEM_BACKUP_TRIGGER' }),
      );
    });
  });

  describe('getBackupHistory', () => {
    it('returns empty array with stub flag (Phase 18 will populate)', async () => {
      const result = await service.getBackupHistory();
      expect(result.items).toEqual([]);
      expect(result.stub).toBe(true);
    });
  });
});
