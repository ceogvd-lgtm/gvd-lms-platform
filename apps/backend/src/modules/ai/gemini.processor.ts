import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../../common/prisma/prisma.service';

import { GEMINI_QUEUE } from './ai.constants';
import { QuestionSuggestService } from './question-suggest.service';
import { RagService } from './rag.service';
import { RecommendationsService } from './recommendations.service';
import { WeeklyReportService } from './weekly-report.service';

/**
 * Phase 17 — worker for GEMINI_QUEUE.
 *
 * Handles long-running / batched Gemini calls so we stay under the
 * free-tier rpm budget. Configured in the module with:
 *
 *     limiter: { max: 10, duration: 60_000 }   // ≤10 jobs/minute
 *     concurrency: 1                            // serialize
 *
 * Interactive chat is NOT routed through here — a student shouldn't
 * wait behind a batch job for their chatbot response. The chat path
 * calls Gemini directly and catches 429 as `quota_exceeded`.
 *
 * Jobs dispatched by name:
 *   - `recommendations-daily` — run the daily adaptive sweep
 *   - `weekly-report` — run the Monday 08:00 sweep
 *   - `index-lesson` — embed + push lesson PDF chunks into Chroma
 *   - `suggest-questions` — pre-warm the Q-chip cache for a lesson
 */
@Injectable()
@Processor(GEMINI_QUEUE)
export class GeminiProcessor extends WorkerHost {
  private readonly logger = new Logger(GeminiProcessor.name);

  constructor(
    private readonly recommendations: RecommendationsService,
    private readonly weekly: WeeklyReportService,
    private readonly rag: RagService,
    private readonly suggestions: QuestionSuggestService,
    // Phase 18 — update `lesson_attachments.aiIndexed` flag sau index.
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job): Promise<{ ok: true; result: unknown }> {
    this.logger.log(`Gemini job fired: name=${job.name} id=${job.id}`);
    switch (job.name) {
      case 'recommendations-daily': {
        const res = await this.recommendations.runDailySweep();
        this.logger.log(
          `recommendations-daily done — students=${res.students} generated=${res.generated}`,
        );
        return { ok: true, result: res };
      }
      case 'weekly-report': {
        const res = await this.weekly.runWeeklySweep();
        this.logger.log(`weekly-report done — students=${res.students} generated=${res.generated}`);
        return { ok: true, result: res };
      }
      case 'index-lesson-from-url': {
        const { lessonId, fileUrl, attachmentId } = job.data as {
          lessonId: string;
          fileUrl: string;
          attachmentId?: string; // Phase 18 — để update aiIndexed flag
        };
        // Download the PDF from MinIO's public URL. Kept here (not in
        // RagService) because the storage layer is a separate concern
        // — RagService only cares about raw bytes.
        const resp = await fetch(fileUrl);
        if (!resp.ok) {
          this.logger.warn(`fetch failed for ${fileUrl}: ${resp.status}`);
          return { ok: true, result: { error: 'fetch_failed' } };
        }
        const arrayBuf = await resp.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const res = await this.rag.indexDocument(lessonId, buffer);

        // Phase 18 — đánh dấu attachment đã được AI học. Chỉ set flag
        // khi thực sự có chunks được embed (res.chunks > 0). PDF quét
        // (không có text) → chunks=0 → flag=false để UI hiện warning.
        if (attachmentId && res.chunks > 0) {
          await this.prisma.client.lessonAttachment
            .update({
              where: { id: attachmentId },
              data: { aiIndexed: true, aiIndexedAt: new Date() },
            })
            .catch((err) =>
              this.logger.warn(
                `Update aiIndexed failed for ${attachmentId}: ${(err as Error).message}`,
              ),
            );
        }

        this.logger.log(
          `index-lesson done — lesson=${lessonId} chunks=${res.chunks} attachment=${attachmentId ?? '(unknown)'}`,
        );
        return { ok: true, result: res };
      }
      case 'suggest-questions': {
        const { lessonId } = job.data as { lessonId: string };
        const res = await this.suggestions.getSuggestions(lessonId);
        return { ok: true, result: { count: res.length } };
      }
      default:
        this.logger.warn(`Unknown gemini job: ${job.name}`);
        return { ok: true, result: { skipped: true } };
    }
  }
}
