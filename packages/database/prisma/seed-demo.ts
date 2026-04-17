/**
 * Idempotent seed for a Phase 01–13 demo environment.
 *
 * Run from the repo root:
 *   pnpm --filter @lms/database tsx prisma/seed-demo.ts
 *
 * Safe to re-run: everything is upserted on a stable unique key so you
 * can tweak this file and re-seed without wiping existing data.
 *
 * What lands in the DB:
 *   - 2 new users (INSTRUCTOR + STUDENT) alongside the seed SUPER_ADMIN
 *   - Department "Kỹ thuật công nghiệp" / Subject "An toàn lao động"
 *   - Course "PPE cơ bản" (PUBLISHED) with 2 chapters and 4 lessons
 *   - 5 QuestionBank items covering every QuestionType
 *   - 1 Quiz on the first lesson (3 questions, pass 70%, 10 min)
 *   - Enrollment for the demo student
 *
 * Prints a link block at the end with the real IDs so you can copy-paste
 * into a browser.
 */

// Side-effect import MUST come first so DATABASE_URL is in env before
// Prisma Client loads it at import time.
import './load-env';

import * as bcrypt from 'bcrypt';

import { prisma } from '../src';

const BCRYPT_ROUNDS = 10;
const log = (msg: string) => console.log(`  ${msg}`);

type UserInput = {
  email: string;
  name: string;
  plainPassword: string;
  role: 'INSTRUCTOR' | 'STUDENT';
};

async function upsertUser({ email, name, plainPassword, role }: UserInput) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    log(`✓ User ${email} already exists (role=${existing.role})`);
    return existing;
  }
  const password = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: { email, name, password, role, emailVerified: true },
  });
  log(`✓ Created user ${email} (role=${role})`);
  return user;
}

async function upsertDepartment() {
  return prisma.department.upsert({
    where: { code: 'KTCN' },
    update: {},
    create: {
      code: 'KTCN',
      name: 'Kỹ thuật công nghiệp',
      description: 'Khoa đào tạo kỹ thuật công nghiệp & an toàn lao động',
      order: 0,
      isActive: true,
    },
  });
}

async function upsertSubject(departmentId: string) {
  return prisma.subject.upsert({
    where: { code: 'ATLD' },
    update: { departmentId },
    create: {
      code: 'ATLD',
      departmentId,
      name: 'An toàn lao động',
      description: 'Môn học về quy định an toàn và phòng chống tai nạn lao động',
      order: 0,
    },
  });
}

async function upsertCourse({
  subjectId,
  instructorId,
}: {
  subjectId: string;
  instructorId: string;
}) {
  const existing = await prisma.course.findFirst({
    where: { subjectId, title: 'PPE cơ bản' },
  });
  if (existing) {
    log(`✓ Course "PPE cơ bản" exists — id=${existing.id}`);
    return existing;
  }
  const course = await prisma.course.create({
    data: {
      subjectId,
      instructorId,
      title: 'PPE cơ bản',
      description:
        'Khoá học giới thiệu về thiết bị bảo hộ cá nhân (Personal Protective Equipment) — quy trình chọn lựa, kiểm tra và sử dụng đúng cách.',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      version: 1,
    },
  });
  log(`✓ Created course "PPE cơ bản" — id=${course.id}`);
  return course;
}

async function upsertChapter({
  courseId,
  title,
  order,
}: {
  courseId: string;
  title: string;
  order: number;
}) {
  const existing = await prisma.chapter.findFirst({ where: { courseId, title } });
  if (existing) return existing;
  return prisma.chapter.create({ data: { courseId, title, order } });
}

async function upsertLesson({
  chapterId,
  title,
  type,
  order,
}: {
  chapterId: string;
  title: string;
  type: 'THEORY' | 'PRACTICE';
  order: number;
}) {
  const existing = await prisma.lesson.findFirst({
    where: { chapterId, title, isDeleted: false },
  });
  if (existing) return existing;
  return prisma.lesson.create({
    data: { chapterId, title, type, order, isPublished: true },
  });
}

