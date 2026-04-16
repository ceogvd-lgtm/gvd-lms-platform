import { ProgressStatus, Role } from '@lms/database';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { XapiStatementDto } from './dto/statement.dto';

interface Actor {
  id: string;
  role: Role;
}

/**
 * Map between xAPI verb IRIs and the project's ProgressStatus.
 *
 * Only the three "completion" verbs in scope for Phase 12 are listed —
 * anything else (`experienced`, `interacted`, `attempted`, …) keeps the
 * lesson in IN_PROGRESS and just records a learning event.
 *
 * Extracted as a const so the spec file can assert the mapping without
 * mocking Prisma.
 */
export const VERB_STATUS_MAP: Record<string, ProgressStatus> = {
  'http://adlnet.gov/expapi/verbs/completed': ProgressStatus.COMPLETED,
  'http://adlnet.gov/expapi/verbs/passed': ProgressStatus.COMPLETED,
  'http://adlnet.gov/expapi/verbs/failed': ProgressStatus.IN_PROGRESS,
};

export interface ParsedStatement {
  verb: string;
  status: ProgressStatus;
  scoreRaw: number | null;
  success: boolean | null;
}

/**
 * Pure parser — turns a raw xAPI statement into the fields we persist.
 * Separated out because the spec suite relies on exercising parsing
 * without going through the database.
 */
export function parseStatement(dto: XapiStatementDto): ParsedStatement {
  const verb = dto.verb?.id ?? '';
  const status = VERB_STATUS_MAP[verb] ?? ProgressStatus.IN_PROGRESS;
  const rawScore = dto.result?.score?.raw;
  const scoreRaw = typeof rawScore === 'number' ? Math.round(rawScore) : null;
  const success = typeof dto.result?.success === 'boolean' ? dto.result.success : null;
  return { verb, status, scoreRaw, success };
}

/**
 * Minimal LRS stub (Phase 12).
 *
 * We keep statements in a JSON column on a new record of the existing
 * {@link Notification} shape? No — there's no dedicated xAPI table and
 * we don't want to grow the schema in Phase 12. Instead the parser
 * translates each statement to a `LessonProgress` upsert, and the raw
 * statement is returned back to the client so it can be echoed into a
 * local browser log if the content pack wants it.
 *
 * A future phase can add a proper `xapi_statements` table if the need
 * arises (e.g. exporting to Learning Record Store).
 */
@Injectable()
export class XapiService {
  private readonly logger = new Logger(XapiService.name);

  constructor(private readonly prisma: PrismaService) {}

  // =====================================================
  // Resolve the `object.id` IRI to an internal lessonId.
  // Convention: content packs are configured with
  //   activity-id=https://lms.local/xapi/lessons/{id}
  // so we just strip the known prefix and accept the last path segment.
  // =====================================================
  private extractLessonId(objectId: string): string | null {
    if (!objectId) return null;
    const m = objectId.match(/\/lessons\/([^/?#]+)/);
    return m ? m[1]! : null;
  }

  // =====================================================
  // Persist a statement — returns what the caller stored.
  // =====================================================
  async recordStatement(
    actor: Actor,
    dto: XapiStatementDto,
  ): Promise<{
    lessonId: string;
    status: ProgressStatus;
    score: number | null;
    verb: string;
  }> {
    const parsed = parseStatement(dto);

    const lessonId = this.extractLessonId(dto.object?.id ?? '');
    if (!lessonId) {
      throw new NotFoundException(
        'object.id phải có dạng .../lessons/{lessonId} để LRS ghi được tiến độ',
      );
    }

    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, isDeleted: true },
    });
    if (!lesson || lesson.isDeleted) {
      throw new NotFoundException('Không tìm thấy bài giảng trong hệ thống');
    }

    const now = new Date();
    const row = await this.prisma.client.lessonProgress.upsert({
      where: {
        lessonId_studentId: { lessonId, studentId: actor.id },
      },
      update: {
        status: parsed.status,
        score: parsed.scoreRaw ?? undefined,
        lastViewAt: now,
        completedAt: parsed.status === ProgressStatus.COMPLETED ? now : undefined,
      },
      create: {
        lessonId,
        studentId: actor.id,
        status: parsed.status,
        score: parsed.scoreRaw ?? undefined,
        lastViewAt: now,
        completedAt: parsed.status === ProgressStatus.COMPLETED ? now : null,
      },
    });

    this.logger.log(
      `xAPI verb=${parsed.verb} lessonId=${lessonId} studentId=${actor.id} → ${row.status}`,
    );

    return {
      lessonId,
      status: row.status,
      score: row.score,
      verb: parsed.verb,
    };
  }

  // =====================================================
  // Read — LRS-style fetch of a student's recent statements for a lesson.
  //
  // We don't store raw statements, so this returns the derived progress
  // timeline (just the LessonProgress row — enough for the frontend to
  // decide whether to show "Continue" or "Completed").
  // =====================================================
  async listForLesson(actor: Actor, lessonId: string) {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, isDeleted: true },
    });
    if (!lesson || lesson.isDeleted) throw new NotFoundException('Không tìm thấy bài giảng');

    return this.prisma.client.lessonProgress.findUnique({
      where: {
        lessonId_studentId: { lessonId, studentId: actor.id },
      },
    });
  }
}
