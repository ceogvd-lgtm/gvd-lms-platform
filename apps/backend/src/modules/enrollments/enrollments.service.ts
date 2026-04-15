import { CourseStatus } from '@lms/database';
import { Role } from '@lms/types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import type { CreateEnrollmentDto } from './dto/create-enrollment.dto';

interface Actor {
  id: string;
  role: Role;
}

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async enroll(actor: Actor, dto: CreateEnrollmentDto) {
    const course = await this.prisma.client.course.findUnique({
      where: { id: dto.courseId },
    });
    if (!course || course.isDeleted) {
      throw new NotFoundException('Không tìm thấy khoá học');
    }

    // STUDENTS: can only enroll self, and only into PUBLISHED courses.
    // ADMIN+: can enroll anyone into any non-deleted course.
    const targetStudentId = dto.studentId ?? actor.id;

    const isSelfEnroll = targetStudentId === actor.id;
    const isAdmin = actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN;

    if (!isAdmin && !isSelfEnroll) {
      throw new ForbiddenException('Chỉ ADMIN+ mới có thể enroll cho người khác');
    }
    if (!isAdmin && course.status !== CourseStatus.PUBLISHED) {
      throw new BadRequestException('Chỉ khoá học đã xuất bản mới cho phép tự enroll');
    }

    // Verify target user exists (matters when ADMIN enrolls someone).
    if (targetStudentId !== actor.id) {
      const student = await this.prisma.client.user.findUnique({
        where: { id: targetStudentId },
        select: { id: true },
      });
      if (!student) throw new NotFoundException('Không tìm thấy học viên');
    }

    try {
      return await this.prisma.client.courseEnrollment.create({
        data: { courseId: dto.courseId, studentId: targetStudentId },
        include: {
          course: { select: { id: true, title: true } },
          student: { select: { id: true, name: true, email: true } },
        },
      });
    } catch (err) {
      // Unique constraint (courseId, studentId) — already enrolled
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('Bạn đã ghi danh khoá học này rồi');
      }
      throw err;
    }
  }

  async remove(actor: Actor, id: string) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Chỉ ADMIN+ mới được xoá enrollment');
    }
    const enrollment = await this.prisma.client.courseEnrollment.findUnique({
      where: { id },
    });
    if (!enrollment) throw new NotFoundException('Không tìm thấy enrollment');

    await this.prisma.client.courseEnrollment.delete({ where: { id } });
    return { message: 'Đã huỷ ghi danh' };
  }
}
