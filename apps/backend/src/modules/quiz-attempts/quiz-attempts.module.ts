import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { StudentsModule } from '../students/students.module';

import { QuizAttemptsController } from './quiz-attempts.controller';
import { QuizAttemptsService } from './quiz-attempts.service';

@Module({
  imports: [PrismaModule, StudentsModule],
  controllers: [QuizAttemptsController],
  providers: [QuizAttemptsService],
})
export class QuizAttemptsModule {}
