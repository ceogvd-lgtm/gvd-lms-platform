# CONTEXT.md — Dự Án LMS

Cập nhật ngày: 18/04/2026

## ĐANG LÀM

Phase 17 — AI Learning Assistant (Gemini + ChromaDB) ĐÃ XONG.
Chuẩn bị Phase 18 (TBD).

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
- Silent token refresh: 401 → auto refresh → retry
- Xong ngày: 15/04/2026

### ✅ Phase 04 — RBAC & 4 Luật

- 20 routes | 23/23 unit test PASS
- INSTRUCTOR không xoá lesson | AuditService ghi log
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
- Silent token refresh: 401 → auto refresh → retry
- Commit: fbc72e7 | Xong ngày: 15/04/2026

### ✅ Phase 09 — Admin Dashboard

- Database: thêm model SystemSetting, migration 20260415120000
- ~30 endpoints mới + 6 unit tests (9 suites, 95 tests PASS)
- 5 trang admin mới + 2 migrate
- Commit: 1ac1292 | Xong ngày: 16/04/2026

### ✅ Phase 10 — Instructor Dashboard

- Database: thêm field body Json? vào TheoryContent, migration 20260416120000
- ~14 endpoints mới + 4 unit tests (13 suites, 128 tests PASS)
- 5 trang instructor mới + TipTap + Wizard 4 bước
- practice-contents module: GET + PUT upsert (ĐÃ CÓ)
- Commit: 08632e9 | Xong ngày: 16/04/2026

### ✅ Phase 11 — Question Bank System

- questions module (7 endpoints) + quizzes module (8 endpoints)
- 26 unit tests mới: 15 suites, 154/154 tests PASS
- Pages: /instructor/questions | /instructor/lessons/:id/quiz
- Commits: 915a59f → be4ff17 | Xong ngày: 16/04/2026

### ✅ Phase 12 — Theory Lesson Engine

- SCORM/xAPI/Video/PPT + VideoProgress + LessonAttachment
- 18 endpoints mới: scorm/ xapi/ video/ lessons/:id/\*
- Modules mới: scorm/ xapi/ video-progress/
- Pages: /student/lessons/[id] (mới) | /instructor/lessons/:id/edit (mở rộng)
- 34 unit tests mới: 19 suites, 188/188 tests PASS | 25 routes build OK
- Bug fix: PPT convert 500 → 404 khi sourceKey không tồn tại
- Commits: 2067dc5 → 81da453 | Merge: 14d4380
- Xong ngày: 16/04/2026

### ✅ Phase 13 — Virtual Lab Engine (Unity WebGL)

- PracticeContent: upload WebGL .zip + extract async (BullMQ) + verify Builds.loader.js
- Practice lifecycle: start → action → complete + scoring engine
- Scoring: isInOrder ×1.10 | critical violation −20% | mandatory skip = 0 | clamp ≥ 0
- LMS Bridge: SendMessage('LMSBridge', 'ReceiveConfig') + postMessage listener
- 7 endpoints mới: /practice/\* + /practice-contents/:id/upload-webgl
- Instructor: tab Thực hành ảo trong /instructor/lessons/:id/edit
- Student: tab Thực hành ảo trong /student/lessons/[id] (pre-lab/run/post-lab)
- Analytics: tab Thực hành ảo trong /instructor/analytics
- 27 unit tests mới: 22 suites, 221/221 tests PASS | 26 routes build OK
- Session fixes (17/04):
  - Google OAuth callback + /auth/me endpoint
  - Logout flow sidebar + header + dashboard layout auth guard
  - Dark mode default + student menu "Sắp có"
  - WebGL extract Windows race condition
  - SCORM same-origin proxy + public bucket
  - Unity .gz Content-Encoding headers
  - GET /lessons/:id/context (sidebar outline + prev/next)
  - Split /practice/:id/my-attempts vs /attempts
  - Nút "Gửi duyệt" trên Draft course card
  - Nút "Upload nội dung" shortcut wizard step 4
  - Xoá placeholder Step 3 "Cài đặt" wizard
  - /student/dashboard stub (enrollments list)
  - seed-demo.ts script idempotent
- Commits: 41b1895 → 3f06d3b | Xong ngày: 17/04/2026

### ✅ Phase 14 — Student Dashboard & Learning Experience

- Models mới: LessonNote, Discussion, DiscussionReply, StudentXP
- Endpoints mới: quiz-attempts grading, lesson-notes, discussions, students/\* dashboard + streak + my-learning + progress + xp
- Pages: /student/dashboard (full), /student/my-learning, /student/progress
- Xong ngày: 17/04/2026

### ✅ Phase 15 — Progress Tracking & Analytics

- ProgressService: rollup CourseEnrollment.progressPercent + lastActiveAt
- AtRiskService: 4 rules (SLOW_START/INACTIVE/LOW_SCORE/SAFETY_VIOLATION) + BullMQ CRON_QUEUE daily
- Endpoints: /progress/_ + /analytics/_
- Xong ngày: 18/04/2026

### ✅ Phase 16 — Certificate System

- CertificateCriteria per-course + auto-issue cascade
- CertificatesService.checkAndIssueCertificate + issueManual + getDownloadUrl + verifyByCode
- PDF generation (pdfmake) + MinIO CERTIFICATES prefix (public)
- Public verify page /verify/[code]
- Xong ngày: 18/04/2026

### ✅ Phase 17 — AI Learning Assistant

