import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { InjectQueue } from '@nestjs/bullmq';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Response } from 'express';

import { PrismaService } from '../../common/prisma/prisma.service';
import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { GEMINI_QUEUE } from './ai.constants';
import { ChatService } from './chat.service';
import { ChatDto, IndexLessonDto, RateMessageDto } from './dto/chat.dto';
import { GeminiService } from './gemini.service';
import { QuestionSuggestService } from './question-suggest.service';
import { QuotaService } from './quota.service';
import { RagService } from './rag.service';
import { RecommendationsService } from './recommendations.service';

/**
 * Phase 17 — AI Learning Assistant surface.
 *
 *   POST   /ai/chat                         AUTH, STUDENT+   SSE stream
 *   GET    /ai/suggestions/:lessonId        AUTH             5 question chips
 *   GET    /ai/recommendations              AUTH, STUDENT+   unread cards
 *   PATCH  /ai/recommendations/:id/read     AUTH, STUDENT+   mark read
 *   POST   /ai/index-lesson                 INSTRUCTOR own/ADMIN+  RAG index job
 *   PATCH  /ai/chat/:messageId/rating       AUTH             thumbs-up/-down
 *   GET    /ai/health                       ADMIN+           quota + chroma snapshot
 *
 * All routes expect the global `/api/v1/` prefix (set in main.ts).
 */
@Controller('ai')
export class AiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly chat: ChatService,
    private readonly rag: RagService,
    private readonly quota: QuotaService,
    private readonly suggestions: QuestionSuggestService,
    private readonly recommendations: RecommendationsService,
    @InjectQueue(GEMINI_QUEUE) private readonly queue: Queue,
  ) {}

  // =====================================================
  // Chat
  // =====================================================

  /**
   * SSE chat endpoint. Writes `data: ` frames directly to the response
   * and ends the stream when the model is done. The client must set
   * `Accept: text/event-stream`.
   *
   * Because we write the body ourselves, we return void — NestJS
   * leaves the response alone once we call `res.end()`.
   */
  @Post('chat')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  async chatStream(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChatDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.chat.streamReply(dto, res, user.sub);
  }

  @Patch('chat/:messageId/rating')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  async rateMessage(
    @CurrentUser() user: JwtPayload,
    @Param('messageId') messageId: string,
    @Body() dto: RateMessageDto,
  ) {
    try {
      return await this.chat.rateMessage(messageId, user.sub, dto.rating);
    } catch (err) {
      throw new NotFoundException((err as Error).message);
    }
  }

  // =====================================================
  // Suggested questions (per-lesson)
  // =====================================================

  @Get('suggestions/:lessonId')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  async getSuggestions(@Param('lessonId') lessonId: string) {
    const questions = await this.suggestions.getSuggestions(lessonId);
    return { lessonId, questions };
  }

  // =====================================================
  // Recommendations
  // =====================================================

  @Get('recommendations')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  async listRecommendations(@CurrentUser() user: JwtPayload) {
    const rows = await this.recommendations.listUnread(user.sub);
    return { data: rows };
  }

  @Patch('recommendations/:id/read')
  @Roles(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async markRecommendationRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    try {
      await this.recommendations.markRead(id, user.sub);
      return { ok: true };
    } catch (err) {
      throw new NotFoundException((err as Error).message);
    }
  }

  // =====================================================
  // Index lesson content for RAG
  // =====================================================

  /**
   * Enqueue a BullMQ job that pulls the lesson's first PDF attachment
   * and indexes it into Chroma. We don't accept a raw file here —
   * callers must have already uploaded via the Phase 06 storage
   * endpoints. This keeps the AI surface thin and reuses the existing
   * MinIO authz.
   */
  @Post('index-lesson')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN)
  async indexLesson(@CurrentUser() user: JwtPayload, @Body() dto: IndexLessonDto) {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: dto.lessonId },
      include: {
        chapter: { select: { course: { select: { instructorId: true } } } },
        attachments: {
          where: { mimeType: 'application/pdf' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài học');

    // INSTRUCTOR may only index their own lessons; ADMIN+ can index anything.
    if (user.role === Role.INSTRUCTOR && lesson.chapter.course.instructorId !== user.sub) {
      throw new ForbiddenException('Bạn không giảng dạy bài học này');
    }

    if (lesson.attachments.length === 0) {
      throw new NotFoundException(
        'Bài học chưa có file PDF để AI có thể index. Upload file trước.',
      );
    }

    // We enqueue the *url* only — the worker fetches the PDF bytes
    // from MinIO itself (avoids pushing large buffers through Redis).
    await this.queue.add('index-lesson-from-url', {
      lessonId: dto.lessonId,
      fileUrl: lesson.attachments[0]!.fileUrl,
    });

    return {
      enqueued: true,
      lessonId: dto.lessonId,
      attachment: {
        fileName: lesson.attachments[0]!.fileName,
        fileSize: lesson.attachments[0]!.fileSize,
      },
    };
  }

  // =====================================================
  // Admin health snapshot
  // =====================================================

  @Get('health')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async health() {
    const [quota, chroma, docCount] = await Promise.all([
      this.quota.getTodaySnapshot(),
      this.rag.ping(),
      this.rag.getIndexedDocCount(),
    ]);
    return {
      gemini: {
        configured: this.gemini.isConfigured(),
        models: this.gemini.isConfigured() ? this.gemini.getModelIds() : null,
      },
      quotaToday: quota,
      chroma: { ...chroma, indexedDocuments: docCount },
    };
  }
}
