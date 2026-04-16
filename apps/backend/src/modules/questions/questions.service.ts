import { randomBytes } from 'node:crypto';

import type { Prisma } from '@lms/database';
import { Difficulty, QuestionType, Role } from '@lms/types';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { CreateQuestionDto } from './dto/create-question.dto';
import { ImportQuestionsDto } from './dto/import-questions.dto';
import { ListQuestionsDto } from './dto/list-questions.dto';
import { QuestionOptionDto } from './dto/question-option.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

interface Actor {
  id: string;
  role: Role;
}

export interface ImportRowError {
  row: number; // 1-based, header row is row 1 → first data row is 2
  field: string;
  message: string;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: ImportRowError[];
  preview?: Array<CreateQuestionDto & { row: number }>;
}

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  // =====================================================
  // Helpers
  // =====================================================

  /** Generate a short stable id — avoids pulling in cuid() on the server. */
  private optionId(): string {
    return 'opt_' + randomBytes(8).toString('hex');
  }

  /** Normalise tags: lowercase, trim, dedupe, drop empties. */
  private normalizeTags(tags?: string[]): string[] {
    if (!tags || tags.length === 0) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of tags) {
      const t = raw.trim().toLowerCase();
      if (!t) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }

  /**
   * Validate + normalise option list according to the question type.
   * Returns a new array with stable ids and `correctAnswer` ids.
   */
  private validateAndNormalizeOptions(
    type: QuestionType,
    options: QuestionOptionDto[],
  ): { options: QuestionOptionDto[]; correctAnswer: string[] } {
    if (!Array.isArray(options) || options.length < 2) {
      throw new BadRequestException('Câu hỏi phải có ít nhất 2 lựa chọn');
    }

    const normalised: QuestionOptionDto[] = options.map((o) => ({
      id: o.id && o.id.length > 0 ? o.id : this.optionId(),
      text: o.text.trim(),
      isCorrect: Boolean(o.isCorrect),
    }));

    // Detect duplicate ids.
    const ids = new Set<string>();
    for (const opt of normalised) {
      if (ids.has(opt.id!)) {
        throw new BadRequestException('Các lựa chọn có id trùng nhau');
      }
      ids.add(opt.id!);
      if (!opt.text) {
        throw new BadRequestException('Nội dung lựa chọn không được để trống');
      }
    }

    const correct = normalised.filter((o) => o.isCorrect);

    switch (type) {
      case QuestionType.SINGLE_CHOICE: {
        if (normalised.length < 2 || normalised.length > 6) {
          throw new BadRequestException('Câu hỏi SINGLE_CHOICE cần 2–6 lựa chọn');
        }
        if (correct.length !== 1) {
          throw new BadRequestException('Câu hỏi SINGLE_CHOICE phải có đúng 1 đáp án đúng');
        }
        break;
      }
      case QuestionType.MULTI_CHOICE: {
        if (normalised.length < 2 || normalised.length > 10) {
          throw new BadRequestException('Câu hỏi MULTI_CHOICE cần 2–10 lựa chọn');
        }
        if (correct.length < 1) {
          throw new BadRequestException('Câu hỏi MULTI_CHOICE phải có ít nhất 1 đáp án đúng');
        }
        break;
      }
      case QuestionType.TRUE_FALSE: {
        if (normalised.length !== 2) {
          throw new BadRequestException('Câu hỏi TRUE_FALSE phải có đúng 2 lựa chọn');
        }
        if (correct.length !== 1) {
          throw new BadRequestException('Câu hỏi TRUE_FALSE phải có đúng 1 đáp án đúng');
        }
        // Force canonical ids so the grader can trust them.
        normalised[0]!.id = 'true';
        normalised[1]!.id = 'false';
        break;
      }
      case QuestionType.FILL_BLANK: {
        if (correct.length < 1) {
          throw new BadRequestException('Câu hỏi FILL_BLANK phải có ít nhất 1 đáp án đúng');
        }
        // For fill-in-the-blank, every option is a candidate "accepted answer".
        // Non-correct options are decoys surfaced in hints but not accepted.
        break;
      }
      default: {
        throw new BadRequestException('Loại câu hỏi không hợp lệ');
      }
    }

    const correctAnswer = correct.map((o) => o.id!);
    return { options: normalised, correctAnswer };
  }

  private mapRow(row: {
    id: string;
    courseId: string | null;
    departmentId: string | null;
    question: string;
    type: QuestionType;
    options: Prisma.JsonValue;
    correctAnswer: Prisma.JsonValue;
    explanation: string | null;
    difficulty: Difficulty;
    tags: string[];
    points: number;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    creator?: { id: string; name: string; email: string; avatar: string | null } | null;
  }) {
    return {
      id: row.id,
      courseId: row.courseId,
      departmentId: row.departmentId,
      question: row.question,
      type: row.type,
      options: (row.options ?? []) as unknown as QuestionOptionDto[],
      correctAnswer: Array.isArray(row.correctAnswer) ? (row.correctAnswer as string[]) : [],
      explanation: row.explanation,
      difficulty: row.difficulty,
      tags: row.tags,
      points: row.points,
      createdBy: row.createdBy,
      creator: row.creator ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Ownership check: INSTRUCTOR can only mutate their own questions.
   * ADMIN+ bypasses ownership entirely.
   */
  private assertCanMutate(actor: Actor, createdBy: string): void {
    if (actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN) return;
    if (actor.role === Role.INSTRUCTOR && actor.id === createdBy) return;
    throw new ForbiddenException('Bạn không có quyền với câu hỏi này');
  }

  // =====================================================
  // CREATE
  // =====================================================

  async create(actor: Actor, dto: CreateQuestionDto) {
    const { options, correctAnswer } = this.validateAndNormalizeOptions(dto.type, dto.options);

    // If courseId given, verify it exists (avoids FK error).
    if (dto.courseId) {
      const course = await this.prisma.client.course.findFirst({
        where: { id: dto.courseId, isDeleted: false },
        select: { id: true },
      });
      if (!course) throw new BadRequestException('Không tìm thấy khoá học');
    }
    if (dto.departmentId) {
      const dept = await this.prisma.client.department.findUnique({
        where: { id: dto.departmentId },
        select: { id: true },
      });
      if (!dept) throw new BadRequestException('Không tìm thấy phòng ban');
    }

    const created = await this.prisma.client.questionBank.create({
      data: {
        question: dto.question.trim(),
        type: dto.type,
        options: options as unknown as Prisma.InputJsonValue,
        correctAnswer: correctAnswer as unknown as Prisma.InputJsonValue,
        explanation: dto.explanation?.trim() || null,
        difficulty: dto.difficulty ?? Difficulty.MEDIUM,
        tags: this.normalizeTags(dto.tags),
        points: dto.points ?? 1,
        courseId: dto.courseId ?? null,
        departmentId: dto.departmentId ?? null,
        createdBy: actor.id,
      },
    });

    return this.mapRow(created);
  }

  // =====================================================
  // LIST (paginated + filter)
  // =====================================================

  async list(actor: Actor, query: ListQuestionsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.QuestionBankWhereInput = {};

    if (query.q) {
      where.question = { contains: query.q, mode: 'insensitive' };
    }
    if (query.type) where.type = query.type;
    if (query.difficulty) where.difficulty = query.difficulty;
    if (query.courseId) where.courseId = query.courseId;
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.tags && query.tags.length > 0) {
      where.tags = { hasSome: this.normalizeTags(query.tags) };
    }

    if (query.createdBy === 'me' || actor.role === Role.INSTRUCTOR) {
      // Instructors only see their own bank by default; admins see all.
      // If an instructor explicitly asks `createdBy=<other>`, we still filter
      // to themselves — prevents instructor-cross-peek even with a guessed id.
      where.createdBy = actor.id;
    } else if (query.createdBy && query.createdBy !== 'all') {
      where.createdBy = query.createdBy;
    }

    const [rows, total] = await Promise.all([
      this.prisma.client.questionBank.findMany({
        where,
        include: {
          creator: { select: { id: true, name: true, email: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.questionBank.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.mapRow(r)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // =====================================================
  // TAGS — autocomplete list
  // =====================================================

  /**
   * Collect distinct tags from questions the actor is allowed to see.
   * Implementation: select tags columns, flatten, dedupe, sort, cap at N.
   */
  async listTags(actor: Actor, q: string | undefined, limit: number = 50) {
    const where: Prisma.QuestionBankWhereInput = {};
    if (actor.role === Role.INSTRUCTOR) where.createdBy = actor.id;

    const rows = await this.prisma.client.questionBank.findMany({
      where,
      select: { tags: true },
      take: 2000, // bounded fan-out — 2k questions' tags is < 20k strings
    });

    const counts = new Map<string, number>();
    const needle = q?.trim().toLowerCase();
    for (const r of rows) {
      for (const raw of r.tags) {
        const t = raw.trim().toLowerCase();
        if (!t) continue;
        if (needle && !t.includes(needle)) continue;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));
    return { tags: sorted };
  }

  // =====================================================
  // READ one
  // =====================================================

  async findOne(actor: Actor, id: string) {
    const row = await this.prisma.client.questionBank.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy câu hỏi');

    // Instructors may only read their own bank. ADMIN+ reads everything.
    if (actor.role === Role.INSTRUCTOR && row.createdBy !== actor.id) {
      throw new ForbiddenException('Bạn không có quyền với câu hỏi này');
    }
    return this.mapRow(row);
  }

  // =====================================================
  // UPDATE
  // =====================================================

  async update(actor: Actor, id: string, dto: UpdateQuestionDto) {
    const existing = await this.prisma.client.questionBank.findUnique({
      where: { id },
      select: { id: true, createdBy: true, type: true, options: true },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy câu hỏi');

    this.assertCanMutate(actor, existing.createdBy);

    const data: Prisma.QuestionBankUpdateInput = {};
    if (dto.question !== undefined) data.question = dto.question.trim();
    if (dto.explanation !== undefined) data.explanation = dto.explanation?.trim() || null;
    if (dto.difficulty !== undefined) data.difficulty = dto.difficulty;
    if (dto.tags !== undefined) data.tags = this.normalizeTags(dto.tags);
    if (dto.points !== undefined) data.points = dto.points;
    if (dto.courseId !== undefined)
      data.course = dto.courseId ? { connect: { id: dto.courseId } } : { disconnect: true };
    if (dto.departmentId !== undefined)
      data.department = dto.departmentId
        ? { connect: { id: dto.departmentId } }
        : { disconnect: true };

    // If options or type change, re-validate the full option list.
    if (dto.type !== undefined || dto.options !== undefined) {
      const nextType = dto.type ?? existing.type;
      const nextOptions =
        dto.options ?? ((existing.options ?? []) as unknown as QuestionOptionDto[]);
      const { options, correctAnswer } = this.validateAndNormalizeOptions(nextType, nextOptions);
      data.type = nextType;
      data.options = options as unknown as Prisma.InputJsonValue;
      data.correctAnswer = correctAnswer as unknown as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.client.questionBank.update({
      where: { id },
      data,
      include: {
        creator: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });

    return this.mapRow(updated);
  }

  // =====================================================
  // DELETE (hard delete — question bank has no soft flag in schema)
  // =====================================================

  async remove(actor: Actor, id: string) {
    const existing = await this.prisma.client.questionBank.findUnique({
      where: { id },
      select: { id: true, createdBy: true, _count: { select: { quizQuestions: true } } },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy câu hỏi');

    this.assertCanMutate(actor, existing.createdBy);

    if (existing._count.quizQuestions > 0 && actor.role === Role.INSTRUCTOR) {
      throw new BadRequestException(
        'Câu hỏi đang được sử dụng trong quiz — không thể xoá. Hãy gỡ khỏi quiz trước.',
      );
    }

    // If ADMIN+ deletes and quizQuestions exist, cascade takes care of them
    // (schema sets onDelete: Cascade on QuizQuestion.questionId).
    await this.prisma.client.questionBank.delete({ where: { id } });
    return { message: 'Đã xoá câu hỏi', id };
  }

  // =====================================================
  // IMPORT (bulk create) + preview dry-run
  // =====================================================

  async importBulk(
    actor: Actor,
    dto: ImportQuestionsDto,
    opts: { dryRun?: boolean } = {},
  ): Promise<ImportResult> {
    const errors: ImportRowError[] = [];
    const accepted: Array<{ row: number; data: CreateQuestionDto }> = [];

    dto.questions.forEach((raw, idx) => {
      const rowNumber = idx + 2; // header = row 1
      try {
        // normalise per-row defaults from the form
        const merged: CreateQuestionDto = {
          question: raw.question,
          type: raw.type,
          options: raw.options,
          explanation: raw.explanation,
          difficulty: raw.difficulty,
          tags: raw.tags,
          points: raw.points,
          courseId: raw.courseId ?? dto.defaultCourseId,
          departmentId: raw.departmentId ?? dto.defaultDepartmentId,
        };
        this.validateAndNormalizeOptions(merged.type, merged.options);
        accepted.push({ row: rowNumber, data: merged });
      } catch (err) {
        errors.push({
          row: rowNumber,
          field: 'options',
          message: err instanceof Error ? err.message : 'Không hợp lệ',
        });
      }
    });

    if (opts.dryRun) {
      return {
        created: 0,
        skipped: errors.length,
        errors,
        preview: accepted.slice(0, 5).map((a) => ({ ...a.data, row: a.row })),
      };
    }

    if (accepted.length === 0) {
      return { created: 0, skipped: errors.length, errors };
    }

    // Bulk persist in a single transaction.
    const records = accepted.map(({ data }) => {
      const { options, correctAnswer } = this.validateAndNormalizeOptions(data.type, data.options);
      return {
        question: data.question.trim(),
        type: data.type,
        options: options as unknown as Prisma.InputJsonValue,
        correctAnswer: correctAnswer as unknown as Prisma.InputJsonValue,
        explanation: data.explanation?.trim() || null,
        difficulty: data.difficulty ?? Difficulty.MEDIUM,
        tags: this.normalizeTags(data.tags),
        points: data.points ?? 1,
        courseId: data.courseId ?? null,
        departmentId: data.departmentId ?? null,
        createdBy: actor.id,
      };
    });

    await this.prisma.client.questionBank.createMany({ data: records });

    return { created: records.length, skipped: errors.length, errors };
  }

  // =====================================================
  // EXPORT (lightweight JSON — frontend turns it into Excel via SheetJS)
  // =====================================================

  async exportAll(actor: Actor, query: ListQuestionsDto) {
    const listing = await this.list(actor, { ...query, page: 1, limit: 1000 });
    return {
      rows: listing.data.map((q) => ({
        question: q.question,
        type: q.type,
        optionA: q.options[0]?.text ?? '',
        optionB: q.options[1]?.text ?? '',
        optionC: q.options[2]?.text ?? '',
        optionD: q.options[3]?.text ?? '',
        correctAnswer: q.correctAnswer
          .map((id) => {
            const idx = q.options.findIndex((o) => o.id === id);
            return idx >= 0 ? String.fromCharCode(65 + idx) : id;
          })
          .join(','),
        difficulty: q.difficulty,
        tags: q.tags.join(', '),
        points: q.points,
      })),
      total: listing.total,
    };
  }
}
