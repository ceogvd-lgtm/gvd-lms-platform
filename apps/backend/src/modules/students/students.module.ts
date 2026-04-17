import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';

import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { XpService } from './xp.service';

/**
 * Bundles the student dashboard endpoints + XpService. Exports XpService
 * so QuizAttempts / LessonProgress cascades can award XP without
 * re-instantiating a Prisma client.
 */
@Module({
  imports: [PrismaModule],
  controllers: [StudentsController],
  providers: [StudentsService, XpService],
  exports: [XpService, StudentsService],
})
export class StudentsModule {}
