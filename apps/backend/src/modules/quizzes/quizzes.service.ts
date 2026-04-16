import type { Difficulty, Prisma, QuestionType } from '@lms/database';
import { Role } from '@lms/types';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import { AddQuestionDto, RandomPickDto, ReorderQuestionsDto } from './dto/add-question.dto';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';

interface Actor {
  id: string;
  role: Role;
}

interface RequestMeta {
  ip: string;
}

/**
 * Response shapes for getForLesson — written out explicitly so the compiler
 * doesn't try to name internal Prisma types (`@prisma/client/runtime/library`)
 * in emitted declarations, which would be non-portable.
 */
export interface QuizQuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizForLessonQuestion {
  id: string;
  questionId: string;
  order: number;
  points: number;
  question: {
    id: string;
    question: string;
    type: QuestionType;
    difficulty: Difficulty;
    tags: string[];
    options: QuizQuestionOption[];
    explanation: string | null;
    correctAnswer: string[];
  };
}

export interface QuizForLessonResponse {
  id: string;
  lessonId: string;
  title: string;
  timeLimit: number | null;
  shuffleQuestions: boolean;
  showAnswerAfter: boolean;
  passScore: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  totalPoints: number;
  questions: QuizForLessonQuestion[];
}

@Injectable()
export class QuizzesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // =====================================================
  // Ownership helpers
  // =====================================================

  /**
   * Load the quiz along with the enough context to run RBAC:
   * `lesson → chapter → course.instructorId`.
   */
  private async findQuizWithCourse(id: string) {
    return this.prisma.client.quiz.findUnique({
      where: { id },
      include: {
        lesson: {
          include: {
            chapter: {
              include: {
                course: { select: { id: true, instructorId: true } },
              },
            },
          },
        },
      },
    });
  }

  private async findLessonWithCourse(id: string) {
    return this.prisma.client.lesson.findUnique({
      where: { id },
      include: {
        chapter: {
          include: {
            course: { select: { id: true, instructorId: true } },
          },
        },
      },
    });
  }

  private assertCourseOwner(actor: Actor, courseInstructorId: string): void {
    if (actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN) return;
    if (actor.role === Role.INSTRUCTOR && actor.id === courseInstructorId) return;
    throw new ForbiddenException('Bạn không có quyền với quiz của bài giảng này');
  }

  // =====================================================
  // GET /lessons/:id/quiz
  // Students (any authenticated viewer) can fetch; full answer keys are
  // redacted when the caller is not the course owner or admin.
  // =====================================================
  async getForLesson(
    actor: Actor,
    lessonId: string,
    opts: { hideAnswers: boolean },
  ): Promise<QuizForLessonResponse | null> {
    const lesson = await this.findLessonWithCourse(lessonId);
    if (!lesson || lesson.isDeleted) throw new NotFoundException('Không tìm thấy bài giảng');

    const quiz = await this.prisma.client.quiz.findFirst({
      where: { lessonId },
      include: {
        questions: {
          include: { question: true },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!quiz) return null;

    const isOwner =
      actor.role === Role.ADMIN ||
      actor.role === Role.SUPER_ADMIN ||
      (actor.role === Role.INSTRUCTOR && actor.id === lesson.chapter.course.instructorId);

    const hideAnswers = opts.hideAnswers && !isOwner;

    const totalPoints = quiz.questions.reduce((sum, q) => sum + q.points, 0);

    return {
      id: quiz.id,
      lessonId: quiz.lessonId,
      title: quiz.title,
      timeLimit: quiz.timeLimit,
      shuffleQuestions: quiz.shuffleQuestions,
      showAnswerAfter: quiz.showAnswerAfter,
      passScore: quiz.passScore,
      maxAttempts: quiz.maxAttempts,
      createdAt: quiz.createdAt,
      updatedAt: quiz.updatedAt,
      totalPoints,
      questions: quiz.questions.map((qq) => ({
        id: qq.id,
        questionId: qq.questionId,
        order: qq.order,
        points: qq.points,
        question: {
          id: qq.question.id,
          question: qq.question.question,
          type: qq.question.type,
          difficulty: qq.question.difficulty,
          tags: qq.question.tags,
          options: this.redactOptions(qq.question.options, qq.question.type, hideAnswers),
          explanation: hideAnswers ? null : qq.question.explanation,
          correctAnswer: hideAnswers
            ? []
            : Array.isArray(qq.question.correctAnswer)
              ? (qq.question.correctAnswer as string[])
              : [],
        },
      })),
    };
  }

  /**
   * Strip `isCorrect` flags from options when the viewer shouldn't see them.
   * For FILL_BLANK we hide the whole option set (the "decoys + answers" shape
   * would leak the answers otherwise).
   */
  private redactOptions(
    options: Prisma.JsonValue,
    type: QuestionType,
    hide: boolean,
  ): QuizQuestionOption[] {
    if (!Array.isArray(options)) return [];
    const arr = options as unknown as QuizQuestionOption[];
    if (!hide) return arr;
    if (type === 'FILL_BLANK') return [];
    return arr.map((o) => ({
      id: o.id,
      text: o.text,
      isCorrect: false, // always flatten
    }));
  }

  // =====================================================
  // POST /lessons/:id/quiz — create quiz for lesson
  // =====================================================
  async createForLesson(actor: Actor, lessonId: string, dto: CreateQuizDto) {
    const lesson = await this.findLessonWithCourse(lessonId);
    if (!lesson || lesson.isDeleted) throw new NotFoundException('Không tìm thấy bài giảng');
    this.assertCourseOwner(actor, lesson.chapter.course.instructorId);

    const existing = await this.prisma.client.quiz.findFirst({ where: { lessonId } });
    if (existing) {
      throw new BadRequestException('Bài giảng này đã có quiz — hãy chỉnh sửa quiz hiện có.');
    }

    const quiz = await this.prisma.client.quiz.create({
      data: {
        lessonId,
        title: dto.title.trim(),
        timeLimit: dto.timeLimit ?? null,
        shuffleQuestions: dto.shuffleQuestions ?? false,
        showAnswerAfter: dto.showAnswerAfter ?? true,
        passScore: dto.passScore,
        maxAttempts: dto.maxAttempts ?? 3,
      },
    });
    return quiz;
  }

  // =====================================================
  // PATCH /quizzes/:id
  // =====================================================
  async update(actor: Actor, id: string, dto: UpdateQuizDto) {
    const quiz = await this.findQuizWithCourse(id);
    if (!quiz) throw new NotFoundException('Không tìm thấy quiz');
    this.assertCourseOwner(actor, quiz.lesson.chapter.course.instructorId);

    const data: Prisma.QuizUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.timeLimit !== undefined) data.timeLimit = dto.timeLimit ?? null;
    if (dto.shuffleQuestions !== undefined) data.shuffleQuestions = dto.shuffleQuestions;
    if (dto.showAnswerAfter !== undefined) data.showAnswerAfter = dto.showAnswerAfter;
    if (dto.passScore !== undefined) data.passScore = dto.passScore;
    if (dto.maxAttempts !== undefined) data.maxAttempts = dto.maxAttempts;

    return this.prisma.client.quiz.update({ where: { id }, data });
  }

  // =====================================================
  // DELETE /quizzes/:id (ADMIN+ only per CLAUDE.md)
  // =====================================================
  async remove(actor: Actor, id: string, meta: RequestMeta) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Chỉ quản trị viên mới có quyền xoá quiz');
    }
    const quiz = await this.prisma.client.quiz.findUnique({
      where: { id },
      select: { id: true, title: true, lessonId: true },
    });
    if (!quiz) throw new NotFoundException('Không tìm thấy quiz');

    await this.prisma.client.quiz.delete({ where: { id } });

    await this.audit.log({
      userId: actor.id,
      action: 'QUIZ_DELETE',
      targetType: 'Quiz',
      targetId: id,
      ipAddress: meta.ip,
      oldValue: { title: quiz.title, lessonId: quiz.lessonId },
      newValue: null,
    });

    return { message: 'Đã xoá quiz', id };
  }

  // =====================================================
  // QUIZ QUESTIONS — add / remove / reorder / random pick
  // =====================================================

  async addQuestion(actor: Actor, quizId: string, dto: AddQuestionDto) {
    const quiz = await this.findQuizWithCourse(quizId);
    if (!quiz) throw new NotFoundException('Không tìm thấy quiz');
    this.assertCourseOwner(actor, quiz.lesson.chapter.course.instructorId);

    const question = await this.prisma.client.questionBank.findUnique({
      where: { id: dto.questionId },
      select: { id: true, points: true, createdBy: true },
    });
    if (!question) throw new NotFoundException('Không tìm thấy câu hỏi trong ngân hàng');

    // Dedup: skip if already present.
    const existing = await this.prisma.client.quizQuestion.findUnique({
      where: { quizId_questionId: { quizId, questionId: dto.questionId } },
    });
    if (existing) {
      throw new BadRequestException('Câu hỏi đã có trong quiz');
    }

    const last = await this.prisma.client.quizQuestion.findFirst({
      where: { quizId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    return this.prisma.client.quizQuestion.create({
      data: {
        quizId,
        questionId: dto.questionId,
        order: (last?.order ?? -1) + 1,
        points: dto.points ?? question.points,
      },
    });
  }

  async addQuestionsBulk(actor: Actor, quizId: string, questionIds: string[]) {
    const quiz = await this.findQuizWithCourse(quizId);
    if (!quiz) throw new NotFoundException('Không tìm thấy quiz');
    this.assertCourseOwner(actor, quiz.lesson.chapter.course.instructorId);

    if (questionIds.length === 0) return { added: 0, skipped: 0 };

    const questions = await this.prisma.client.questionBank.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, points: true },
    });
    const pointByQ = new Map(questions.map((q) => [q.id, q.points]));

    const already = await this.prisma.client.quizQuestion.findMany({
      where: { quizId, questionId: { in: questionIds } },
      select: { questionId: true },
    });
    const alreadySet = new Set(already.map((q) => q.questionId));

    const fresh = questionIds.filter((id) => pointByQ.has(id) && !alreadySet.has(id));
    const last = await this.prisma.client.quizQuestion.findFirst({
      where: { quizId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const startOrder = (last?.order ?? -1) + 1;

    if (fresh.length === 0) return { added: 0, skipped: questionIds.length };

    await this.prisma.client.quizQuestion.createMany({
      data: fresh.map((qid, idx) => ({
        quizId,
        questionId: qid,
        order: startOrder + idx,
        points: pointByQ.get(qid) ?? 1,
      })),
    });

    return {
      added: fresh.length,
      skipped: questionIds.length - fresh.length,
    };
  }

  async randomPick(actor: Actor, quizId: string, dto: RandomPickDto) {
    const quiz = await this.findQuizWithCourse(quizId);
    if (!quiz) throw new NotFoundException('Không tìm thấy quiz');
    this.assertCourseOwner(actor, quiz.lesson.chapter.course.instructorId);

    const where: Prisma.QuestionBankWhereInput = {};
    if (dto.type) where.type = dto.type as QuestionType;
    if (dto.difficulty) where.difficulty = dto.difficulty as Difficulty;
    if (dto.courseId) where.courseId = dto.courseId;
    if (dto.tags && dto.tags.length > 0) where.tags = { hasSome: dto.tags };
    // Instructors can only pick from their own bank.
    if (actor.role === Role.INSTRUCTOR) where.createdBy = actor.id;
    // Exclude questions already in the quiz.
    const inQuiz = await this.prisma.client.quizQuestion.findMany({
      where: { quizId },
      select: { questionId: true },
    });
    if (inQuiz.length > 0) {
      where.id = { notIn: inQuiz.map((q) => q.questionId) };
    }

    // Pull a bounded pool, then shuffle in-memory. This avoids DB-dependent
    // random ordering that differs between Postgres and SQLite (the test DB).
    const POOL_CAP = 500;
    const pool = await this.prisma.client.questionBank.findMany({
      where,
      select: { id: true, points: true },
      take: POOL_CAP,
    });
    if (pool.length === 0) {
      return { added: 0, skipped: 0, pool: 0 };
    }
    // Fisher–Yates
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const chosen = pool.slice(0, Math.min(dto.count, pool.length));

    const result = await this.addQuestionsBulk(
      actor,
      quizId,
      chosen.map((c) => c.id),
    );
    return { ...result, pool: pool.length };
  }

  async removeQuestion(actor: Actor, quizId: string, questionId: string) {
    const quiz = await this.findQuizWithCourse(quizId);
    if (!quiz) throw new NotFoundException('Không tìm thấy quiz');
    this.assertCourseOwner(actor, quiz.lesson.chapter.course.instructorId);

    const row = await this.prisma.client.quizQuestion.findUnique({
      where: { quizId_questionId: { quizId, questionId } },
    });
    if (!row) throw new NotFoundException('Câu hỏi không có trong quiz');

    await this.prisma.client.quizQuestion.delete({
      where: { quizId_questionId: { quizId, questionId } },
    });

    // Compact orders for the remaining questions.
    const remaining = await this.prisma.client.quizQuestion.findMany({
      where: { quizId },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    await this.prisma.client.$transaction(
      remaining.map((r, idx) =>
        this.prisma.client.quizQuestion.update({
          where: { id: r.id },
          data: { order: idx },
        }),
      ),
    );

    return { message: 'Đã gỡ câu hỏi khỏi quiz', quizId, questionId };
  }

  async reorderQuestions(actor: Actor, quizId: string, dto: ReorderQuestionsDto) {
    const quiz = await this.findQuizWithCourse(quizId);
    if (!quiz) throw new NotFoundException('Không tìm thấy quiz');
    this.assertCourseOwner(actor, quiz.lesson.chapter.course.instructorId);

    const existing = await this.prisma.client.quizQuestion.findMany({
      where: { quizId },
      select: { id: true },
    });
    const existingSet = new Set(existing.map((r) => r.id));
    if (dto.orderedIds.length !== existing.length) {
      throw new BadRequestException('Danh sách reorder thiếu hoặc thừa câu hỏi');
    }
    for (const id of dto.orderedIds) {
      if (!existingSet.has(id)) {
        throw new BadRequestException('Danh sách reorder chứa id không thuộc quiz này');
      }
    }

    await this.prisma.client.$transaction(
      dto.orderedIds.map((id, idx) =>
        this.prisma.client.quizQuestion.update({
          where: { id },
          data: { order: idx },
        }),
      ),
    );

    return { message: 'Đã cập nhật thứ tự câu hỏi', count: dto.orderedIds.length };
  }
}
