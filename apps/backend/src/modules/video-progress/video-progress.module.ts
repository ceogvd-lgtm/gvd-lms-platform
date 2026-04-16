import { Module } from '@nestjs/common';

import { VideoProgressController } from './video-progress.controller';
import { VideoProgressService } from './video-progress.service';

@Module({
  controllers: [VideoProgressController],
  providers: [VideoProgressService],
  exports: [VideoProgressService],
})
export class VideoProgressModule {}
