import { Global, Module } from '@nestjs/common';

import { AdminRulesService } from './admin-rules.service';
import { RolesGuard } from './roles.guard';

/**
 * Global RBAC module — exposes:
 *   - AdminRulesService: the 4 Immutable Laws engine
 *   - RolesGuard: for use with @Roles() decorator (registered as APP_GUARD
 *     in AppModule so every route is implicitly role-checked)
 */
@Global()
@Module({
  providers: [AdminRulesService, RolesGuard],
  exports: [AdminRulesService, RolesGuard],
})
export class RbacModule {}
