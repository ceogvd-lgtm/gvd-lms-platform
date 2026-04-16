# CONTEXT.md — Dự Án LMS

Cập nhật ngày: 16/04/2026

## ĐANG LÀM

Phase 13 — (TBD)

## ĐÃ HOÀN THÀNH

### ✅ Phase 01 — Project Setup

- Backend: localhost:4000/api/v1 | Frontend: localhost:3000
- Lệnh chạy: pnpm dev
- Docker: docker compose -f docker/docker-compose.dev.yml -f docker/docker-compose.override.yml up -d
- Xong ngày: 15/04/2026

### ✅ Phase 02 — Database Schema

- Schema: packages/database/prisma/schema.prisma (23 tables, 8 enums)
- Database port: 5433 | DATABASE_URL: postgresql://lms:lms@localhost:5433/lms
- Xong ngày: 15/04/2026

### ✅ Phase 03 — Auth & Security

- 10 endpoints /auth/\* | JWT 15min/7d | 2FA OTP 6 số
- Xong ngày: 15/04/2026

### ✅ Phase 04 — RBAC & 4 Luật

- 20 routes | 23/23 unit test PASS
- INSTRUCTOR không xoá lesson | AuditService ghi log
- /admin/users và /admin/audit-log đã có từ Phase 04 (bảng thủ công)
- Xong ngày: 15/04/2026

### ✅ Pre-Phase 05

- Seed: pnpm --filter @lms/database db:seed (admin@lms.local / Admin@123456)
- Dev watcher: ts-node-dev | Commit: 5e3c133
- Xong ngày: 15/04/2026

### ✅ Phase 05 — Design System

- 15 components @lms/ui + ThemeProvider + DarkModeToggle
- DataTable component có sẵn trong @lms/ui (TanStack Table v8)
- Commit: b584de7 | Xong ngày: 15/04/2026

### ✅ Phase 06 — File Storage + GVD Rebrand

- 6 endpoints upload + MinIO + WebGL BullMQ
- Buckets: avatars/ thumbnails/ attachments/ content/scorm/ content/video/ content/ppt/ content/webgl/ certificates/
- Commit: 5b9ed03 | Xong ngày: 15/04/2026

### ✅ Phase 07 — Email & Notification

- BullMQ emailQueue + 8 React Email templates
- Socket.io /notifications + 5 endpoints
- Commit: 93af1fa | Xong ngày: 15/04/2026

### ✅ Phase 08 — Course Structure + Token Fix

- 28 endpoints: departments/subjects/courses/chapters/lessons/enrollments
- Status FSM: DRAFT→PENDING_REVIEW→PUBLISHED→ARCHIVED
- Frontend: /admin/curriculum tree view 5 levels + slide-in panel
- Silent token refresh: 401 → auto refresh → retry (race condition safe)
- Commit: fbc72e7 | Xong ngày: 15/04/2026

### ✅ Phase 09 — Admin Dashboard

- Database: thêm model SystemSetting (key-value), migration 20260415120000
- Backend modules mới (~30 endpoints):
  - admin/dashboard — 6 endpoints (kpi, registrations, top-courses, role-distribution, activity-feed, alerts)
  - admin/content — 7 endpoints moderation (list, approve, reject, delete, impact, flag)
  - certificates — 5 endpoints (list, detail, revoke, stats, pass-rate)
  - reports — 4 endpoints (progress JSON + export PDF/XLSX)
  - system-settings — 6 endpoints (getAll, update, testSmtp, backup stub)
  - admin.service extend: bulk-block, user detail, export CSV/XLSX, filter status
- Backend exporters: pdfmake (Roboto Unicode VN) + exceljs
- 6 unit test mới — tất cả PASS (9 suites, 95 tests)
- 5 trang admin mới: /admin/dashboard /content /certificates /reports /settings
- 2 trang migrate: /admin/users /admin/audit-log (DataTable server-side)
- 4 Luật enforcement: backend AdminRulesService.check() + frontend UserActionButton
- Commit: 1ac1292 | Xong ngày: 16/04/2026

### ✅ Phase 10 — Instructor Dashboard

- Database: thêm field body Json? vào TheoryContent (TipTap JSON ProseMirror), migration 20260416120000
- Backend modules mới (~14 endpoints):
  - instructor/dashboard — 4 endpoints (stats, weekly-progress, activity, deadlines)
  - instructor/analytics — 4 endpoints (list students, detail, export CSV, send-reminder)
  - theory-contents — 3 endpoints (GET, PUT upsert, PATCH body auto-save)
  - practice-contents — 2 endpoints (GET, PUT upsert)
