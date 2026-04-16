import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module';

import { PptConverterService } from './ppt-converter.service';
import { TheoryContentsController } from './theory-contents.controller';
import { TheoryContentsService } from './theory-contents.service';

/**
 * Theory content pipeline.
 *
 * Imports {@link StorageModule} because Phase 12 delegates the raw
 * MinIO upload + MIME validation to the shared {@link UploadService}.
 * Exports {@link TheoryContentsService} + {@link PptConverterService}
 * so the SCORM/xAPI/Video modules can reuse its lesson-completion
 * cascade (they share the same `TheoryContent` row per lesson).
 */
@Module({
  imports: [StorageModule],
  controllers: [TheoryContentsController],
  providers: [TheoryContentsService, PptConverterService],
  exports: [TheoryContentsService, PptConverterService],
})
export class TheoryContentsModule {}
