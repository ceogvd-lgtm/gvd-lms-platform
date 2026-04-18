import { ProgressStatus } from '@lms/database';
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { AI_RECOMMENDATION_TYPES } from './ai.constants';
import { GeminiService } from './gemini.service';
import { QuotaService } from './quota.service';

interface WeekSummary {
  completedLessons: number;
  avgScorePercent: number;
  totalMinutes: number;
  safetyViolations: number;
}

/**
 * Phase 17 — weekly progress narrative.
 *
 * Fires from GEMINI_QUEUE every Monday 08:00. For every student with
 * at least one activity in the past 7 days we:
 *   1. Summarise their week (lessons / avg score / time / violations)
 *   2. Ask Gemini-lite for a short encouraging paragraph (Vietnamese)
 *   3. Persist it as an `AiRecommendation` (type ADAPTIVE) so the
 *      student's dashboard surfaces it next time they log in.
 *
 * If Gemini is offline or returns something unparseable we still
 * insert a deterministic fallback sentence — a broken model shouldn't
 * block the weekly cadence students rely on.
 *
 * We picked the recommendation feed (not email) as the delivery
 * channel because it reuses existing UI + respects the student's
 * in-app preference without spamming SMTP during the free-tier phase.
 */
@Injectable()
export class WeeklyReportService {
  private readonly logger = new Logger(WeeklyReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly quota: QuotaService,
  ) {}

  // =====================================================
  // Cron entry point
  // =====================================================

  async runWeeklySweep(): Promise<{ students: number; generated: number }> {
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - WEEK);

    const [progRows, attemptRows] = await Promise.all([
      this.prisma.client.lessonProgress.findMany({
        where: { lastViewAt: { gte: since } },
        select: { studentId: true },
        distinct: ['studentId'],
      }),
      this.prisma.client.quizAttempt.findMany({
        where: { completedAt: { gte: since } },
        select: { studentId: true },
        distinct: ['studentId'],
      }),
    ]);
    const ids = new Set([
      ...progRows.map((p) => p.studentId),
      ...attemptRows.map((a) => a.studentId),
    ]);

    let generated = 0;
    for (const studentId of ids) {
      try {
        const ok = await this.generateAndStore(studentId);
        if (ok) generated += 1;
      } catch (err) {
        this.logger.warn(`weekly report failed for ${studentId}: ${(err as Error).message}`);
      }
    }
    return { students: ids.size, generated };
  }

  /**
   * Ad-hoc entry — returns the narrative string without persisting.
   * Handy for tests + future "preview" endpoint.
   */
  async generateReportText(studentId: string): Promise<string> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const summary = await this.summariseWeek(studentId, since);
    return this.generateNarrative(summary);
  }

  // =====================================================
  // Internals
  // =====================================================

  private async generateAndStore(studentId: string): Promise<boolean> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const summary = await this.summariseWeek(studentId, since);
    if (summary.completedLessons === 0 && summary.avgScorePercent === 0) {
      return false;
    }
    const narrative = await this.generateNarrative(summary);
    await this.prisma.client.aiRecommendation.create({
      data: {
        studentId,
        type: AI_RECOMMENDATION_TYPES.ADAPTIVE,
        content: narrative,
      },
    });
    return true;
  }

  /**
   * Compact one-week summary shaped so the Gemini prompt stays short.
   * Score is reported as a 0-100 PERCENT: quiz attempts expose both
   * raw score + maxScore, so we aggregate the total/max ratio rather
   * than averaging per-attempt percentages (avoids skew when one
   * attempt is a tiny 2-question quiz).
   */
  private async summariseWeek(studentId: string, since: Date): Promise<WeekSummary> {
    const [completedProg, attempts, practiceViolations, timeProg] = await Promise.all([
      this.prisma.client.lessonProgress.count({
        where: {
          studentId,
          status: ProgressStatus.COMPLETED,
          completedAt: { gte: since },
        },
      }),
      this.prisma.client.quizAttempt.aggregate({
        where: { studentId, completedAt: { gte: since } },
        _sum: { score: true, maxScore: true },
      }),
      this.prisma.client.practiceAttempt.count({
        where: {
          studentId,
          hasCriticalViolation: true,
          createdAt: { gte: since },
        },
      }),
      this.prisma.client.lessonProgress.aggregate({
        where: { studentId, lastViewAt: { gte: since } },
        _sum: { timeSpent: true },
      }),
    ]);

    const totalScore = attempts._sum.score ?? 0;
    const maxScore = attempts._sum.maxScore ?? 0;
    const avgScorePercent = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const totalMinutes = Math.round((timeProg._sum.timeSpent ?? 0) / 60);

    return {
      completedLessons: completedProg,
      avgScorePercent,
      totalMinutes,
      safetyViolations: practiceViolations,
    };
  }

  /** Ask Gemini-lite; fall back to a canned sentence if anything goes wrong. */
  async generateNarrative(summary: WeekSummary): Promise<string> {
    const fallback = `Tuần này bạn đã hoàn thành ${summary.completedLessons} bài học với điểm trung bình ${summary.avgScorePercent}%. Hãy tiếp tục cố gắng!`;

    if (!this.gemini.isConfigured()) return fallback;
    try {
      const model = this.gemini.getLiteModel();
      const prompt = [
        'Viết báo cáo tiến độ học tập tuần qua bằng Tiếng Việt cho một học viên kỹ thuật công nghiệp.',
        'Giọng điệu thân thiện, khuyến khích, khoảng 3-4 câu.',
        'Nêu một điểm nổi bật và một lời khuyên cụ thể cho tuần tới.',
        'KHÔNG dùng markdown, chỉ text thuần, không emoji.',
        '---',
        `Bài đã hoàn thành: ${summary.completedLessons}`,
        `Điểm trung bình: ${summary.avgScorePercent}%`,
        `Thời gian học: ${summary.totalMinutes} phút`,
        `Vi phạm ATLĐ: ${summary.safetyViolations}`,
      ].join('\n');
      const result = await model.generateContent(prompt);
      await this.quota.checkAndIncrement('lite').catch(() => undefined);
      const text = result.response.text().trim();
      return text.length > 0 ? text : fallback;
    } catch (err) {
      this.logger.warn(`weekly narrative fallback: ${(err as Error).message}`);
      return fallback;
    }
  }
}
