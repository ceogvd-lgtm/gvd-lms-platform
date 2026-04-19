-- Dọn dẹp cascade cho các ngành còn subject/course đã soft-delete nhưng
-- chưa xoá cứng khỏi DB. Chạy trong transaction để rollback nếu lỗi giữa
-- chừng. Usage:
--   DEPT_ID='xxx' psql -v dept_id="'$DEPT_ID'" -f cleanup-dept-soft-deleted.sql
-- Hoặc inline (thay :dept_id bằng id thực):
--   docker exec lms-postgres-dev psql -U lms -d lms -v dept_id="'xxx'" -f /path/to/this.sql
BEGIN;

-- Lấy tập ID bottom-up
CREATE TEMP TABLE _subj AS
  SELECT id FROM subjects WHERE "departmentId" = :dept_id;
CREATE TEMP TABLE _course AS
  SELECT id FROM courses WHERE "subjectId" IN (SELECT id FROM _subj);
CREATE TEMP TABLE _chapter AS
  SELECT id FROM chapters WHERE "courseId" IN (SELECT id FROM _course);
CREATE TEMP TABLE _lesson AS
  SELECT id FROM lessons WHERE "chapterId" IN (SELECT id FROM _chapter);
CREATE TEMP TABLE _quiz AS
  SELECT id FROM quizzes WHERE "lessonId" IN (SELECT id FROM _lesson);
CREATE TEMP TABLE _tc AS
  SELECT id FROM theory_contents WHERE "lessonId" IN (SELECT id FROM _lesson);
CREATE TEMP TABLE _pc AS
  SELECT id FROM practice_contents WHERE "lessonId" IN (SELECT id FROM _lesson);
CREATE TEMP TABLE _disc AS
  SELECT id FROM discussions WHERE "lessonId" IN (SELECT id FROM _lesson);
CREATE TEMP TABLE _qb AS
  SELECT id FROM question_bank WHERE "courseId" IN (SELECT id FROM _course);

-- Xoá theo thứ tự FK (leaf trước)
DELETE FROM discussion_replies   WHERE "discussionId" IN (SELECT id FROM _disc);
DELETE FROM video_progress       WHERE "theoryContentId" IN (SELECT id FROM _tc);
DELETE FROM quiz_attempts        WHERE "quizId" IN (SELECT id FROM _quiz);
DELETE FROM practice_attempts    WHERE "practiceContentId" IN (SELECT id FROM _pc);
DELETE FROM quiz_questions       WHERE "quizId" IN (SELECT id FROM _quiz)
                                    OR "questionId" IN (SELECT id FROM _qb);

DELETE FROM theory_contents      WHERE "lessonId" IN (SELECT id FROM _lesson);
DELETE FROM practice_contents    WHERE "lessonId" IN (SELECT id FROM _lesson);
DELETE FROM quizzes              WHERE "lessonId" IN (SELECT id FROM _lesson);
DELETE FROM discussions          WHERE "lessonId" IN (SELECT id FROM _lesson);
DELETE FROM lesson_notes         WHERE "lessonId" IN (SELECT id FROM _lesson);
DELETE FROM lesson_progress      WHERE "lessonId" IN (SELECT id FROM _lesson);
DELETE FROM lesson_attachments   WHERE "lessonId" IN (SELECT id FROM _lesson);
DELETE FROM ai_recommendations   WHERE "lessonId" IN (SELECT id FROM _lesson);

DELETE FROM lessons              WHERE id IN (SELECT id FROM _lesson);
DELETE FROM chapters             WHERE id IN (SELECT id FROM _chapter);

DELETE FROM course_enrollments   WHERE "courseId" IN (SELECT id FROM _course);
DELETE FROM certificates         WHERE "courseId" IN (SELECT id FROM _course);
DELETE FROM certificate_criteria WHERE "courseId" IN (SELECT id FROM _course);
DELETE FROM question_bank        WHERE "courseId" IN (SELECT id FROM _course);

DELETE FROM courses              WHERE id IN (SELECT id FROM _course);
DELETE FROM subjects             WHERE id IN (SELECT id FROM _subj);

-- KHÔNG xoá department — để user tự bấm Xoá qua UI cho có AuditLog
SELECT
  (SELECT COUNT(*) FROM _subj) AS subjects_deleted,
  (SELECT COUNT(*) FROM _course) AS courses_deleted,
  (SELECT COUNT(*) FROM _chapter) AS chapters_deleted,
  (SELECT COUNT(*) FROM _lesson) AS lessons_deleted;

COMMIT;