- Models mới: AiRecommendation, AiChatMessage, AiQuotaLog, AiSuggestedQuestions
- Migration: 20260418120000_phase17_ai_assistant
- Module AI: GeminiService + RagService + ChatService + RecommendationsService + WeeklyReportService + QuestionSuggestService + QuotaService + GeminiProcessor + AiScheduler
- Queue mới: GEMINI_QUEUE (max 10 jobs/phút) — KHÔNG dùng cho chat (SSE direct)
- SDK: @google/generative-ai (KHÔNG dùng langchain)
- Models đã verify: gemini-2.5-flash (chat), gemini-flash-lite-latest (batch), text-embedding-004 (RAG)
- Stack mới: chromadb container trong docker-compose.dev.yml (:8000) + pdf-parse (PDF → text)
- Endpoints mới (7):
  - POST /api/v1/ai/chat SSE stream
  - GET /api/v1/ai/suggestions/:lessonId
  - GET /api/v1/ai/recommendations
  - PATCH /api/v1/ai/recommendations/:id/read
  - POST /api/v1/ai/index-lesson INSTRUCTOR own/ADMIN+
  - PATCH /api/v1/ai/chat/:messageId/rating
  - GET /api/v1/ai/health ADMIN+
- Cron tự đăng ký trong AiScheduler.onModuleInit:
  - recommendations-daily @ 01:00 mỗi ngày
  - weekly-report @ 08:00 thứ Hai
- Frontend:
  - components/ai/chat-widget.tsx — floating 380×520 (fullscreen mobile), SSE stream, typing indicator, thumbs rating, markdown + code syntax highlight
  - components/ai/recommendation-cards.tsx — Row 7 trong /student/dashboard (ẩn khi rỗng)
  - components/ai/suggested-questions.tsx — collapsible chips (embed trong chat-widget empty state)
  - components/ai/ai-health-panel.tsx — tab "AI & Quota" trong /admin/settings
- Deps mới:
  - backend: @google/generative-ai, chromadb, pdf-parse, @types/pdf-parse
  - frontend: react-markdown, react-syntax-highlighter, @types/react-syntax-highlighter
- 8 unit tests mới: 34 suites, 319/319 PASS | 31 routes build OK
- Gotcha đã xử lý:
  - gemini-2.5-flash cần maxOutputTokens ≥ 1000 (thinking tokens ăn budget)
  - SSE headers: Content-Type text/event-stream + X-Accel-Buffering: no
  - RAG retrieve graceful khi Chroma offline → trả '' thay throw
  - Rate recommendations/weekly fallback khi Gemini error → không throw
  - QuestionSuggest cache 24h server-side (AiSuggestedQuestions)
  - Score raw (Phase 15 contract) — recommendations đọc lt: 50 raw, không percent
- Xong ngày: 18/04/2026

## LƯU Ý QUAN TRỌNG

- Docker port 5433 (không phải 5432)
- docker-compose.override.yml KHÔNG commit | .env KHÔNG commit
- Sau khi sửa packages/types hoặc packages/database phải build trước
- Backend hot reload: ts-node-dev (KHÔNG dùng tsx)
- Seed SUPER_ADMIN: pnpm --filter @lms/database db:seed
- Seed demo data: pnpm --filter @lms/database exec tsx prisma/seed-demo.ts
- API prefix luôn là /api/v1/ (KHÔNG phải /api/)
- INSTRUCTOR: Tạo + Sửa + Lưu trữ — TUYỆT ĐỐI KHÔNG có nút Xoá
- Hydration: layout dùng useHasHydrated() trước khi check role
- TipTap body lưu JSON ProseMirror — auto-save 30s
- KHÔNG dùng curl từ Git Bash Windows để POST tiếng Việt
- Main branch đã merge đủ Phase 01-13 + session fixes (commit: 3f06d3b)
- Unity WebGL tên project "Builds":
  Builds.loader.js / Builds.data / Builds.framework.js / Builds.wasm
- LMS Bridge: SendMessage('LMSBridge', 'ReceiveConfig', JSON.stringify(config))
- GET /lessons/:id/context ĐÃ CÓ → sidebar outline + prev/next hoạt động
- /student/dashboard ĐÃ CÓ stub cơ bản → Phase 14 mở rộng
- Google OAuth ĐÃ CÓ: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET trong .env
- ceo.gvd@gmail.com đã là SUPER_ADMIN trong DB
- 26 routes (thêm /student/dashboard so với Phase 13)

## PHASE 14 — CẦN LÀM

- Model mới cần migration:
  - LessonNote (lessonId, studentId, content Json, updatedAt)
  - Discussion (lessonId, authorId, content, isDeleted)
  - DiscussionReply (discussionId, authorId, content, isDeleted)
  - StudentXP (studentId unique, totalXP, level)
- Endpoints mới:
  - POST /quiz-attempts (quiz grading backend thật, thay auto-pass)
  - GET /quiz-attempts/:quizId (lịch sử làm bài)
  - GET/PUT /lessons/:id/notes (ghi chú lên DB, thay localStorage)
  - GET/POST /lessons/:id/discussions (hỏi đáp)
  - POST /discussions/:id/replies
  - GET /students/dashboard (data tổng hợp)
  - GET /students/streak (streak + heatmap)
  - GET /students/my-learning (cây học tập)
  - GET /students/progress (charts data)
  - GET /students/xp (XP + level)
  - GET /courses/:id/lessons (fix analytics lesson picker Phase 13)
- Pages mới/mở rộng:
  - /student/dashboard (mở rộng stub đã có)
  - /student/my-learning (mới)
  - /student/progress (mới)
  - Tab Hỏi đáp trong /student/lessons/[id]
  - Nâng cấp Tab Ghi chú lên DB sync
  - Fix Quiz grading thật (thay auto-pass)
- PWA stub: manifest.json + meta tags
- XP: +10 complete lesson, +20 pass quiz lần đầu, +100 complete course

## LỆNH ĐÃ VERIFY

pnpm --filter @lms/backend test # 23 suites, 221 tests PASS
pnpm --filter @lms/frontend build # 26 routes built