async function upsertQuestions(ownerId: string, departmentId: string) {
  const specs: Array<{
    type: 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK';
    question: string;
    options: string[];
    correctAnswer: number[];
    explanation: string;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    points: number;
  }> = [
    {
      type: 'SINGLE_CHOICE',
      question: 'PPE là viết tắt của cụm từ nào?',
      options: [
        'Personal Protection Equipment',
        'Personal Protective Equipment',
        'Public Protective Equipment',
        'Personal Physical Equipment',
      ],
      correctAnswer: [1],
      explanation: 'PPE = Personal Protective Equipment — thiết bị bảo hộ cá nhân.',
      difficulty: 'EASY',
      points: 1,
    },
    {
      type: 'SINGLE_CHOICE',
      question: 'Bước đầu tiên khi kiểm tra PPE trước khi sử dụng là gì?',
      options: [
        'Đeo ngay vào người',
        'Kiểm tra bằng mắt tìm hư hỏng',
        'Rửa sạch bằng nước',
        'Ký xác nhận sổ',
      ],
      correctAnswer: [1],
      explanation: 'Luôn visual-check trước khi đeo — phát hiện rách, thủng, mòn.',
      difficulty: 'EASY',
      points: 1,
    },
    {
      type: 'MULTI_CHOICE',
      question: 'Những loại PPE nào thuộc nhóm bảo vệ đầu?',
      options: ['Mũ cứng', 'Kính bảo hộ', 'Giày bảo hộ', 'Mặt nạ hàn'],
      correctAnswer: [0, 1, 3],
      explanation:
        'Mũ cứng, kính, mặt nạ hàn — tất cả bảo vệ vùng đầu/mặt. Giày bảo hộ bảo vệ chân.',
      difficulty: 'MEDIUM',
      points: 2,
    },
    {
      type: 'TRUE_FALSE',
      question: 'Có thể dùng PPE đã hết hạn sử dụng nếu chưa hư hỏng rõ rệt?',
      options: ['Đúng', 'Sai'],
      correctAnswer: [1],
      explanation:
        'Sai — PPE hết hạn phải thay mới dù nhìn còn tốt. Vật liệu đã xuống cấp bên trong.',
      difficulty: 'EASY',
      points: 1,
    },
    {
      type: 'FILL_BLANK',
      question: 'Tiêu chuẩn Việt Nam về mũ bảo hộ công nghiệp là TCVN ___',
      options: ['2603:1987', '2606:2018', '2605:2020', '2604:1991'],
      correctAnswer: [1],
      explanation: 'TCVN 2606:2018 — Mũ an toàn công nghiệp.',
      difficulty: 'HARD',
      points: 2,
    },
  ];

  const result = [];
  for (const s of specs) {
    const existing = await prisma.questionBank.findFirst({
      where: { createdBy: ownerId, question: s.question },
    });
    if (existing) {
      result.push(existing);
      continue;
    }
    const q = await prisma.questionBank.create({
      data: {
        question: s.question,
        type: s.type,
        options: s.options,
        correctAnswer: s.correctAnswer,
        explanation: s.explanation,
        difficulty: s.difficulty,
        points: s.points,
        tags: ['PPE', 'an-toan-lao-dong'],
        createdBy: ownerId,
        departmentId,
      },
    });
    result.push(q);
  }
  log(`✓ Questions ready — ${result.length} items`);
  return result;
}

async function upsertQuiz({
  lessonId,
  questions,
}: {
  lessonId: string;
  questions: Array<{ id: string; points: number }>;
}) {
  const existing = await prisma.quiz.findFirst({ where: { lessonId } });
  if (existing) {
    log(`✓ Quiz on lesson ${lessonId} exists — id=${existing.id}`);
    return existing;
  }
  const quiz = await prisma.quiz.create({
    data: {
      lessonId,
      title: 'Kiểm tra bài 1 — PPE cơ bản',
      timeLimit: 10,
      passScore: 70,
      maxAttempts: 3,
      shuffleQuestions: false,
      showAnswerAfter: true,
    },
  });

  for (const [idx, q] of questions.slice(0, 3).entries()) {
    await prisma.quizQuestion.create({
      data: { quizId: quiz.id, questionId: q.id, order: idx, points: q.points },
    });
  }
  log(`✓ Created quiz — id=${quiz.id} (3 questions attached)`);
  return quiz;
}

