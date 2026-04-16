import { Role } from '@lms/database';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { UpsertPracticeDto } from './dto/upsert-practice.dto';

interface Actor {
  id: string;
  role: Role;
}

/** Public DTO with `unknown` JSON columns to keep emitted `.d.ts` portable. */
export interface PracticeContentDto {
  id: string;
  lessonId: string;
  introduction: string;
  objectives: unknown;
  webglUrl: string;
  scoringConfig: unknown;
  safetyChecklist: unknown;
  passScore: number;
  timeLimit: number | null;
  maxAttempts: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * CRUD for `PracticeContent` (Phase 10).
 *
 * Same ownership rule as TheoryContentsService. The actual WebGL runtime
 * lives elsewhere (out of Phase 10 scope) — this service just persists
 * the metadata: webglUrl, scoringConfig, safetyChecklist, passScore.
 */
@Injectable()
export class PracticeContentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertLessonOwnership(actor: Actor, lessonId: string): Promise<void> {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      include: {
        chapter: { include: { course: { select: { instructorId: true } } } },
      },
    });
    if (!lesson || lesson.isDeleted) {
      throw new NotFoundException('Không tìm thấy bài giảng');
    }
    if (actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN) return;
    if (actor.role === Role.INSTRUCTOR && actor.id === lesson.chapter.course.instructorId) {
      return;
    }
    throw new ForbiddenException('Bạn không có quyền với bài giảng này');
  }

  async findByLesson(actor: Actor, lessonId: string): Promise<PracticeContentDto | null> {
    await this.assertLessonOwnership(actor, lessonId);
    return this.prisma.client.practiceContent.findUnique({
      where: { lessonId },
    }) as Promise<PracticeContentDto | null>;
  }

  async upsert(
    actor: Actor,
    lessonId: string,
    dto: UpsertPracticeDto,
  ): Promise<PracticeContentDto> {
    await this.assertLessonOwnership(actor, lessonId);

    return this.prisma.client.practiceContent.upsert({
      where: { lessonId },
      update: {
        introduction: dto.introduction,
        objectives: dto.objectives as never,
        webglUrl: dto.webglUrl,
        scoringConfig: dto.scoringConfig as never,
        safetyChecklist: dto.safetyChecklist as never,
        passScore: dto.passScore,
        timeLimit: dto.timeLimit,
        maxAttempts: dto.maxAttempts,
      },
      create: {
        lessonId,
        introduction: dto.introduction,
        objectives: dto.objectives as never,
        webglUrl: dto.webglUrl,
        scoringConfig: dto.scoringConfig as never,
        safetyChecklist: dto.safetyChecklist as never,
        passScore: dto.passScore,
        timeLimit: dto.timeLimit,
        maxAttempts: dto.maxAttempts,
      },
    }) as Promise<PracticeContentDto>;
  }
}
