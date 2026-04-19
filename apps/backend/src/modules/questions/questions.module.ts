import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';

import { AdminQuestionsController } from './admin-questions.controller';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

/**
 * QuestionsModule — bundles the instructor-facing `/questions` endpoints
 * and the admin-scoped `/admin/questions` endpoints (Phase 18).
 *
 * AuditModule is imported so `QuestionsService.bulkRemove()` can log each
 * admin bulk-delete action per CLAUDE.md's audit requirement.
 */
@Module({
  imports: [AuditModule],
  controllers: [QuestionsController, AdminQuestionsController],
  providers: [QuestionsService],
  exports: [QuestionsService],
})
export class QuestionsModule {}
