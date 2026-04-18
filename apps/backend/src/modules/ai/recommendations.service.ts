import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { AI_RECOMMENDATION_TYPES } from './ai.constants';
import { GeminiService } from './gemini.service';
import { QuotaService } from './quota.service';

interface WeakPoints {
  weakTopics: string[];
  lowScoreLessons: Array<{ id: string; title: string; score: number }>;
  practiceViolations: number;
  inactiveDays: number;
}

/**
 * Phase 17 — Adaptive learning recommendations.
 *
 * Runs once a day on every active student (via GEMINI_QUEUE triggered
 * from CronProcessor). For each student we compute a tiny "weak
 * points" summary and ask Gemini-lite to turn it into ≤3 Vietnamese
 * one-line suggestions, stored as `AiRecommendation` rows.
 *
 * All model interactions are wrapped in try/catch → silent fail. A
 * broken daily sweep is never fatal — yesterday's recommendations
 * stay on the student's dashboard until the next run succeeds.
 */
@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly quota: QuotaService,
  ) {}

  // =====================================================
  // Public — read API used by /ai/recommendations
  // =====================================================

  /** Latest unread recs for a student, newest first, capped at 5. */
  async listUnread(studentId: string, limit = 5) {
    return this.prisma.client.aiRecommendation.findMany({
      where: { studentId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        lesson: { select: { id: true, title: true } },
      },
    });
  }

  async markRead(id: string, studentId: string): Promise<void> {
    const rec = await this.prisma.client.aiRecommendation.findUnique({
      where: { id },
      select: { studentId: true },
    });
    if (!rec || rec.studentId !== studentId) {
      throw new Error('Không tìm thấy gợi ý');
    }
    await this.prisma.client.aiRecommendation.update({
      where: { id },
      data: { isRead: true },
    });
  }

  // =====================================================
  // Cron entry — called by CronProcessor / GEMINI_QUEUE
  // =====================================================

  /**
   * Sweep every active student. One-by-one to keep Gemini calls
   * sequential (free-tier rpm budget). Returns a small summary so the
   * worker can log it.
   */
  async runDailySweep(): Promise<{ students: number; generated: number }> {
    const enrolledStudents = await this.prisma.client.courseEnrollment.findMany({
      where: { completedAt: null },
      select: { studentId: true },
      distinct: ['studentId'],
    });

    let generated = 0;
    for (const { studentId } of enrolledStudents) {
      try {
        const added = await this.generateForStudent(studentId);
        generated += added;
      } catch (err) {
        this.logger.warn(
          `recommendations failed for student=${studentId}: ${(err as Error).message}`,
        );
      }
    }
    return { students: enrolledStudents.length, generated };
  }

  /**
   * Per-student generator. Pulls weak-point stats, asks Gemini-lite
   * for up to 3 tips, upserts them as `AiRecommendation` rows. Returns
   * the number of new rows actually created.
   */
  async generateForStudent(studentId: string): Promise<number> {
    const stats = await this.collectWeakPoints(studentId);
    const hasAnything =
      stats.weakTopics.length > 0 ||
      stats.lowScoreLessons.length > 0 ||
      stats.practiceViolations > 0 ||
      stats.inactiveDays >= 3;
    if (!hasAnything) return 0;

    if (!this.gemini.isConfigured()) return 0;

    const lines: string[] = [];
    try {
      const model = this.gemini.getLiteModel();
      const prompt = [
        'Phân tích kết quả học tập của một học viên kỹ thuật công nghiệp và đưa ra TỐI ĐA 3 gợi ý cải thiện.',
        'Mỗi gợi ý là một câu Tiếng Việt ngắn gọn (dưới 25 từ).',
        'Trả về duy nhất JSON array of strings, không thêm giải thích, không dùng markdown.',
        '---',
        `Chủ đề yếu: ${stats.weakTopics.join(', ') || 'không có'}`,
        `Bài điểm thấp: ${stats.lowScoreLessons.map((l) => l.title).join(', ') || 'không có'}`,
        `Vi phạm ATLĐ khi thực hành: ${stats.practiceViolations}`,
        `Số ngày không hoạt động: ${stats.inactiveDays}`,
      ].join('\n');

      const result = await model.generateContent(prompt);
      await this.quota.checkAndIncrement('lite').catch(() => undefined);
      const text = result.response.text().trim();
      const parsed = this.extractJsonArray(text);
      for (const line of parsed.slice(0, 3)) {
        if (typeof line === 'string' && line.trim().length > 0) {
          lines.push(line.trim());
        }
      }
    } catch (err) {
      this.logger.warn(
        `Gemini recommendation generation failed for ${studentId}: ${(err as Error).message}`,
      );
      return 0;
    }

    if (lines.length === 0) return 0;

    // Pick a `type` for each suggestion via keyword heuristics so the
    // frontend can show an icon without relying on the model to emit
    // a structured type tag.
    const rows = lines.map((content) => ({
      studentId,
      content,
      type: this.classifyContent(content),
      // `lessonId` kept null for now — future work: match suggestion
      // back to the specific lesson it's about.
      lessonId: null as string | null,
    }));

    const result = await this.prisma.client.aiRecommendation.createMany({
      data: rows,
    });
    return result.count;
  }

  // =====================================================
  // Internals
  // =====================================================

  /**
   * Aggregate the "weak points" for one student. Intentionally cheap
   * — four small queries, no N+1. Score scale in LessonProgress.score
   * is RAW (0..maxScore) per the Phase 15 contract, so we compare
   * against a low-raw threshold rather than a percentage.
   */
  async collectWeakPoints(studentId: string): Promise<WeakPoints> {
    const DAY = 24 * 60 * 60 * 1000;

    // Low-score lessons — raw score < 50 (Phase 15 stores raw, not %).
    const lowScore = await this.prisma.client.lessonProgress.findMany({
      where: { studentId, score: { not: null, lt: 50 } },
      orderBy: { score: 'asc' },
      take: 5,
      include: {
        lesson: { select: { id: true, title: true, chapter: { select: { title: true } } } },
      },
    });
    const lowScoreLessons = lowScore.map((p) => ({
      id: p.lessonId,
      title: p.lesson.title,
      score: p.score ?? 0,
    }));

    // Weak topics = distinct chapter titles among low-score lessons.
    const weakTopics = Array.from(
      new Set(lowScore.map((p) => p.lesson.chapter?.title).filter((s): s is string => !!s)),
    );

    const practiceViolations = await this.prisma.client.practiceAttempt.count({
      where: { studentId, hasCriticalViolation: true },
    });

    const lastActivity = await this.prisma.client.courseEnrollment.findFirst({
      where: { studentId },
      orderBy: { lastActiveAt: 'desc' },
      select: { lastActiveAt: true },
    });
    const inactiveDays = lastActivity
      ? Math.max(0, Math.floor((Date.now() - lastActivity.lastActiveAt.getTime()) / DAY))
      : 999; // never-active counts as a huge gap

    return { weakTopics, lowScoreLessons, practiceViolations, inactiveDays };
  }

  /** Parse `[...]` even if the model added stray prose around it. */
  private extractJsonArray(text: string): unknown[] {
    try {
      // Preferred — model obeyed the JSON-only instruction.
      const direct = JSON.parse(text);
      return Array.isArray(direct) ? direct : [];
    } catch {
      // Fallback — find the first `[...]` block.
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return [];
      try {
        const parsed = JSON.parse(match[0]);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
  }

  private classifyContent(content: string): string {
    const lower = content.toLowerCase();
    if (/(an toàn|atld|atvsl|ppe|bảo hộ)/i.test(lower)) {
      return AI_RECOMMENDATION_TYPES.SAFETY_REMINDER;
    }
    if (/(thực hành|luyện tập|practice|bài tập)/i.test(lower)) {
      return AI_RECOMMENDATION_TYPES.PRACTICE_MORE;
    }
    if (/(ôn|xem lại|review|bài học)/i.test(lower)) {
      return AI_RECOMMENDATION_TYPES.REVIEW_LESSON;
    }
    return AI_RECOMMENDATION_TYPES.ADAPTIVE;
  }
}
