/**
 * Common shared types used across modules.
 */

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
}

export interface SoftDeletable {
  isDeleted: boolean;
  deletedAt: Date | null;
}

export interface Timestamped {
  createdAt: Date;
  updatedAt: Date;
}

export type ID = string;