- 4 unit test mới — tất cả PASS (13 suites, 128 tests)
- TipTap: 7 packages cài (@tiptap/react, pm, starter-kit, placeholder, link, image, underline)
- 5 trang instructor mới:
  - /instructor/dashboard /courses /courses/new /lessons/:id/edit /analytics
- Wizard 4 bước tạo khoá học + dnd-kit
- INSTRUCTOR pages KHÔNG có nút Xoá bất kỳ đâu
- Commit: 08632e9 | Xong ngày: 16/04/2026

### ✅ Phase 11 — Question Bank System

- Shared types: packages/types/src/assessment.types.ts — QuestionType, Difficulty, QuestionBank, Quiz, QuizQuestion, QuizAttempt
- Backend questions module — 7 endpoints:
  - GET /questions — filter + paginated, INSTRUCTOR scope createdBy
  - GET /questions/tags — autocomplete
  - GET /questions/export — rows JSON
  - POST /questions — create + validate options theo type
  - POST /questions/import?dryRun= — bulk import + preview
  - PATCH /questions/:id — owner / ADMIN+
  - DELETE /questions/:id — owner / ADMIN+
- Validate options per type: SINGLE_CHOICE(1 đúng) / MULTI_CHOICE(≥1) / TRUE_FALSE(true/false) / FILL_BLANK(case-insensitive)
- Backend quizzes module — 8 endpoints:
  - GET/POST /lessons/:lessonId/quiz
  - PATCH/DELETE /quizzes/:id
  - POST /quizzes/:id/questions (add 1)
  - POST /quizzes/:id/questions/bulk
  - POST /quizzes/:id/questions/random-pick (Fisher-Yates)
  - DELETE /quizzes/:id/questions/:questionId
  - PATCH /quizzes/:id/questions/reorder
- 26 unit tests mới: questions.service.spec(15) + quizzes.service.spec(11)
- Tổng: 15 suites, 154/154 tests PASS
- Frontend xlsx@^0.18.5 (SheetJS) đã cài
- Page /instructor/questions: toolbar + filter + QuestionEditorModal + ExcelImportModal + template mẫu
- Page /instructor/lessons/:id/quiz: Quiz Builder 3 cột + dnd-kit + QuizPreviewModal
- 24 routes build OK
- Commits: 915a59f → 59a653c → 5da2a2f → be4ff17
- Main branch merge: c0d9156
- Xong ngày: 16/04/2026

### ✅ Phase 12 — Theory Lesson Engine

- **Branch**: `claude/phase-12` (3 commits: 2067dc5 → 41d3ff2 → ba297f2)
- **Backend new modules (3)**:
  - `scorm` — 4 endpoints: POST /scorm/upload/:lessonId (unzip + parse imsmanifest.xml via xml2js → detect 1.2/2004), GET /scorm/:lessonId/manifest, POST /scorm/:lessonId/track (CMI → LessonProgress), GET /scorm/:lessonId/progress. `unzipper` dùng lại từ Phase 06.
  - `xapi` — 2 endpoints: POST /xapi/statements (verb IRI → ProgressStatus), GET /xapi/statements?lessonId=
  - `video-progress` — 2 endpoints: POST /video/:lessonId/progress (monotonic watchedSeconds + threshold check + cascade LessonProgress), GET /video/:lessonId/progress
- **Backend extended modules**:
  - `theory-contents` (+3 endpoints): POST /upload (SCORM/XAPI/POWERPOINT/VIDEO → UploadService), POST /convert-ppt (LibreOffice happy path + fallback), GET /slides
  - `lessons` (+5 endpoints): POST /lessons/:id/complete (content+quiz gate), GET /lessons/:id/progress (bundle), GET+POST+DELETE /lessons/:id/attachments
- **PPT Converter service**: LibreOffice (`libreoffice --headless --convert-to pdf`) → pdftoppm → PNG per slide → upload về content/ppt/{lessonId}/slide-N.png + slides.json manifest. Auto-detect binaries, fallback graceful nếu không có (FE show message).
- **Completion logic**:
  - VIDEO: watchedSeconds/duration >= completionThreshold → VideoProgress.isCompleted = true + cascade LessonProgress = COMPLETED
  - SCORM/xAPI: tracker service upsert LessonProgress với status theo verb/lessonStatus
  - PPT: FE báo slide cuối → POST /lessons/:id/complete
  - Lesson COMPLETED = content done **AND** (không có quiz OR best QuizAttempt.score >= passScore)
