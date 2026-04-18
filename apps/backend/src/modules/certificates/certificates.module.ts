import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { StorageCoreModule } from '../../common/storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { CertificateCriteriaService } from './certificate-criteria.service';
import { CertificatesPublicController } from './certificates-public.controller';
import { CertificatesStudentController } from './certificates-student.controller';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';

@Module({
  imports: [PrismaModule, AuditModule, StorageCoreModule, NotificationsModule],
  controllers: [
    CertificatesController,
    CertificatesStudentController,
    CertificatesPublicController,
  ],
  providers: [CertificatesService, CertificateCriteriaService],
  exports: [CertificatesService, CertificateCriteriaService],
})
export class CertificatesModule {}
