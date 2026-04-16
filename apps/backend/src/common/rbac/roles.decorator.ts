import type { Role } from '@lms/types';
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Route-level required roles.
 * Example:
 *   @Roles(Role.SUPER_ADMIN, Role.ADMIN)
 *   @Get('users')
 *   listUsers() {}
 *
 * Works alongside the global JwtAuthGuard + RolesGuard. A request must pass
 * both the JWT check and role check to reach the handler.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