- **34 unit tests mới**: scorm.service.spec(11) + xapi.service.spec(10) + video-progress.service.spec(8) + lessons-completion.service.spec(5). Tổng **19 suites, 188/188 tests PASS**.
- **Frontend deps**: scorm-again@^3 (dùng dưới dạng file tĩnh copy vào public/scorm-again.min.js), react-pdf@^10, xml2js (backend)
- **Instructor page mở rộng `/instructor/lessons/:id/edit`**: thêm 2 tab mới
  - "Nội dung chính" (ContentUploader): radio 4 loại + drag-drop + completionThreshold slider 50-100%
  - "Tài liệu đính kèm" (AttachmentsManager): multi-file PDF + list
- **Student page mới `/student/lessons/:id`** (25 routes build):
  - Layout: header sticky + sidebar outline 240px + 3 tabs + bottom nav sticky
  - VideoPlayer: custom HTML5 + resume toast + keyboard shortcuts (Space/←→/↑↓/F/M) + heartbeat 10s
  - ScormPlayer: iframe + scorm-again bridge qua next/script, sandbox an toàn
  - PptPlayer: 1 slide + thumbnail strip + ← → nav, fallback khi converter chưa có
  - PdfViewer: react-pdf dynamic import + page nav + zoom 50-150%
  - NotesTab: TipTap + localStorage `note-{lessonId}-{studentId}` + auto-save 30s
  - StudentQuiz: idle/taking/result state machine + countdown + pass % animation
  - Confetti CSS-only 30 spans khi lesson COMPLETED lần đầu
- **Frontend libs mới**:
  - `src/lib/theory-engine.ts`: scormApi, xapiApi, videoApi, theoryEngineApi, lessonEngineApi, attachmentsApi
- **Limitation Phase 12**: grade quiz vẫn ở client (local-grade fallback) vì server `/quiz-attempts` endpoint sẽ làm ở Phase 13. Bình thường quiz pass vì redacted answers → cần implement server-side grading trước khi production.
- Xong ngày: 16/04/2026

## LƯU Ý QUAN TRỌNG

- Docker port 5433 (không phải 5432)
- docker-compose.override.yml KHÔNG commit | .env KHÔNG commit
- Sau khi sửa packages/types hoặc packages/database phải build trước
- Backend hot reload: ts-node-dev (KHÔNG dùng tsx)
- Seed SUPER_ADMIN: pnpm --filter @lms/database db:seed (seed cả SystemSetting defaults)
- API prefix luôn là /api/v1/ (không phải /api/)
- Silent token refresh đã implement trong lib/api.ts
- DataTable từ @lms/ui dùng TanStack Table v8, hỗ trợ client-side và server-side mode
- pdfmake render với font Roboto (Unicode VN hoạt động tốt)
- INSTRUCTOR: Tạo + Sửa + Lưu trữ — TUYỆT ĐỐI KHÔNG có nút Xoá ở UI lẫn backend
- Hydration: layout admin/instructor dùng useHasHydrated() trước khi check role
- TipTap body lưu JSON ProseMirror trong TheoryContent.body — auto-save 30s
- Question Bank: INSTRUCTOR chỉ thấy câu hỏi mình tạo; ADMIN+ thấy tất cả
- Excel import/export dùng SheetJS ở frontend — server chỉ nhận JSON đã parse
- FILL_BLANK chấm case-insensitive + trim
- KHÔNG dùng curl từ Git Bash Windows để POST tiếng Việt — dùng Node script hoặc UI
- Main branch đã merge đủ Phase 01-11 (commit: c0d9156). Phase 12 ở branch `claude/phase-12` chờ merge.
- Phase 12: scorm-again dùng như file tĩnh tại apps/frontend/public/scorm-again.min.js (copy từ node_modules)
- Phase 12: LibreOffice fallback nếu binary chưa cài trên host — BE vẫn trả slides.json với converter='fallback'
- Phase 12: Video heartbeat 10s, monotonic watchedSeconds (rewind không unset completion)
- Phase 12: POST /lessons/:id/complete validate content done + quiz passed (nếu có)
- Phase 12: /quiz-attempts grade endpoint để Phase 13 — tạm thời student side grade local
- Phase 13: cần add /quiz-attempts server endpoint + course-context endpoint cho outline sidebar + attachment viewer

## LỆNH ĐÃ VERIFY (Phase 12)

```bash
# Database
pnpm --filter @lms/database db:migrate   # apply migrations
pnpm --filter @lms/database db:seed      # seed admin + SystemSetting defaults

# Backend
pnpm --filter @lms/backend typecheck     # PASS
pnpm --filter @lms/backend test          # 19 suites, 188 tests PASS (154 old + 34 new)

# Frontend
pnpm --filter @lms/frontend typecheck    # PASS
pnpm --filter @lms/frontend build        # 25 routes built (+1 /student/lessons/[id])
```
