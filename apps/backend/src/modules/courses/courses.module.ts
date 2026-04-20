import { Module } from '@nestjs/common';

import { EnrollmentsModule } from '../enrollments/enrollments.module';

import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  // Phase 18 — auto-enroll hook sau APPROVE gọi EnrollmentsService.
  imports: [EnrollmentsModule],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
