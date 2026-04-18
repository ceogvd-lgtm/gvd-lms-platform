#!/usr/bin/env node
/**
 * Phase 15 — helper script for manual at-risk UI testing.
 *
 *   node scripts/phase15-seed-at-risk.js slow     # 10% after 10 days enrolled
 *   node scripts/phase15-seed-at-risk.js inactive # no activity 10 days
 *   node scripts/phase15-seed-at-risk.js low      # create 3 failing quiz attempts
 *   node scripts/phase15-seed-at-risk.js safety   # practice w/ critical violation
 *   node scripts/phase15-seed-at-risk.js all      # all 4 conditions stacked
 *   node scripts/phase15-seed-at-risk.js restore  # back to healthy (100%)
 *
 * DATABASE_URL must be set (or use the default .env at the repo root).
 */
const {
  PrismaClient,
} = require('../node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/@prisma/client');
const p = new PrismaClient();

const COURSE = 'cmnzujyk50006epnnk7p5lfep'; // Nguyên tắc an toàn xưởng máy
const STUDENT_EMAIL = 'student@lms.local';
const DAY = 24 * 60 * 60 * 1000;

async function resolveFixtures() {
  const student = await p.user.findUnique({ where: { email: STUDENT_EMAIL } });
  if (!student) throw new Error(`${STUDENT_EMAIL} not found — run db:seed first`);
  const enrollment = await p.courseEnrollment.findUnique({
    where: { courseId_studentId: { courseId: COURSE, studentId: student.id } },
  });
  if (!enrollment) throw new Error('student not enrolled in target course');
  const quiz = await p.quiz.findFirst({ where: { lesson: { chapter: { courseId: COURSE } } } });
  const lesson = await p.lesson.findFirst({
    where: { chapter: { courseId: COURSE }, isDeleted: false },
  });
  return { student, enrollment, quiz, lesson };
}

async function cleanSyntheticData(studentId) {
  // Wipe any fake quiz attempts + practice attempts we created for testing
  // so repeated runs don't accumulate.
  await p.quizAttempt.deleteMany({
    where: {
      studentId,
      answers: { equals: [] },
    },
  });
  await p.practiceAttempt.deleteMany({
    where: {
      studentId,
      actions: { equals: [] },
    },
  });
  await p.practiceContent.deleteMany({
    where: { introduction: 'PHASE15_TEST_TMP' },
  });
}

async function run() {
  const mode = (process.argv[2] ?? '').toLowerCase();
  if (!['slow', 'inactive', 'low', 'safety', 'all', 'restore'].includes(mode)) {
    console.error(
      'Usage: node scripts/phase15-seed-at-risk.js <slow|inactive|low|safety|all|restore>',
    );
    process.exit(1);
  }

  const { student, enrollment, quiz, lesson } = await resolveFixtures();
  await cleanSyntheticData(student.id);

  if (mode === 'restore') {
    await p.courseEnrollment.update({
      where: { id: enrollment.id },
      data: {
        progressPercent: 100,
        enrolledAt: new Date('2026-04-17T11:27:20.032Z'),
        lastActiveAt: new Date(),
        completedAt: new Date(),
      },
    });
    console.log('✓ Restored — student is healthy, not at-risk');
    await p.$disconnect();
    return;
  }

  // Prep: uncomplete enrollment (completedAt=null) so at-risk detector
  // considers this student
  await p.courseEnrollment.update({
    where: { id: enrollment.id },
    data: { completedAt: null },
  });

  if (mode === 'slow' || mode === 'all') {
    await p.courseEnrollment.update({
      where: { id: enrollment.id },
      data: {
        progressPercent: 10,
        enrolledAt: new Date(Date.now() - 10 * DAY),
        lastActiveAt:
          mode === 'all' ? new Date(Date.now() - 10 * DAY) : new Date(Date.now() - 1 * DAY),
      },
    });
    console.log('✓ SLOW_START state: progressPercent=10%, enrolledAt=10d ago');
  }

  if (mode === 'inactive') {
    await p.courseEnrollment.update({
      where: { id: enrollment.id },
      data: {
        progressPercent: 60,
        enrolledAt: new Date(Date.now() - 30 * DAY),
        lastActiveAt: new Date(Date.now() - 10 * DAY),
      },
    });
    console.log('✓ INACTIVE state: lastActiveAt=10d ago');
  }

  if (mode === 'low' || mode === 'all') {
    if (mode === 'low') {
      await p.courseEnrollment.update({
        where: { id: enrollment.id },
        data: {
          progressPercent: 70,
          enrolledAt: new Date(Date.now() - 20 * DAY),
          lastActiveAt: new Date(Date.now() - 1 * DAY),
        },
      });
    }
    if (!quiz) throw new Error('No quiz attached to any lesson — seed a quiz first');
    for (let i = 0; i < 3; i++) {
      await p.quizAttempt.create({
        data: {
          quizId: quiz.id,
          studentId: student.id,
          score: 25 + i * 5,
          maxScore: 100,
          answers: [],
          completedAt: new Date(),
        },
      });
    }
    console.log('✓ LOW_SCORE state: 3 quiz attempts with avg ~30%');
  }

  if (mode === 'safety' || mode === 'all') {
    if (mode === 'safety') {
      await p.courseEnrollment.update({
        where: { id: enrollment.id },
        data: {
          progressPercent: 70,
          enrolledAt: new Date(Date.now() - 20 * DAY),
          lastActiveAt: new Date(Date.now() - 1 * DAY),
        },
      });
    }
    // Find or create a PracticeContent for the lesson
    let pc = await p.practiceContent.findUnique({ where: { lessonId: lesson.id } });
    if (!pc) {
      pc = await p.practiceContent.create({
        data: {
          lessonId: lesson.id,
          introduction: 'PHASE15_TEST_TMP',
          objectives: [],
          webglUrl: '',
          scoringConfig: {},
          safetyChecklist: {},
          passScore: 70,
        },
      });
    }
    await p.practiceAttempt.create({
      data: {
        practiceContentId: pc.id,
        studentId: student.id,
        score: 50,
        maxScore: 100,
        actions: [],
        violations: [{ critical: true, type: 'NO_HELMET' }],
        duration: 300,
        completedAt: new Date(),
        hasCriticalViolation: true,
      },
    });
    console.log('✓ SAFETY_VIOLATION state: 1 practice attempt with hasCriticalViolation=true');
  }

  console.log('\nNext: open /instructor/analytics → tab "Tiến độ học viên" → filter "Nguy cơ"');
  console.log('  or hit /api/v1/progress/analytics/at-risk with an admin token');
  await p.$disconnect();
}

run().catch((e) => {
  console.error('FAIL:', e.message);
  p.$disconnect();
  process.exit(1);
});
