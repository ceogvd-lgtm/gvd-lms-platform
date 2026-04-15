import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { WEBGL_EXTRACT_QUEUE } from '../../common/storage/storage.constants';

import { StorageController } from './storage.controller';
import { UploadService } from './upload.service';
import { WebglExtractProcessor } from './webgl-extract.processor';

/**
 * Feature module for the /upload/* and /storage/* HTTP surface.
 *
 * Imports BullModule.registerQueue to make `@InjectQueue(WEBGL_EXTRACT_QUEUE)`
 * resolvable inside UploadService. The root connection was configured in
 * QueueModule (common/queue).
 */
@Module({
  imports: [BullModule.registerQueue({ name: WEBGL_EXTRACT_QUEUE })],
  controllers: [StorageController],
  providers: [UploadService, WebglExtractProcessor],
})
export class StorageModule {}
