/**
 * Nuke ALL questions from QuestionBank.
 *
 * Dangerous — dùng khi user xác nhận muốn xoá sạch ngân hàng câu hỏi.
 * Cascade xoá luôn QuizQuestion rows (theo schema onDelete: Cascade).
 * Không đụng Quiz, Lesson, Course.
 *
 * Run:
 *   DRY_RUN=0 pnpm --filter @lms/database exec tsx prisma/nuke-all-questions.ts
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
const RESET = '\x1b[0m';

async function main() {
  console.log(
    `${BOLD}=== NUKE ALL QuestionBank ===${RESET} ${DRY_RUN ? `${YELLOW}(DRY RUN)${RESET}` : `${RED}(LIVE)${RESET}`}\n`,
  );

  const count = await prisma.questionBank.count();
  const qqCount = await prisma.quizQuestion.count();
  console.log(
    `Sẽ xoá ${RED}${count}${RESET} QuestionBank rows + cascade ${RED}${qqCount}${RESET} QuizQuestion rows.`,
  );

  const sample = await prisma.questionBank.findMany({
    take: 10,
    select: { id: true, question: true },
  });
  console.log(`${DIM}Sample (tối đa 10):${RESET}`);
  for (const q of sample) {
    const head = q.question.length > 60 ? q.question.slice(0, 60) + '…' : q.question;
    console.log(`  - ${q.id}: ${head}`);
  }
  console.log('');

  if (DRY_RUN) {
    console.log(`${YELLOW}${BOLD}DRY RUN — chạy \`DRY_RUN=0 ...\` để thực thi.${RESET}\n`);
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.questionBank.deleteMany({});
  console.log(
    `${GREEN}${BOLD}DONE:${RESET} xoá ${result.count} câu hỏi (+ cascade QuizQuestion).\n`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
