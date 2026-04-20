import { Role } from '@lms/types';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import type { CreateChapterDto } from './dto/create-chapter.dto';
import type { UpdateChapterDto } from './dto/update-chapter.dto';

interface Actor {
  id: string;
  role: Role;
}

@Injectable()
export class ChaptersService {
  constructor(private readonly prisma: PrismaService) {}

  private assertOwnership(actor: Actor, instructorId: string): void {
    if (actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN) return;
    if (actor.role === Role.INSTRUCTOR && actor.id === instructorId) return;
    throw new ForbiddenException('Bạn không có quyền với chương này');
  }

  // =====================================================
  // LIST chapters of a course (with lessons)
  // =====================================================
  async listByCourse(courseId: string) {
    return this.prisma.client.chapter.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
      include: {
        lessons: {
          where: { isDeleted: false },
          orderBy: { order: 'asc' },
          select: { id: true, title: true, type: true, order: true },
        },
      },
    });
  }

  // =====================================================
  // CREATE chapter under course
  // =====================================================
  async create(actor: Actor, courseId: string, dto: CreateChapterDto) {
    const course = await this.prisma.client.course.findUnique({
      where: { id: courseId },
      select: { id: true, instructorId: true, isDeleted: true },
    });
    if (!course || course.isDeleted) {
      throw new NotFoundException('Không tìm thấy khoá học');
    }
    this.assertOwnership(actor, course.instructorId);

    // New chapter goes at the end of the current ordering.
    const lastOrder = await this.prisma.client.chapter.findFirst({
      where: { courseId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    return this.prisma.client.chapter.create({
      data: {
        courseId,
        title: dto.title,
        description: dto.description,
        order: (lastOrder?.order ?? -1) + 1,
      },
    });
  }

  // =====================================================
  // UPDATE
  // =====================================================
  async update(actor: Actor, id: string, dto: UpdateChapterDto) {
    const chapter = await this.prisma.client.chapter.findUnique({
      where: { id },
      include: { course: { select: { instructorId: true } } },
    });
    if (!chapter) throw new NotFoundException('Không tìm thấy chương');
    this.assertOwnership(actor, chapter.course.instructorId);

    return this.prisma.client.chapter.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
  }

  // =====================================================
  // REORDER — shift neighbours to keep `order` gap-free
  //
  // Strategy: read all chapters of the course, remove the dragged one from
  // its current slot, insert it at `newOrder`, rewrite every order with
  // the new index in a single transaction. Slightly heavier than a clever
  // delta-update but safe against concurrent drags and trivial to reason
  // about.
  // =====================================================
  async reorder(actor: Actor, id: string, newOrder: number) {
    const chapter = await this.prisma.client.chapter.findUnique({
      where: { id },
      include: { course: { select: { id: true, instructorId: true } } },
    });
    if (!chapter) throw new NotFoundException('Không tìm thấy chương');
    this.assertOwnership(actor, chapter.course.instructorId);

    const all = await this.prisma.client.chapter.findMany({
      where: { courseId: chapter.course.id },
      orderBy: { order: 'asc' },
      select: { id: true },
    });

    const withoutDragged = all.filter((c) => c.id !== id);
    const clampedPos = Math.min(Math.max(0, newOrder), withoutDragged.length);
    const next = [
      ...withoutDragged.slice(0, clampedPos),
      { id },
      ...withoutDragged.slice(clampedPos),
    ];

    await this.prisma.client.$transaction(
      next.map((c, idx) =>
        this.prisma.client.chapter.update({
          where: { id: c.id },
          data: { order: idx },
        }),
      ),
    );

    return { message: 'Đã cập nhật thứ tự chương', chapters: next };
  }

  // =====================================================
  // DELETE — ADMIN+ bất kỳ lúc nào; INSTRUCTOR chỉ khi course
  // đang DRAFT + chưa có enrollment nào (Phase 18).
  //
  // Vì sao có giới hạn với INSTRUCTOR: CLAUDE.md rule gốc là "Tuyệt đối
  // không xoá" — nhưng user báo lỗi UX khi bấm nhầm trong lúc soạn thảo.
  // Giải pháp: mở an toàn trong giai đoạn DRAFT (chưa ai học) — sau khi
  // gửi duyệt / publish thì quay lại rule cũ (admin-only) để bảo toàn
  // content + tiến độ học viên.
  // =====================================================
  async remove(actor: Actor, id: string) {
    const chapter = await this.prisma.client.chapter.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            id: true,
            instructorId: true,
            status: true,
            _count: { select: { enrollments: true } },
          },
        },
      },
    });
    if (!chapter) throw new NotFoundException('Không tìm thấy chương');

    this.assertOwnership(actor, chapter.course.instructorId);

    // Instructor chỉ xoá được khi course còn DRAFT + chưa có học viên.
    // ADMIN+ bypass mọi check (là ngoại lệ hệ thống để gỡ kẹt).
    if (actor.role === Role.INSTRUCTOR) {
      if (chapter.course.status !== 'DRAFT') {
        throw new BadRequestException(
          `Không thể xoá — khoá học đang ở trạng thái ${chapter.course.status}. ` +
            `Chỉ xoá được khi còn Nháp. Liên hệ admin nếu cần xử lý.`,
        );
      }
      if (chapter.course._count.enrollments > 0) {
        throw new BadRequestException(
          `Không thể xoá — đã có ${chapter.course._count.enrollments} học viên đăng ký khoá học. ` +
            `Liên hệ admin để xử lý.`,
        );
      }
    }

    // Prisma cascades to child lessons via schema onDelete: Cascade.
    await this.prisma.client.chapter.delete({ where: { id } });
    return { message: 'Đã xoá chương' };
  }
}
