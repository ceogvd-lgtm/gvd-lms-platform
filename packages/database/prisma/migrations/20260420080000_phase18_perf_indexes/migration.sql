-- Phase 18 — Performance: composite indexes for hot-path queries.
-- Each composite complements a single-column index already in place so
-- we don't lose existing access patterns. See schema.prisma comments.

-- users: auto-enroll sweeps students by (departmentId, role=STUDENT)
CREATE INDEX "users_departmentId_role_idx" ON "users"("departmentId", "role");

-- quiz_attempts: "my attempts on this quiz" list — student-first lookup
CREATE INDEX "quiz_attempts_studentId_quizId_idx" ON "quiz_attempts"("studentId", "quizId");

-- course_enrollments: "my courses" list (student-first) + per-(student,course) lookup
CREATE INDEX "course_enrollments_studentId_courseId_idx" ON "course_enrollments"("studentId", "courseId");

-- lesson_progress: calculateCourseProgress sweeps LessonProgress by (studentId, lessonId IN (...))
CREATE INDEX "lesson_progress_studentId_lessonId_idx" ON "lesson_progress"("studentId", "lessonId");

-- ai_chat_messages: transcript pagination by (student, createdAt DESC)
CREATE INDEX "ai_chat_messages_studentId_createdAt_idx" ON "ai_chat_messages"("studentId", "createdAt");
