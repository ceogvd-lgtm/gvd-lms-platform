import { Role } from '@lms/database';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';

import { PracticeContentsService } from './practice-contents.service';

describe('PracticeContentsService', () => {
  let service: PracticeContentsService;
  let prismaMock: {
    client: {
      lesson: { findUnique: jest.Mock };
      practiceContent: { findUnique: jest.Mock; upsert: jest.Mock };
    };
  };

  const INSTR = { id: 'u-instr', role: Role.INSTRUCTOR };
  const OTHER_INSTR = { id: 'u-other', role: Role.INSTRUCTOR };
  const ADMIN = { id: 'u-admin', role: Role.ADMIN };

  beforeEach(async () => {
    prismaMock = {
      client: {
        lesson: { findUnique: jest.fn() },
        practiceContent: { findUnique: jest.fn(), upsert: jest.fn() },
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [PracticeContentsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get(PracticeContentsService);
  });

  function mockLessonOwnedBy(instructorId: string) {
    prismaMock.client.lesson.findUnique.mockResolvedValue({
      id: 'l-1',
      isDeleted: false,
      chapter: { course: { instructorId } },
    });
  }

  describe('ownership', () => {
    it('rejects non-owner instructor', async () => {
      mockLessonOwnedBy(OTHER_INSTR.id);
      await expect(service.findByLesson(INSTR, 'l-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFound when lesson missing', async () => {
      prismaMock.client.lesson.findUnique.mockResolvedValue(null);
      await expect(service.findByLesson(INSTR, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('allows ADMIN even if not owner', async () => {
      mockLessonOwnedBy(OTHER_INSTR.id);
      prismaMock.client.practiceContent.findUnique.mockResolvedValue(null);
      await expect(service.findByLesson(ADMIN, 'l-1')).resolves.toBeNull();
    });
  });

  describe('upsert', () => {
    beforeEach(() => mockLessonOwnedBy(INSTR.id));

    it('persists all required fields', async () => {
      prismaMock.client.practiceContent.upsert.mockResolvedValue({ id: 'p-1' });
      await service.upsert(INSTR, 'l-1', {
        introduction: 'Welding intro',
        objectives: ['safety', 'precision'],
        webglUrl: 'https://example.com/welding.unityweb',
        scoringConfig: { weight: { precision: 0.5, speed: 0.5 } },
        safetyChecklist: { gloves: true, mask: true },
        passScore: 70,
        timeLimit: 600,
        maxAttempts: 3,
      });
      const call = prismaMock.client.practiceContent.upsert.mock.calls[0]![0];
      expect(call.create.passScore).toBe(70);
      expect(call.create.webglUrl).toBe('https://example.com/welding.unityweb');
      expect(call.create.scoringConfig).toEqual({ weight: { precision: 0.5, speed: 0.5 } });
    });
  });
});
