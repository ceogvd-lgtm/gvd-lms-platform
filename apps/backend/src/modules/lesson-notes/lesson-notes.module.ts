import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';

import { LessonNotesController } from './lesson-notes.controller';
import { LessonNotesService } from './lesson-notes.service';

@Module({
  imports: [PrismaModule],
  controllers: [LessonNotesController],
  providers: [LessonNotesService],
})
export class LessonNotesModule {}
