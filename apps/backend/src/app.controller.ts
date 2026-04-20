import { Controller, Get } from '@nestjs/common';

import { AppService } from './app.service';
import { Public } from './modules/auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Phase 18 — expanded health endpoint.
  //
  // Returns per-dependency status (database, redis, minio, chromadb,
  // gemini) plus basic metrics (uptime, version, dbResponseMs,
  // redisResponseMs, pendingJobs). Used by Docker healthchecks + uptime
  // monitors.
  @Public()
  @Get('health')
  getHealth() {
    return this.appService.getDetailedHealth();
  }
}
