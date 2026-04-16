import { Module } from '@nestjs/common';

import { XapiController } from './xapi.controller';
import { XapiService } from './xapi.service';

@Module({
  controllers: [XapiController],
  providers: [XapiService],
  exports: [XapiService],
})
export class XapiModule {}
