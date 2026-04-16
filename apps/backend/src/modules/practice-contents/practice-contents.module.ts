import { Module } from '@nestjs/common';

import { PracticeContentsController } from './practice-contents.controller';
import { PracticeContentsService } from './practice-contents.service';

@Module({
  controllers: [PracticeContentsController],
  providers: [PracticeContentsService],
  exports: [PracticeContentsService],
})
export class PracticeContentsModule {}
