import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';

import { GEMINI_QUEUE } from '../ai/ai.constants';
import { AiModule } from '../ai/ai.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { ProgressModule } from '../progress/progress.module';
import { StudentsModule } from '../students/students.module';

import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  imports: [
    StudentsModule,
    forwardRef(() => ProgressModule),
    CertificatesModule,
    // Phase 18 — auto-index PDF attachments vào ChromaDB khi upload.
    // AiModule export QuotaService để check quota trước khi enqueue;
    // BullModule.registerQueue idempotent — cùng queue name với AiModule,
    // chỉ tạo 1 instance thật sự ở registry.
    AiModule,
    BullModule.registerQueue({ name: GEMINI_QUEUE }),
  ],
  controllers: [LessonsController],
  providers: [LessonsService],
  exports: [LessonsService],
})
export class LessonsModule {}
