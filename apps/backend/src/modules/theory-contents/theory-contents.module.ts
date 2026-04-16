import { Module } from '@nestjs/common';

import { TheoryContentsController } from './theory-contents.controller';
import { TheoryContentsService } from './theory-contents.service';

@Module({
  controllers: [TheoryContentsController],
  providers: [TheoryContentsService],
  exports: [TheoryContentsService],
})
export class TheoryContentsModule {}
