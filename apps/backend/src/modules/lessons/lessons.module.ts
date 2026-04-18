import { forwardRef, Module } from '@nestjs/common';

import { CertificatesModule } from '../certificates/certificates.module';
import { ProgressModule } from '../progress/progress.module';
import { StudentsModule } from '../students/students.module';

import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  imports: [StudentsModule, forwardRef(() => ProgressModule), CertificatesModule],
  controllers: [LessonsController],
  providers: [LessonsService],
  exports: [LessonsService],
})
export class LessonsModule {}
