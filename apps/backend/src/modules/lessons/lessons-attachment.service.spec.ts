import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { GEMINI_QUEUE } from '../ai/ai.constants';
import { QuotaService } from '../ai/quota.service';
import { CertificatesService } from '../certificates/certificates.service';
import { ProgressService } from '../progress/progress.service';
import { XpService } from '../students/xp.service';

import { LessonsService } from './lessons.service';

/**
 * Phase 18 — Auto-index PDF vào ChromaDB sau upload.
 *
 * Coverage:
 *   - Upload PDF → enqueue 'index-lesson-from-url' job
 *   - Upload non-PDF (Word/Excel/image) → KHÔNG enqueue
 *   - Quota đầy → skip enqueue, không throw
 *   - Queue/quota fail → createAttachment vẫn thành công (fire-and-forget)
 */
describe('LessonsService — createAttachment auto-index', () => {
  let service: LessonsService;
  let prisma: {
    client: {
      lesson: { findUnique: jest.Mock };
      lessonAttachment: { create: jest.Mock };
    };
  };
  let queue: { add: jest.Mock };
  let quota: { hasQuotaFor: jest.Mock };

  const actor = { id: 'instructor-1', role: 'INSTRUCTOR' as never };
  const lessonId = 'L1';

  beforeEach(async () => {
    prisma = {
      client: {
        lesson: {
          findUnique: jest.fn().mockResolvedValue({
            id: lessonId,
            isDeleted: false,
            chapter: { course: { id: 'C1', instructorId: 'instructor-1' } },
          }),
        },
        lessonAttachment: {
          create: jest.fn().mockImplementation(({ data }) =>
            Promise.resolve({
              id: 'att-1',
              lessonId: data.lessonId,
              fileName: data.fileName,
              fileUrl: data.fileUrl,
              fileSize: data.fileSize,
              mimeType: data.mimeType,
              aiIndexed: false,
              aiIndexedAt: null,
              createdAt: new Date(),
            }),
          ),
        },
      },
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    quota = { hasQuotaFor: jest.fn().mockResolvedValue(true) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        LessonsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: XpService, useValue: { award: jest.fn() } },
        { provide: ProgressService, useValue: { calculateCourseProgress: jest.fn() } },
        { provide: CertificatesService, useValue: { checkAndIssueCertificate: jest.fn() } },
        { provide: StorageService, useValue: { delete: jest.fn(), deletePrefix: jest.fn() } },
        { provide: getQueueToken(GEMINI_QUEUE), useValue: queue },
        { provide: QuotaService, useValue: quota },
      ],
    }).compile();
    service = mod.get(LessonsService);
  });

  const pdfPayload = {
    fileName: 'giao-trinh.pdf',
    fileUrl: 'http://minio:9000/lms-uploads/content/attachments/abc.pdf',
    fileSize: 1024 * 1024,
    mimeType: 'application/pdf',
  };

  it('enqueues index-lesson-from-url job for PDF attachment', async () => {
    const result = await service.createAttachment(actor, lessonId, pdfPayload);

    expect(quota.hasQuotaFor).toHaveBeenCalledWith('embedding');
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      'index-lesson-from-url',
      {
        lessonId,
        fileUrl: pdfPayload.fileUrl,
        attachmentId: 'att-1',
      },
      expect.objectContaining({ attempts: 3 }),
    );
    expect(result.id).toBe('att-1');
    expect(result.aiIndexed).toBe(false); // flag set later by worker
  });

  it('does NOT enqueue for non-PDF attachments (Word, Excel, images)', async () => {
    const cases = [
      { ...pdfPayload, fileName: 'doc.docx', mimeType: 'application/msword' },
      {
        ...pdfPayload,
        fileName: 'sheet.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      { ...pdfPayload, fileName: 'img.png', mimeType: 'image/png' },
    ];
    for (const payload of cases) {
      await service.createAttachment(actor, lessonId, payload);
    }
    expect(queue.add).not.toHaveBeenCalled();
    expect(quota.hasQuotaFor).not.toHaveBeenCalled();
  });

  it('skips enqueue when quota is full (no throw)', async () => {
    quota.hasQuotaFor.mockResolvedValueOnce(false);

    const result = await service.createAttachment(actor, lessonId, pdfPayload);

    expect(queue.add).not.toHaveBeenCalled();
    expect(result.id).toBe('att-1'); // upload vẫn thành công
  });

  it('createAttachment succeeds even when queue.add throws (fire-and-forget)', async () => {
    queue.add.mockRejectedValueOnce(new Error('Redis down'));

    // Must not throw — upload result returned normally.
    const result = await service.createAttachment(actor, lessonId, pdfPayload);
    expect(result.id).toBe('att-1');
  });

  it('createAttachment succeeds even when quota check throws (fire-and-forget)', async () => {
    quota.hasQuotaFor.mockRejectedValueOnce(new Error('DB error'));

    const result = await service.createAttachment(actor, lessonId, pdfPayload);
    expect(result.id).toBe('att-1');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('throws NotFound when lesson does not exist (hook not reached)', async () => {
    prisma.client.lesson.findUnique.mockResolvedValueOnce(null);
    await expect(service.createAttachment(actor, lessonId, pdfPayload)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(queue.add).not.toHaveBeenCalled();
  });
});
