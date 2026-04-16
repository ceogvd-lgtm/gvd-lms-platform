import { ContentType, Role } from '@lms/database';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { SaveBodyDto, UpsertTheoryDto } from './dto/upsert-theory.dto';

interface Actor {
  id: string;
  role: Role;
}

/**
 * Public DTO returned by the API. JSON columns typed as `unknown` so the
 * Prisma `JsonValue` runtime type doesn't leak into emitted `.d.ts`
 * (TS otherwise refuses to emit the type without a portable reference).
 */
export interface TheoryContentDto {
  id: string;
  lessonId: string;
  overview: string;
  objectives: unknown;
  contentType: ContentType;
  contentUrl: string;
  duration: number | null;
  completionThreshold: number;
  body: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * CRUD for `TheoryContent` (Phase 10).
 *
 * Ownership rule (mirrors LessonsService.assertOwnership Phase 04):
 *   - INSTRUCTOR may only touch theory content of lessons that belong
 *     to a course where they are the instructor.
 *   - ADMIN+ bypasses ownership.
 */
@Injectable()
export class TheoryContentsService {
  constructor(private readonly prisma: PrismaService) {}

  // =====================================================
  // Helpers
  // =====================================================
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

  // =====================================================
  // GET — returns null if no content exists yet
  // =====================================================
  async findByLesson(actor: Actor, lessonId: string): Promise<TheoryContentDto | null> {
    await this.assertLessonOwnership(actor, lessonId);
    return this.prisma.client.theoryContent.findUnique({
      where: { lessonId },
    }) as Promise<TheoryContentDto | null>;
  }

  // =====================================================
  // UPSERT — create on first save, update on subsequent saves
  // =====================================================
  async upsert(actor: Actor, lessonId: string, dto: UpsertTheoryDto): Promise<TheoryContentDto> {
    await this.assertLessonOwnership(actor, lessonId);

    return this.prisma.client.theoryContent.upsert({
      where: { lessonId },
      update: {
        overview: dto.overview,
        objectives: dto.objectives as never,
        contentType: dto.contentType,
        contentUrl: dto.contentUrl,
        duration: dto.duration,
        completionThreshold: dto.completionThreshold ?? undefined,
        body: (dto.body ?? null) as never,
      },
      create: {
        lessonId,
        overview: dto.overview,
        objectives: dto.objectives as never,
        contentType: dto.contentType,
        contentUrl: dto.contentUrl,
        duration: dto.duration,
        completionThreshold: dto.completionThreshold ?? 0.8,
        body: (dto.body ?? null) as never,
      },
    }) as Promise<TheoryContentDto>;
  }

  // =====================================================
  // SAVE BODY — auto-save endpoint, partial update of body only
  // =====================================================
  async saveBody(actor: Actor, lessonId: string, dto: SaveBodyDto): Promise<TheoryContentDto> {
    await this.assertLessonOwnership(actor, lessonId);

    // If theory content doesn't exist yet, we create a stub so auto-save
    // can succeed before the user has filled in the rest of the form.
    return this.prisma.client.theoryContent.upsert({
      where: { lessonId },
      update: { body: dto.body as never },
      create: {
        lessonId,
        overview: '',
        objectives: [] as never,
        contentType: 'PDF',
        contentUrl: '',
        body: dto.body as never,
      },
    }) as Promise<TheoryContentDto>;
  }
}
