/**
 * Cleanup stuck questions + orphan quizzes.
 *
 * "Orphan" = quiz có lesson.isDeleted=true HOẶC course.isDeleted=true.
 * Xoá orphan quizzes → Prisma cascade tự xoá QuizQuestion → các câu hỏi
 * giờ show "Chưa dùng" trong admin bank.
 *
 * Script có 2 mode:
 *   - DRY_RUN=1 → chỉ in ra sẽ xoá gì, không đụng DB (default an toàn)
 *   - DRY_RUN=0 → thực thi xoá thật
 *
 * Run:
 *   pnpm --filter @lms/database exec tsx prisma/cleanup-stuck-questions.ts        # dry-run
 *   DRY_RUN=0 pnpm --filter @lms/database exec tsx prisma/cleanup-stuck-questions.ts  # REAL
 */
import './load-env';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.env.DRY_RUN !== '0';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

async function main() {
  console.log(
    `${BOLD}=== Cleanup stuck questions ===${RESET} ${DRY_RUN ? `${YELLOW}(DRY RUN — không đụng DB)${RESET}` : `${RED}(LIVE — sẽ xoá thật!)${RESET}`}\n`,
  );

  // Step 1 — find orphan quizzes (lesson.isDeleted OR course.isDeleted)
  const orphanQuizzes = await prisma.quiz.findMany({
    where: {
      OR: [
        { lesson: { isDeleted: true } },
        { lesson: { chapter: { course: { isDeleted: true } } } },
      ],
    },
    include: {
      lesson: {
        include: {
          chapter: {
            include: { course: { select: { id: true, title: true, isDeleted: true } } },
          },
        },
      },
      _count: { select: { questions: true, attempts: true } },
    },
  });

  if (orphanQuizzes.length === 0) {
    console.log(`${GREEN}Không có quiz mồ côi. Không cần xoá gì.${RESET}\n`);
    await prisma.$disconnect();
    return;
  }

  console.log(`${YELLOW}Sẽ xoá ${orphanQuizzes.length} quiz mồ côi:${RESET}`);
  for (const q of orphanQuizzes) {
    console.log(
      `  - quiz=${q.id} title="${q.title}" course="${q.lesson.chapter.course.title}" (course.isDeleted=${q.lesson.chapter.course.isDeleted}, lesson.isDeleted=${q.lesson.isDeleted}) questions=${q._count.questions} attempts=${q._count.attempts}`,
    );
  }
  console.log('');

  // Step 2 — how many QuizQuestion rows will cascade
  const quizIds = orphanQuizzes.map((q) => q.id);
  const affectedQQ = await prisma.quizQuestion.count({ where: { quizId: { in: quizIds } } });
  console.log(
    `${DIM}Cascade sẽ xoá ${affectedQQ} QuizQuestion row → các câu hỏi sẽ show "Chưa dùng".${RESET}\n`,
  );

  // Step 3 — which questions will be "freed" (still exist, but no more quiz ref)
  const questionsInOrphans = await prisma.questionBank.findMany({
    where: { quizQuestions: { some: { quizId: { in: quizIds } } } },
    select: {
      id: true,
      question: true,
      _count: {
        select: {
          quizQuestions: {
            where: { quizId: { notIn: quizIds } }, // refs ngoài orphan
          },
        },
      },
    },
  });
  const fullyFreed = questionsInOrphans.filter((q) => q._count.quizQuestions === 0);
  const partiallyFreed = questionsInOrphans.filter((q) => q._count.quizQuestions > 0);

  console.log(`${CYAN}Câu hỏi sẽ được "giải phóng" (hiện về "Chưa dùng"):${RESET}`);
  for (const q of fullyFreed) {
    const head = q.question.length > 60 ? q.question.slice(0, 60) + '…' : q.question;
    console.log(`  ${GREEN}✓${RESET} ${q.id} — ${head}`);
  }
  if (partiallyFreed.length > 0) {
    console.log(`${CYAN}Câu hỏi vẫn còn ref ở quiz khoẻ mạnh (không đổi trạng thái):${RESET}`);
    for (const q of partiallyFreed) {
      const head = q.question.length > 60 ? q.question.slice(0, 60) + '…' : q.question;
      console.log(`  ${YELLOW}~${RESET} ${q.id} — ${head} (còn ${q._count.quizQuestions} ref)`);
    }
  }
  console.log('');

  if (DRY_RUN) {
    console.log(
      `${YELLOW}${BOLD}DRY RUN — không xoá gì. Chạy lại với \`DRY_RUN=0\` để thực thi.${RESET}\n`,
    );
    await prisma.$disconnect();
    return;
  }

  // Step 4 — execute within a transaction (cascade QuizQuestion automatic)
  const tx = await prisma.$transaction(async (client) => {
    // Xoá QuizAttempt liên quan trước (nếu có) để không bị FK
    const attemptsDeleted = await client.quizAttempt.deleteMany({
      where: { quizId: { in: quizIds } },
    });
    const quizDeleted = await client.quiz.deleteMany({ where: { id: { in: quizIds } } });
    return { attempts: attemptsDeleted.count, quizzes: quizDeleted.count };
  });

  console.log(
    `${GREEN}${BOLD}DONE:${RESET} xoá ${tx.quizzes} quiz + ${tx.attempts} attempt + cascade ${affectedQQ} QuizQuestion.\n`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
