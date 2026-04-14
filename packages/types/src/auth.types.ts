/**
 * Auth & User types.
 */
import type { ID, Timestamped, SoftDeletable } from './common.types';

export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  INSTRUCTOR = 'INSTRUCTOR',
  STUDENT = 'STUDENT',
}

export interface User extends Timestamped, SoftDeletable {
  id: ID;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: Role;
  isEmailVerified: boolean;
  is2FAEnabled: boolean;
  lastLoginAt: Date | null;
}

export interface JwtPayload {
  sub: ID;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse {
  user: Omit<User, 'isDeleted' | 'deletedAt'>;
  tokens: AuthTokens;
}
