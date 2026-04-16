import { ProgressStatus } from '@lms/database';
import { Role } from '@lms/types';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';

import type { XapiStatementDto } from './dto/statement.dto';
import { parseStatement, XapiService } from './xapi.service';

/**
 * Unit tests for the xAPI LRS stub.
 *
 * The parser is a pure function — tested directly. The service wraps it
 * with Prisma upserts; we mock Prisma and only assert the DB write has
 * the right status + score.
 */
describe('XapiService', () => {
  let service: XapiService;
  let prisma: {
    client: {
      lesson: { findUnique: jest.Mock };
      lessonProgress: { upsert: jest.Mock; findUnique: jest.Mock };
    };
  };

  beforeEach(async () => {
    prisma = {
      client: {
        lesson: { findUnique: jest.fn() },
        lessonProgress: { upsert: jest.fn(), findUnique: jest.fn() },
      },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [XapiService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(XapiService);
  });

  const statement = (
    verbIri: string,
    overrides: Partial<XapiStatementDto> = {},
  ): XapiStatementDto => ({
    actor: { mbox: 'mailto:student@lms.local' },
    verb: { id: verbIri },
    object: { id: 'https://lms.local/xapi/lessons/lesson-1' },
    ...overrides,
  });

  // =====================================================
  // parseStatement (pure)
  // =====================================================
  describe('parseStatement', () => {
    it('verb=completed → COMPLETED', () => {
      const p = parseStatement(statement('http://adlnet.gov/expapi/verbs/completed'));
      expect(p.status).toBe(ProgressStatus.COMPLETED);
      expect(p.scoreRaw).toBeNull();
    });

    it('verb=passed with score → COMPLETED + score', () => {
      const p = parseStatement(
        statement('http://adlnet.gov/expapi/verbs/passed', {
          result: { score: { raw: 78 }, success: true },
        }),
      );
      expect(p.status).toBe(ProgressStatus.COMPLETED);
      expect(p.scoreRaw).toBe(78);
      expect(p.success).toBe(true);
    });

    it('verb=failed → IN_PROGRESS', () => {
      const p = parseStatement(statement('http://adlnet.gov/expapi/verbs/failed'));
      expect(p.status).toBe(ProgressStatus.IN_PROGRESS);
    });

    it('unknown verb → IN_PROGRESS', () => {
      const p = parseStatement(statement('http://adlnet.gov/expapi/verbs/interacted'));
      expect(p.status).toBe(ProgressStatus.IN_PROGRESS);
    });
  });

  // =====================================================
  // recordStatement — extracts lessonId, writes LessonProgress
  // =====================================================
  describe('recordStatement', () => {
    const actor = { id: 'student-1', role: Role.STUDENT };

    beforeEach(() => {
      prisma.client.lesson.findUnique.mockResolvedValue({ id: 'lesson-1', isDeleted: false });
      prisma.client.lessonProgress.upsert.mockImplementation(({ update, create }) =>
        Promise.resolve({
          ...(create ?? {}),
          ...(update ?? {}),
          status: update?.status ?? create?.status,
          score: update?.score ?? create?.score ?? null,
        }),
      );
    });

    it('persists COMPLETED on passed', async () => {
      const res = await service.recordStatement(
        actor,
        statement('http://adlnet.gov/expapi/verbs/passed', {
          result: { score: { raw: 95 }, success: true },
        }),
      );
      expect(res.lessonId).toBe('lesson-1');
      expect(res.status).toBe(ProgressStatus.COMPLETED);
      expect(res.score).toBe(95);
    });

    it('rejects when object.id has no /lessons/{id} segment', async () => {
      await expect(
        service.recordStatement(actor, {
          actor: {},
          verb: { id: 'http://adlnet.gov/expapi/verbs/completed' },
          object: { id: 'https://lms.local/activities/foo' },
        } as XapiStatementDto),
      ).rejects.toThrow();
    });

    it('404s when the lesson does not exist', async () => {
      prisma.client.lesson.findUnique.mockResolvedValue(null);
      await expect(
        service.recordStatement(actor, statement('http://adlnet.gov/expapi/verbs/completed')),
      ).rejects.toThrow();
    });
  });
});
