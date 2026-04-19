/**
 * Diagnose stuck/orphan questions in QuestionBank.
 *
 * Background: if a lesson is soft-deleted (`isDeleted=true`), its Quiz +
 * QuizQuestion rows are NOT cleaned up (cascade runs only on hard delete).
 * The question bank's `_count.quizQuestions` still shows > 0 → admin sees
 * "Đang dùng trong N quiz" even though the lesson is hidden from users.
 *
 * This script walks every QuestionBank row that has quizQuestions and
 * checks whether the chain lesson→chapter→course is healthy.
 *
 * Run:
 *   pnpm --filter @lms/database exec tsx prisma/diagnose-stuck-questions.ts
 */
import './load-env';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

async function main() {
  const inUse = await prisma.questionBank.findMany({
    where: { quizQuestions: { some: {} } },
    include: {
      creator: { select: { email: true, name: true } },
      quizQuestions: {
        include: {
          quiz: {
            include: {
              lesson: {
                include: {
                  chapter: {
                    include: {
                      course: { select: { id: true, title: true, isDeleted: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  console.log(
    `\n${BOLD}=== Chẩn đoán: ${inUse.length} câu hỏi đang có ref từ QuizQuestion ===${RESET}\n`,
  );

  let stuckCount = 0;
  let healthyCount = 0;

  for (const q of inUse) {
    const head = q.question.length > 60 ? q.question.slice(0, 60) + '…' : q.question;
    const refs = q.quizQuestions;

    type StuckLink = {
      quizId: string;
      lessonId: string;
      lessonDeleted: boolean | 'missing';
      courseTitle: string;
      courseDeleted: boolean | 'missing';
    };
    const stuckLinks: StuckLink[] = [];
    const healthyLinks: Array<{ quizId: string; lessonId: string; courseTitle: string }> = [];

    for (const qq of refs) {
      const lesson = qq.quiz?.lesson;
      const course = lesson?.chapter?.course;
      if (!lesson || lesson.isDeleted || !course || course.isDeleted) {
        stuckLinks.push({
          quizId: qq.quizId,
          lessonId: lesson?.id ?? '(null)',
          lessonDeleted: lesson ? lesson.isDeleted : ('missing' as const),
          courseTitle: course?.title ?? '(null)',
          courseDeleted: course ? course.isDeleted : ('missing' as const),
        });
      } else {
        healthyLinks.push({
          quizId: qq.quizId,
          lessonId: lesson.id,
          courseTitle: course.title,
        });
      }
    }

    if (stuckLinks.length > 0) {
      stuckCount++;
      console.log(`${RED}[STUCK]${RESET} Q: ${BOLD}${q.id}${RESET}`);
      console.log(`  ${DIM}Content:${RESET} ${head}`);
      console.log(`  ${DIM}Creator:${RESET} ${q.creator?.name} <${q.creator?.email}>`);
      console.log(`  ${DIM}Links:${RESET} ${refs.length} ref, ${stuckLinks.length} mắc kẹt`);
      for (const s of stuckLinks) {
        console.log(
          `    → ${YELLOW}quiz=${s.quizId}${RESET} lesson=${s.lessonId} (deleted=${s.lessonDeleted}) course="${s.courseTitle}" (deleted=${s.courseDeleted})`,
        );
      }
      for (const h of healthyLinks) {
        console.log(
          `    → ${GREEN}quiz=${h.quizId}${RESET} lesson=${h.lessonId} course="${h.courseTitle}" ${DIM}(healthy)${RESET}`,
        );
      }
    } else {
      healthyCount++;
      console.log(
        `${GREEN}[OK]${RESET}    Q: ${q.id} — ${head} (${refs.length} quiz, all healthy)`,
      );
    }
  }

  console.log(
    `\n${BOLD}Summary:${RESET} ${RED}${stuckCount} stuck${RESET} / ${GREEN}${healthyCount} healthy${RESET} / ${inUse.length} total\n`,
  );

  // Orphan quizzes — linked lesson đã soft-delete
  const orphanQuizzes = await prisma.quiz.findMany({
    where: { lesson: { isDeleted: true } },
    include: {
      lesson: { select: { id: true, title: true, isDeleted: true } },
      _count: { select: { questions: true } },
    },
  });

  if (orphanQuizzes.length > 0) {
    console.log(`${YELLOW}${BOLD}=== Quiz mồ côi (lesson.isDeleted=true) ===${RESET}`);
    for (const q of orphanQuizzes) {
      console.log(
        `  quiz=${q.id} title="${q.title}" lesson="${q.lesson.title}" (lesson_id=${q.lesson.id}) questions=${q._count.questions}`,
      );
    }
    console.log('');
  }

  const totalQuestions = await prisma.questionBank.count();
  console.log(`${DIM}Total QuestionBank rows: ${totalQuestions}${RESET}\n`);

  if (stuckCount > 0 || orphanQuizzes.length > 0) {
    console.log(
      `${CYAN}Để dọn dẹp: chạy \`cleanup-orphan-quizzes.ts\` sẽ xoá các quiz mồ côi (cascade QuizQuestion). Sau đó các câu hỏi sẽ show "Chưa dùng" và admin xoá được.${RESET}\n`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
