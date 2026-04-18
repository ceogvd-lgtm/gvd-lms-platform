import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';

import { PrismaService } from '../../common/prisma/prisma.service';

import type { ChatDto } from './dto/chat.dto';
import { GeminiService } from './gemini.service';
import { QuotaService } from './quota.service';
import { RagService } from './rag.service';

interface StudentSnapshot {
  id: string;
  name: string;
  role: string;
}

interface LessonSnapshot {
  id: string;
  title: string;
  type: string;
  status: string | null;
  overview: string | null;
}

/**
 * Phase 17 — streaming chatbot.
 *
 * Flow for POST /ai/chat:
 *   1. Check quota + increment (chat bucket).
 *   2. Fire-and-forget RAG retrieve + student/lesson lookup in parallel.
 *   3. Build a Vietnamese system prompt that includes student name,
 *      current lesson (if any), their progress, and RAG context.
 *   4. Stream the model response back over SSE.
 *   5. When the stream finishes — persist both sides (user turn +
 *      final assistant turn) for transcript history + rating.
 *
 * 429 handling: Gemini surfaces quota-exhausted errors with
 * `error.status === 429`. We translate those into a clean
 * `{error:"quota_exceeded"}` SSE frame instead of throwing, so the
 * client can show a friendly message without a full error modal.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly rag: RagService,
    private readonly quota: QuotaService,
  ) {}

  /**
   * Run the chat turn and pipe tokens to `res` as SSE frames.
   *
   * Keep the method `async` but we drive the response with `res.write`
   * rather than returning a body — NestJS's default router doesn't
   * interfere once the controller returns. We pass `res` in directly
   * and call `res.end()` at the top level.
   */
  async streamReply(dto: ChatDto, res: Response, studentId: string): Promise<void> {
    this.setupSseHeaders(res);
    const sessionId = dto.sessionId ?? randomUUID();
    res.write(`data: ${JSON.stringify({ sessionId })}\n\n`);

    if (!this.gemini.isConfigured()) {
      res.write(`data: ${JSON.stringify({ error: 'ai_disabled' })}\n\n`);
      res.end();
      return;
    }

    try {
      await this.quota.checkAndIncrement('chat');
    } catch {
      /* counter failure shouldn't block the user */
    }

    const [student, lesson, ragContext] = await Promise.all([
      this.loadStudent(studentId),
      dto.lessonId ? this.loadLesson(dto.lessonId, studentId) : Promise.resolve(null),
      dto.lessonId ? this.rag.retrieve(dto.message, dto.lessonId) : Promise.resolve(''),
    ]);

    const systemPrompt = this.buildSystemPrompt(student, lesson, ragContext);

    let userMessageId: string | null = null;
    try {
      // Save the user turn before we stream so a thumbs-rating on the
      // matching model turn can be joined by sessionId if the stream
      // errors mid-flight.
      const saved = await this.prisma.client.aiChatMessage.create({
        data: {
          sessionId,
          studentId,
          lessonId: dto.lessonId ?? null,
          role: 'user',
          content: dto.message,
        },
        select: { id: true },
      });
      userMessageId = saved.id;
      res.write(`data: ${JSON.stringify({ userMessageId })}\n\n`);
    } catch (err) {
      this.logger.warn(`failed to persist user turn: ${(err as Error).message}`);
    }

    const model = this.gemini.getChatModel();
    const chat = model.startChat({
      history: (dto.history ?? []).map((m) => ({
        role: m.role,
        parts: [{ text: m.content }],
      })),
      // Gemini REST expects systemInstruction as a Content object, not a
      // raw string — passing a string yields `400 Invalid value at
      // 'system_instruction'`. Wrap as `{ role, parts }` so the SDK
      // serialises it correctly.
      systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
    });

    let fullResponse = '';
    try {
      const result = await chat.sendMessageStream(dto.message);
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }
      // Save the assistant turn and surface its id so the client can
      // attach a rating later. We do this before "[DONE]" so the
      // client has everything it needs before the stream closes.
      if (fullResponse) {
        try {
          const saved = await this.prisma.client.aiChatMessage.create({
            data: {
              sessionId,
              studentId,
              lessonId: dto.lessonId ?? null,
              role: 'model',
              content: fullResponse,
            },
            select: { id: true },
          });
          res.write(`data: ${JSON.stringify({ messageId: saved.id })}\n\n`);
        } catch (err) {
          this.logger.warn(`failed to persist model turn: ${(err as Error).message}`);
        }
      }
      res.write('data: [DONE]\n\n');
    } catch (err) {
      const status = (err as { status?: number }).status;
      const code = status === 429 ? 'quota_exceeded' : 'ai_error';
      this.logger.warn(`chat stream error (${code}): ${(err as Error).message}`);
      res.write(`data: ${JSON.stringify({ error: code })}\n\n`);
    } finally {
      res.end();
    }
  }

  /**
   * Attach / flip the thumbs rating on an already-saved assistant
   * message. Rating == 0 is NOT accepted (DTO enforces 1|-1) — if you
   * want to clear a rating, delete-and-re-rate rather than reset.
   */
  async rateMessage(
    messageId: string,
    studentId: string,
    rating: 1 | -1,
  ): Promise<{ id: string; rating: number }> {
    const msg = await this.prisma.client.aiChatMessage.findUnique({
      where: { id: messageId },
      select: { id: true, studentId: true },
    });
    if (!msg || msg.studentId !== studentId) {
      throw new Error('Không tìm thấy tin nhắn hoặc không có quyền');
    }
    const updated = await this.prisma.client.aiChatMessage.update({
      where: { id: messageId },
      data: { rating },
      select: { id: true, rating: true },
    });
    return { id: updated.id, rating: updated.rating! };
  }

  // =====================================================
  // Internals
  // =====================================================
  private setupSseHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering
    res.flushHeaders?.();
  }

  private async loadStudent(studentId: string): Promise<StudentSnapshot | null> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, role: true },
    });
    return user ? { id: user.id, name: user.name, role: user.role } : null;
  }

  private async loadLesson(lessonId: string, studentId: string): Promise<LessonSnapshot | null> {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        title: true,
        type: true,
        // Pull the theory overview so the system prompt can tell Gemini
        // what the lesson is about even without RAG / PDF indexing.
        // Without this, the model only knew the title + type and would
        // answer "Tôi không có thông tin cụ thể về bài học này".
        theoryContent: { select: { overview: true } },
      },
    });
    if (!lesson) return null;
    const progress = await this.prisma.client.lessonProgress.findUnique({
      where: { lessonId_studentId: { lessonId, studentId } },
      select: { status: true },
    });
    return {
      id: lesson.id,
      title: lesson.title,
      type: lesson.type,
      overview: lesson.theoryContent?.overview ?? null,
      status: progress?.status ?? null,
    };
  }

  private buildSystemPrompt(
    student: StudentSnapshot | null,
    lesson: LessonSnapshot | null,
    ragContext: string,
  ): string {
    const lines: string[] = [
      'Bạn là trợ lý học tập AI của hệ thống GVD LMS, chuyên về đào tạo kỹ thuật công nghiệp tại Việt Nam.',
      student ? `Học viên: ${student.name}` : '',
      lesson ? `Bài học hiện tại: ${lesson.title} (${lesson.type})` : '',
      lesson?.overview ? `Mô tả bài học: ${lesson.overview.slice(0, 800)}` : '',
      lesson?.status ? `Tiến độ bài học: ${lesson.status}` : '',
      ragContext ? `Tài liệu liên quan:\n${ragContext.slice(0, 4000)}` : '',
      'Nhiệm vụ: hỗ trợ giải thích khái niệm kỹ thuật, quy trình vận hành, an toàn lao động.',
      'Trả lời bằng Tiếng Việt, ngắn gọn, chính xác, dùng ví dụ thực tế công nghiệp khi phù hợp.',
      'Nếu câu hỏi liên quan đến an toàn lao động, hãy luôn nhắc người học tuân thủ quy tắc ATVSLĐ.',
      'Nếu không đủ thông tin để trả lời, thành thật nói không biết — đừng bịa.',
      'Không lặp lại câu trả lời hoặc đoạn văn đã viết.',
    ];
    return lines.filter(Boolean).join('\n');
  }
}
