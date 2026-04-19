import { join } from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './common/audit/audit.module';
import { MailModule } from './common/mail/mail.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { QueueModule } from './common/queue/queue.module';
import { RbacModule } from './common/rbac/rbac.module';
import { RolesGuard } from './common/rbac/roles.guard';
import { RedisModule } from './common/redis/redis.module';
import { StorageCoreModule } from './common/storage/storage.module';
import { AdminModule } from './modules/admin/admin.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsAdminModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { ChaptersModule } from './modules/chapters/chapters.module';
import { CoursesModule } from './modules/courses/courses.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { DiscussionsModule } from './modules/discussions/discussions.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { InstructorModule } from './modules/instructor/instructor.module';
import { LessonNotesModule } from './modules/lesson-notes/lesson-notes.module';
import { LessonsModule } from './modules/lessons/lessons.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PracticeModule } from './modules/practice/practice.module';
import { PracticeContentsModule } from './modules/practice-contents/practice-contents.module';
import { ProgressModule } from './modules/progress/progress.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { QuizAttemptsModule } from './modules/quiz-attempts/quiz-attempts.module';
import { QuizzesModule } from './modules/quizzes/quizzes.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ScormModule } from './modules/scorm/scorm.module';
import { StorageModule } from './modules/storage/storage.module';
import { StorageCleanupModule } from './modules/storage-cleanup/storage-cleanup.module';
import { StudentsModule } from './modules/students/students.module';
import { SubjectsModule } from './modules/subjects/subjects.module';
import { SystemSettingsModule } from './modules/system-settings/system-settings.module';
import { TheoryContentsModule } from './modules/theory-contents/theory-contents.module';
import { UsersModule } from './modules/users/users.module';
import { VideoProgressModule } from './modules/video-progress/video-progress.module';
import { XapiModule } from './modules/xapi/xapi.module';
// Phase 14

// The shared .env file lives at the monorepo root. At runtime the compiled
// module sits in apps/backend/dist/, so we walk up three levels to reach it
// (dist → backend → apps → root). Local apps/backend/.env is checked first
// so a developer can override per-app.
const monorepoRoot = join(__dirname, '..', '..', '..');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        '.env.local',
        '.env',
        join(monorepoRoot, '.env.local'),
        join(monorepoRoot, '.env'),
      ],
    }),
    // Global default — individual controllers (e.g. AuthController) override
    // with stricter limits via @Throttle().
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    RedisModule,
    QueueModule,
    StorageCoreModule,
    MailModule,
    RbacModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    AdminModule,
    DepartmentsModule,
    SubjectsModule,
    CoursesModule,
    ChaptersModule,
    LessonsModule,
    EnrollmentsModule,
    StorageModule,
    // Phase 09
    CertificatesModule,
    ReportsModule,
    SystemSettingsModule,
    // Phase 10
    InstructorModule,
    TheoryContentsModule,
    PracticeContentsModule,
    // Phase 11
    QuestionsModule,
    QuizzesModule,
    // Phase 12
    ScormModule,
    XapiModule,
    VideoProgressModule,
    // Phase 13
    PracticeModule,
    // Phase 14 — Student Dashboard & Learning Experience
    StudentsModule,
    QuizAttemptsModule,
    LessonNotesModule,
    DiscussionsModule,
    // Phase 15 — Progress Tracking & Analytics
    ProgressModule,
    AnalyticsAdminModule,
    // Phase 17 — AI Learning Assistant (Gemini + ChromaDB RAG)
    AiModule,
    // Phase 18 — MinIO orphan file cleanup (weekly cron + manual trigger)
    StorageCleanupModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Order of APP_GUARD providers matters — they run in registration order.
    //   1. Throttler (rate limit first, cheap reject)
    //   2. JwtAuthGuard (authn — populates req.user, honours @Public)
    //   3. RolesGuard (authz — reads req.user.role vs @Roles metadata)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
