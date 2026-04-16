import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { WEBGL_EXTRACT_QUEUE } from '../../common/storage/storage.constants';

import { PracticeContentsController } from './practice-contents.controller';
import { PracticeContentsService } from './practice-contents.service';
import { WebGLUploadService } from './webgl-upload.service';

@Module({
  // Register the queue as `readonly: false` so we can enqueue jobs. The
  // actual WebGL extract processor still lives in StorageModule (Phase
  // 06) — we just need the Queue handle here.
  imports: [BullModule.registerQueue({ name: WEBGL_EXTRACT_QUEUE })],
  controllers: [PracticeContentsController],
  providers: [PracticeContentsService, WebGLUploadService],
  exports: [PracticeContentsService],
})
export class PracticeContentsModule {}
