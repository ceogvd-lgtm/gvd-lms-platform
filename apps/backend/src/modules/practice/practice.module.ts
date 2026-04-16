import { Module } from '@nestjs/common';

import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';

@Module({
  controllers: [PracticeController],
  providers: [PracticeService],
  exports: [PracticeService],
})
export class PracticeModule {}
