import { ProgressStatus } from '@lms/database';
import { Role } from '@lms/types';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';

import { detectVersion, parseImsManifest } from './scorm-manifest.parser';
import { ScormService, statusToProgress } from './scorm.service';

/**
 * Unit tests for the SCORM module.
 *
 * Scope:
 *   - detectScormVersion: 1.2 vs 2004 from schema metadata + namespaces
 *   - statusToProgress: the pure string-mapping used by trackProgress
 *   - trackProgress: writes LessonProgress with the right status
 *
 * MinIO + XML parsing is covered indirectly through `parseImsManifest`
 * with hand-crafted XML strings — no real package zip needed.
 */
describe('ScormService', () => {
  let service: ScormService;
  let prisma: {
    client: {
      lesson: { findUnique: jest.Mock };
      theoryContent: { upsert: jest.Mock };
      lessonProgress: { upsert: jest.Mock; findUnique: jest.Mock };
    };
  };
  let storage: {
    deletePrefix: jest.Mock;
    upload: jest.Mock;
    getUrl: jest.Mock;
    exists: jest.Mock;
    streamDownload: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      client: {
        lesson: { findUnique: jest.fn() },
        theoryContent: { upsert: jest.fn() },
        lessonProgress: { upsert: jest.fn(), findUnique: jest.fn() },
      },
    };
    storage = {
      deletePrefix: jest.fn(),
      upload: jest.fn(),
      getUrl: jest.fn().mockResolvedValue('https://minio.test/signed'),
      exists: jest.fn(),
      streamDownload: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ScormService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    service = mod.get(ScormService);
  });

  // =====================================================
  // detectScormVersion
  // =====================================================
  describe('detectScormVersion', () => {
    it('returns "1.2" when metadata.schemaversion says so', () => {
      expect(detectVersion({ metadata: { schemaversion: '1.2' } })).toBe('1.2');
    });

    it('returns "2004" when metadata.schemaversion mentions 2004', () => {
      expect(detectVersion({ metadata: { schemaversion: '2004 3rd Edition' } })).toBe('2004');
    });

    it('falls back to "1.2" via namespace sniffing', () => {
      expect(detectVersion({ 'xmlns:adlcp': 'http://www.adlnet.org/xsd/adlcp_rootv1p2' })).toBe(
        '1.2',
      );
    });

    it('defaults to "2004" when nothing is recognisable', () => {
      expect(detectVersion({})).toBe('2004');
    });
  });

  // =====================================================
  // parseImsManifest
  // =====================================================
  describe('parseImsManifest', () => {
    it('parses a minimal SCORM 1.2 manifest', async () => {
      const xml = `<?xml version="1.0"?>
        <manifest identifier="x" version="1.2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
          <metadata><schemaversion>1.2</schemaversion></metadata>
          <organizations default="org1">
            <organization identifier="org1">
              <title>Demo</title>
              <item identifier="i1" identifierref="res1"><title>Intro</title></item>
            </organization>
          </organizations>
          <resources>
            <resource identifier="res1" type="webcontent" adlcp:scormtype="sco" href="index.html"/>
          </resources>
        </manifest>`;
      const manifest = await parseImsManifest(xml);
      expect(manifest.version).toBe('1.2');
      expect(manifest.entryPoint).toBe('index.html');
      expect(manifest.title).toBe('Demo');
      expect(manifest.items).toHaveLength(1);
    });

    it('falls back to the first resource when no SCO is marked', async () => {
      const xml = `<manifest>
        <metadata><schemaversion>2004 3rd Edition</schemaversion></metadata>
        <organizations><organization><title>T</title></organization></organizations>
        <resources><resource href="launch.html"/></resources>
      </manifest>`;
      const manifest = await parseImsManifest(xml);
      expect(manifest.version).toBe('2004');
      expect(manifest.entryPoint).toBe('launch.html');
    });

    it('throws when the manifest has no resources', async () => {
      const xml = `<manifest><resources></resources></manifest>`;
      await expect(parseImsManifest(xml)).rejects.toThrow();
    });
  });

  // =====================================================
  // statusToProgress (pure)
  // =====================================================
  describe('statusToProgress', () => {
    it('maps "passed" and "completed" to COMPLETED', () => {
      expect(statusToProgress('passed')).toBe(ProgressStatus.COMPLETED);
      expect(statusToProgress('completed')).toBe(ProgressStatus.COMPLETED);
    });

    it('maps "incomplete" to IN_PROGRESS', () => {
      expect(statusToProgress('incomplete')).toBe(ProgressStatus.IN_PROGRESS);
    });

    it('maps "not attempted" / "browsed" to NOT_STARTED', () => {
      expect(statusToProgress('not attempted')).toBe(ProgressStatus.NOT_STARTED);
      expect(statusToProgress('browsed')).toBe(ProgressStatus.NOT_STARTED);
    });

    it('maps unknown/undefined status to IN_PROGRESS', () => {
      expect(statusToProgress(undefined)).toBe(ProgressStatus.IN_PROGRESS);
      expect(statusToProgress('bananas')).toBe(ProgressStatus.IN_PROGRESS);
    });
  });

  // =====================================================
  // trackProgress
  // =====================================================
  describe('trackProgress', () => {
    const student = { id: 'student-1', role: Role.STUDENT };

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

    it('passed status → COMPLETED + score persisted', async () => {
      const res = await service.trackProgress(student, 'lesson-1', {
        lessonStatus: 'passed',
        scoreRaw: 86,
        sessionTime: 300,
      });
      expect(res.status).toBe(ProgressStatus.COMPLETED);
      expect(res.score).toBe(86);
      const call = prisma.client.lessonProgress.upsert.mock.calls[0][0];
      expect(call.update.status).toBe(ProgressStatus.COMPLETED);
      expect(call.update.completedAt).toBeInstanceOf(Date);
      expect(call.update.timeSpent).toEqual({ increment: 300 });
    });

    it('incomplete status → IN_PROGRESS, no completedAt', async () => {
      const res = await service.trackProgress(student, 'lesson-1', {
        lessonStatus: 'incomplete',
      });
      expect(res.status).toBe(ProgressStatus.IN_PROGRESS);
      const call = prisma.client.lessonProgress.upsert.mock.calls[0][0];
      expect(call.update.status).toBe(ProgressStatus.IN_PROGRESS);
      expect(call.update.completedAt).toBeUndefined();
    });

    it('404s when the lesson is missing', async () => {
      prisma.client.lesson.findUnique.mockResolvedValue(null);
      await expect(
        service.trackProgress(student, 'missing', { lessonStatus: 'passed' }),
      ).rejects.toThrow();
    });
  });
});
