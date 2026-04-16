/**
 * Auth & User types.
 *
 * Giữ đồng bộ với `packages/database/prisma/schema.prisma → model User`.
 * Field naming ở đây phải khớp tên Prisma (không đổi thành camel biến thể khác).
 */
import type { ID } from './common.types';

/**
 * Role — defined as a const object + union type (NOT a TS enum) so it is
 * structurally assignable to Prisma's generated `Role` enum. A TS `enum`
 * would be a nominal type and clash with `@prisma/client.Role` even though
 * the string values are identical.
 */
export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  INSTRUCTOR: 'INSTRUCTOR',
  STUDENT: 'STUDENT',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/**
 * User entity — matches Prisma `users` table.
 * `password` is intentionally OMITTED: never leak to any client/caller.
 */
export interface User {
  id: ID;
  email: string;
  name: string;
  phone: string | null;
  avatar: string | null;
  role: Role;
  is2FAEnabled: boolean;
  emailVerified: boolean;
  isBlocked: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JwtPayload {
  sub: ID;
  email: string;
  role: Role;
  /** Unique token id — used for refresh-token allowlist in Redis. */
  jti?: string;
  /** Scope tag — `'2fa'` means a short-lived temp token issued by /login when 2FA is required. */
  scope?: 'access' | 'refresh' | '2fa';
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds. */
  expiresIn: number;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

export interface Login2FARequiredResponse {
  requires2FA: true;
  /** Short-lived JWT (5 min) — pass back to /auth/2fa/send and /auth/2fa/verify. */
  tempToken: string;
}
