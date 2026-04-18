import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { GeminiService } from './gemini.service';
import { QuotaService } from './quota.service';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Phase 17 — auto-suggested question chips.
 *
 * When a student opens a lesson the UI calls GET /ai/suggestions/:id.
 * We serve from the `AiSuggestedQuestions` cache if the row is ≤ 24h
 * old, otherwise call Gemini-lite with the lesson's overview/title
 * and persist the 5-item result.
 *
 * The cache lives in Postgres (one row per lesson) rather than Redis
 * so instructor edits + cache invalidation can be handled with a
 * single atomic UPDATE — we store `updatedAt` and compare client-side.
 */
@Injectable()
export class QuestionSuggestService {
  private readonly logger = new Logger(QuestionSuggestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly quota: QuotaService,
  ) {}

  async getSuggestions(lessonId: string): Promise<string[]> {
    // Cache hit?
    const cached = await this.prisma.client.aiSuggestedQuestions.findUnique({
      where: { lessonId },
    });
    if (cached && Date.now() - cached.updatedAt.getTime() < CACHE_TTL_MS) {
      return this.parseCache(cached.questions);
    }

    // Miss — generate fresh.
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      include: { theoryContent: { select: { overview: true } } },
    });
    if (!lesson) return [];

    const content = lesson.theoryContent?.overview || lesson.title || '';
    if (!content.trim()) return [];

    if (!this.gemini.isConfigured()) {
      return cached ? this.parseCache(cached.questions) : [];
    }

    let questions: string[] = [];
    try {
      const model = this.gemini.getLiteModel();
      const prompt = [
        'Từ nội dung bài học kỹ thuật công nghiệp dưới đây, liệt kê 5 câu hỏi ngắn mà học viên thường hỏi.',
        'Mỗi câu hỏi ≤ 15 từ, viết bằng Tiếng Việt, kết thúc bằng dấu "?".',
        'Trả về duy nhất một JSON array gồm 5 chuỗi, không thêm giải thích, không dùng markdown.',
        '---',
        `Tiêu đề: ${lesson.title}`,
        `Nội dung: ${content.slice(0, 2000)}`,
      ].join('\n');
      const result = await model.generateContent(prompt);
      await this.quota.checkAndIncrement('lite').catch(() => undefined);
      const text = result.response.text().trim();
      questions = this.parseJsonArray(text);
    } catch (err) {
      this.logger.warn(
        `suggestion generation failed for lesson=${lessonId}: ${(err as Error).message}`,
      );
      // If we had a stale cache we still prefer that to empty.
      return cached ? this.parseCache(cached.questions) : [];
    }

    if (questions.length === 0) {
      return cached ? this.parseCache(cached.questions) : [];
    }

    await this.prisma.client.aiSuggestedQuestions.upsert({
      where: { lessonId },
      update: { questions: questions as unknown as object },
      create: { lessonId, questions: questions as unknown as object },
    });
    return questions;
  }

  /**
   * Instructor-facing invalidation so an edit to a lesson's overview
   * can force a regenerate on the next GET. Not wired up yet — kept
   * here so the controller can call it when we expose a DELETE route
   * for admins to purge a stale entry.
   */
  async invalidate(lessonId: string): Promise<void> {
    await this.prisma.client.aiSuggestedQuestions
      .delete({ where: { lessonId } })
      .catch(() => undefined);
  }

  // =====================================================
  // Internals
  // =====================================================

  private parseCache(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((q): q is string => typeof q === 'string' && q.length > 0).slice(0, 5);
  }

  private parseJsonArray(text: string): string[] {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
          .slice(0, 5);
      }
    } catch {
      /* fall through to regex */
    }
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
          .slice(0, 5);
      }
    } catch {
      /* noop */
    }
    return [];
  }
}
