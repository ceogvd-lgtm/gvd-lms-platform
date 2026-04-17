import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

export interface LessonNoteRow {
  lessonId: string;
  studentId: string;
  content: unknown;
  updatedAt: Date;
}

@Injectable()
export class LessonNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async getNote(studentId: string, lessonId: string): Promise<LessonNoteRow | null> {
    const row = await this.prisma.client.lessonNote.findUnique({
      where: { lessonId_studentId: { lessonId, studentId } },
    });
    if (!row) return null;
    return {
      lessonId: row.lessonId,
      studentId: row.studentId,
      content: row.content,
      updatedAt: row.updatedAt,
    };
  }

  async upsertNote(studentId: string, lessonId: string, content: unknown): Promise<LessonNoteRow> {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, isDeleted: true },
    });
    if (!lesson || lesson.isDeleted) throw new NotFoundException('Không tìm thấy bài giảng');

    const row = await this.prisma.client.lessonNote.upsert({
      where: { lessonId_studentId: { lessonId, studentId } },
      update: { content: content as never },
      create: { lessonId, studentId, content: content as never },
    });
    return {
      lessonId: row.lessonId,
      studentId: row.studentId,
      content: row.content,
      updatedAt: row.updatedAt,
    };
  }
}