async function enrollStudent({ courseId, studentId }: { courseId: string; studentId: string }) {
  await prisma.courseEnrollment.upsert({
    where: { courseId_studentId: { courseId, studentId } },
    update: {},
    create: { courseId, studentId },
  });
  log(`✓ Student enrolled in course`);
}

async function main() {
  console.log('\n===== Seeding Phase 01–13 demo data =====\n');

  const admin = await prisma.user.findUnique({ where: { email: 'admin@lms.local' } });
  if (!admin) throw new Error('SUPER_ADMIN admin@lms.local not found — run db:seed first');
  log(`✓ Found SUPER_ADMIN ${admin.email}`);

  const instructor = await upsertUser({
    email: 'instructor@lms.local',
    name: 'Demo Instructor',
    plainPassword: 'Instructor@123456',
    role: 'INSTRUCTOR',
  });

  const student = await upsertUser({
    email: 'student@lms.local',
    name: 'Demo Student',
    plainPassword: 'Student@123456',
    role: 'STUDENT',
  });

  const department = await upsertDepartment();
  log(`✓ Department "${department.name}" — id=${department.id}`);

  const subject = await upsertSubject(department.id);
  log(`✓ Subject "${subject.name}" — id=${subject.id}`);

  const course = await upsertCourse({ subjectId: subject.id, instructorId: instructor.id });

  const chapter1 = await upsertChapter({
    courseId: course.id,
    title: 'Chương 1 — Lý thuyết',
    order: 0,
  });
  log(`✓ Chapter 1 — id=${chapter1.id}`);

  const chapter2 = await upsertChapter({
    courseId: course.id,
    title: 'Chương 2 — Thực hành',
    order: 1,
  });
  log(`✓ Chapter 2 — id=${chapter2.id}`);

  const lesson1 = await upsertLesson({
    chapterId: chapter1.id,
    title: 'Bài 1 — Giới thiệu PPE',
    type: 'THEORY',
    order: 0,
  });
  const lesson2 = await upsertLesson({
    chapterId: chapter1.id,
    title: 'Bài 2 — Quy trình kiểm tra',
    type: 'THEORY',
    order: 1,
  });
  const lesson3 = await upsertLesson({
    chapterId: chapter1.id,
    title: 'Bài 3 — SCORM test',
    type: 'THEORY',
    order: 2,
  });
  const practiceLesson = await upsertLesson({
    chapterId: chapter2.id,
    title: 'Thực hành đeo PPE',
    type: 'PRACTICE',
    order: 0,
  });
  log(`✓ Lessons ready — 3 THEORY + 1 PRACTICE`);

  const questions = await upsertQuestions(instructor.id, department.id);
  const quiz = await upsertQuiz({ lessonId: lesson1.id, questions });

  await enrollStudent({ courseId: course.id, studentId: student.id });

  console.log('\n===== DONE — IDs =====\n');
  console.log(
    JSON.stringify(
      {
        instructorId: instructor.id,
        studentId: student.id,
        departmentId: department.id,
        subjectId: subject.id,
        courseId: course.id,
        chapter1Id: chapter1.id,
        chapter2Id: chapter2.id,
        lesson1Id: lesson1.id,
        lesson2Id: lesson2.id,
        lesson3Id: lesson3.id,
        practiceLessonId: practiceLesson.id,
        quizId: quiz.id,
      },
      null,
      2,
    ),
  );
  console.log('\n');
}

main()
  .catch((err) => {
    console.error('❌ SEED FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
