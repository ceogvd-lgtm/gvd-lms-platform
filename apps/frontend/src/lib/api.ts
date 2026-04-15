/**
 * Fetch wrapper — points at NEXT_PUBLIC_API_URL and surfaces backend error
 * envelope `{ statusCode, message, error, timestamp }` as a throwable.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }
}

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  token?: string | null;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body, token, headers, ...rest } = opts;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : null) ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }

  return data as T;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

// ---------- Auth API surface ----------

export const authApi = {
  register: (body: { email: string; name: string; password: string }) =>
    api<{ message: string }>('/auth/register', { method: 'POST', body }),

  login: (body: { email: string; password: string }) =>
    api<LoginResponsePayload>('/auth/login', { method: 'POST', body }),

  send2FA: (tempToken: string) =>
    api<{ message: string }>('/auth/2fa/send', {
      method: 'POST',
      body: { tempToken },
    }),

  verify2FA: (body: { tempToken: string; otp: string }) =>
    api<LoginSuccessPayload>('/auth/2fa/verify', { method: 'POST', body }),

  verifyEmail: (token: string) =>
    api<{ message: string }>(`/auth/verify-email?token=${encodeURIComponent(token)}`),

  refresh: (refreshToken: string) =>
    api<{ accessToken: string }>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    }),

  logout: (refreshToken: string, accessToken: string) =>
    api<{ message: string }>('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
      token: accessToken,
    }),
};

// Backend returns one of these shapes from /auth/login
export type LoginResponsePayload = LoginSuccessPayload | { requires2FA: true; tempToken: string };

export interface LoginSuccessPayload {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    avatar: string | null;
    emailVerified: boolean;
    is2FAEnabled: boolean;
  };
}

export function isLogin2FA(r: LoginResponsePayload): r is { requires2FA: true; tempToken: string } {
  return 'requires2FA' in r && r.requires2FA === true;
}

// ---------- Admin API surface ----------

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatar: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';
  emailVerified: boolean;
  is2FAEnabled: boolean;
  isBlocked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  targetType: string;
  targetId: string;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string;
  createdAt: string;
  user: { id: string; email: string; name: string; role: string };
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const adminApi = {
  listUsers: (
    params: { q?: string; role?: string; page?: number; limit?: number },
    token: string,
  ) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.role) qs.set('role', params.role);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return api<Paginated<AdminUser>>(`/admin/users${q ? `?${q}` : ''}`, {
      token,
    });
  },

  listAuditLog: (
    params: {
      q?: string;
      action?: string;
      targetType?: string;
      userId?: string;
      page?: number;
      limit?: number;
    },
    token: string,
  ) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return api<Paginated<AuditLogEntry>>(`/admin/audit-log${q ? `?${q}` : ''}`, { token });
  },

  createAdmin: (body: { email: string; name: string; password: string }, token: string) =>
    api<AdminUser>('/admin/create-admin', { method: 'POST', body, token }),

  deleteUser: (id: string, token: string) =>
    api<{ message: string }>(`/admin/users/${id}`, {
      method: 'DELETE',
      token,
    }),

  updateRole: (id: string, role: string, token: string) =>
    api<AdminUser>(`/admin/users/${id}/role`, {
      method: 'PATCH',
      body: { role },
      token,
    }),

  setBlocked: (id: string, blocked: boolean, token: string) =>
    api<AdminUser>(`/admin/users/${id}/block`, {
      method: 'PATCH',
      body: { blocked },
      token,
    }),
};
