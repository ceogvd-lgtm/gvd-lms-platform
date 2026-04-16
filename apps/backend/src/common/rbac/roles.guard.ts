import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from './roles.decorator';

/**
 * Static role check — enforces `@Roles(...)` metadata.
 *
 * This guard handles LAW 1 at the ROUTE level:
 *   "Chỉ SUPER_ADMIN gọi được createAdmin · deleteAdmin · updateAdminRole"
 *
 * Dynamic checks that depend on the target user (LAW 2/3/4) live in
 * `AdminRulesService` and are invoked from service methods.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtPayload | undefined;
    if (!user) {
      throw new ForbiddenException('Không có thông tin người dùng');
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện hành động này');
    }
    return true;
  }
}
