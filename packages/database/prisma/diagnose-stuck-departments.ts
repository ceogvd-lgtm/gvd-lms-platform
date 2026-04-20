/**
 * Diagnose stuck departments — xem chỗ nào đang giữ department không
 * cho xoá (subject soft-deleted, course, lesson… dây chuyền FK).
 *
 * Run:
 *   pnpm --filter @lms/database exec tsx prisma/diagnose-stuck-departments.ts
 */
import './load-env';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

async function main() {
  const depts = await prisma.department.findMany({
    include: {
      subjects: {
        include: {
          _count: { select: { courses: true } },
          courses: {
            select: { id: true, title: true, isDeleted: true },
          },
        },
      },
      // QuestionBank cũng ref trực tiếp departmentId (không qua Subject)
      questionBank: {
        select: { id: true, question: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  console.log(`\n${BOLD}=== Chẩn đoán Department ===${RESET}\n`);
  for (const d of depts) {
    const active = d.subjects.filter((s) => !s.isDeleted);
    const soft = d.subjects.filter((s) => s.isDeleted);
    const hasStuck = soft.length > 0 || d.questionBank.length > 0;

    const icon =
      active.length === 0 && !hasStuck ? GREEN + '✓' : hasStuck ? RED + '✗' : YELLOW + '~';
    console.log(`${icon}${RESET} ${BOLD}${d.name}${RESET} (${d.code}) id=${d.id}`);
    console.log(
      `  ${DIM}subjects: ${active.length} active, ${soft.length} soft-deleted · questionBank direct refs: ${d.questionBank.length}${RESET}`,
    );

    for (const s of active) {
      console.log(
        `    ${GREEN}✓ active subject${RESET}: ${s.name} (id=${s.id}) courses=${s._count.courses}`,
      );
    }
    for (const s of soft) {
      const activeCourses = s.courses.filter((c) => !c.isDeleted).length;
      const deletedCourses = s.courses.filter((c) => c.isDeleted).length;
      console.log(
        `    ${YELLOW}~ soft subject${RESET}: ${s.name} (id=${s.id}) courses: ${activeCourses} active + ${deletedCourses} deleted`,
      );
    }
    if (d.questionBank.length > 0) {
      console.log(`    ${RED}✗ QuestionBank refs trực tiếp ngành:${RESET}`);
      for (const q of d.questionBank.slice(0, 5)) {
        const head = q.question.length > 50 ? q.question.slice(0, 50) + '…' : q.question;
        console.log(`      - ${q.id}: ${head}`);
      }
    }
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
