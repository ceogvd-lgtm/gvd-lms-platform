import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';

import { GEMINI_QUEUE } from './ai.constants';
import { AiController } from './ai.controller';
import { AiScheduler } from './ai.scheduler';
import { ChatService } from './chat.service';
import { GeminiProcessor } from './gemini.processor';
import { GeminiService } from './gemini.service';
import { QuestionSuggestService } from './question-suggest.service';
import { QuotaService } from './quota.service';
import { RagService } from './rag.service';
import { RecommendationsService } from './recommendations.service';
import { WeeklyReportService } from './weekly-report.service';

/**
 * Phase 17 — AI Learning Assistant (Gemini + ChromaDB).
 *
 * Owns one BullMQ queue (GEMINI_QUEUE) used for all batch Gemini work:
 *   - daily adaptive recommendations
 *   - Monday weekly report narratives
 *   - PDF indexing into Chroma
 *   - suggested-question pre-warming
 *
 * The queue is rate-limited at module registration to 10 jobs/minute
 * — a hard guardrail against the Gemini free-tier 60 rpm ceiling when
 * a burst of students triggers suggestion generation at once. Chat
 * streaming does NOT use this queue (it calls the SDK directly so the
 * student isn't blocked behind batch jobs).
 */
@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: GEMINI_QUEUE,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 4000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    }),
  ],
  controllers: [AiController],
  providers: [
    GeminiService,
    QuotaService,
    RagService,
    ChatService,
    RecommendationsService,
    WeeklyReportService,
    QuestionSuggestService,
    GeminiProcessor,
    AiScheduler,
  ],
  exports: [
    GeminiService,
    QuotaService,
    RagService,
    ChatService,
    RecommendationsService,
    WeeklyReportService,
    QuestionSuggestService,
  ],
})
export class AiModule {}
