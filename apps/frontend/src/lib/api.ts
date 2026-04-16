/**
 * Fetch wrapper — points at NEXT_PUBLIC_API_URL and surfaces backend error
 * envelope `{ statusCode, message, error, timestamp }` as a throwable.
 *
 * Phase 08.1: automatic access-token refresh on 401. When the backend rejects
 * a request with 401, the wrapper:
 *   1. Calls `POST /auth/refresh` with the stored refreshToken
 *   2. On success, updates the Zustand auth store with the new access token
 *      and retries the original request ONCE with the fresh credentials
 *   3. On failure (refresh token also expired / revoked), clears the store
 *      and redirects the browser to /login
 *
 * Concurrent 401s are deduped via a module-level `refreshInFlight` promise —
 * the first 401 starts the refresh, every subsequent 401 awaits the same
 * promise, so we issue at most one refresh per expiry event regardless of
 * how many tabs / components are mid-request.
 */
import { useAuthStore } from './auth-store';

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
  /** Optional override. Defaults to the access token from the auth store. */
  token?: string | null;
}

// =====================================================
// Refresh orchestration
// =====================================================

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Attempt to refresh the access token. Returns the new token on success,
 * null on failure. Safe to call concurrently — only one network request is
 * issued per expiry event.
 */
async function attemptRefresh(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = useAuthStore.getState().refreshToken;
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { accessToken?: string };
      if (!data.accessToken) return null;
      // Keep the same refreshToken + user — backend only issued a new access.
      useAuthStore.setState({ accessToken: data.accessToken });
      return data.accessToken;
    } catch {
      return null;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

/** Paths that MUST NOT trigger auto-refresh (refresh loop prevention). */
function isAuthFlowPath(path: string): boolean {
  return (
    path.startsWith('/auth/login') ||
    path.startsWith('/auth/register') ||
    path.startsWith('/auth/refresh') ||
    path.startsWith('/auth/logout') ||
    path.startsWith('/auth/2fa/send') ||
    path.startsWith('/auth/2fa/verify') ||
    path.startsWith('/auth/verify-email')
  );
}

function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

// =====================================================
// Core api() wrapper
// =====================================================

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body, token: explicitToken, headers, ...rest } = opts;

  const doFetch = (authToken: string | null | undefined) =>
    fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  // Pick token: explicit > store
  const storeToken = useAuthStore.getState().accessToken;
  const initialToken = explicitToken ?? storeToken;

  let res = await doFetch(initialToken);

  // Auto-refresh on 401 for non-auth-flow paths
  if (res.status === 401 && !isAuthFlowPath(path)) {
    const newToken = await attemptRefresh();
    if (newToken) {
      res = await doFetch(newToken);
    } else {
      // Refresh failed — nuke the auth state and bounce to /login.
      useAuthStore.getState().clear();
      redirectToLogin();
    }
  }

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
    params: {
      q?: string;
      role?: string;
      status?: 'active' | 'blocked';
      page?: number;
      limit?: number;
    },
    token: string,
  ) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.role) qs.set('role', params.role);
    if (params.status) qs.set('status', params.status);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return api<Paginated<AdminUser>>(`/admin/users${q ? `?${q}` : ''}`, {
      token,
    });
  },

  getUserDetail: (id: string, token: string) =>
    api<AdminUserDetail>(`/admin/users/${id}`, { token }),

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

  bulkBlock: (body: { ids: string[]; blocked: boolean }, token: string) =>
    api<{ ok: string[]; failed: Array<{ id: string; reason: string }>; total: number }>(
      '/admin/users/bulk-block',
      { method: 'PATCH', body, token },
    ),

  /** CSV/XLSX export — returns the raw Blob for a triggered download. */
  exportUsers: (
    params: { format: 'csv' | 'xlsx'; q?: string; role?: string; status?: string },
    token: string,
  ) => {
    const qs = new URLSearchParams({ format: params.format });
    if (params.q) qs.set('q', params.q);
    if (params.role) qs.set('role', params.role);
    if (params.status) qs.set('status', params.status);
    return downloadBlob(`/admin/users/export?${qs.toString()}`, token);
  },
};

export interface AdminUserDetail extends AdminUser {
  _count: {
    enrollments: number;
    certificates: number;
    instructedCourses: number;
    loginLogs: number;
  };
  loginHistory: Array<{
    id: string;
    ipAddress: string;
    userAgent: string;
    success: boolean;
    createdAt: string;
  }>;
}

// =====================================================
// Admin Dashboard API (Phase 09)
// =====================================================

export interface KpiValue {
  value: number;
  deltaPct: number;
}

export interface KpiResponse {
  totalUsers: KpiValue;
  activeToday: KpiValue;
  totalCourses: KpiValue;
  certificatesIssued: KpiValue;
}

export interface RegistrationPoint {
  month: string;
  count: number;
}

export interface TopCourseItem {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  enrollmentCount: number;
}

export interface RoleSlice {
  role: 'SUPER_ADMIN' | 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';
  count: number;
}

export interface ActivityItem {
  id: string;
  type: 'AUDIT' | 'LOGIN' | 'ENROLL';
  action: string;
  userId: string;
  userName: string;
  userRole: string;
  target: string | null;
  timestamp: string;
}

export interface AlertsResponse {
  inactiveStudents: number;
  pendingCourses: number;
  pendingItems: Array<{
    id: string;
    title: string;
    instructorName: string;
    createdAt: string;
  }>;
}

export const adminDashboardApi = {
  getKpi: (token: string) => api<KpiResponse>('/admin/dashboard/kpi', { token }),
  getRegistrations: (months: number, token: string) =>
    api<{ points: RegistrationPoint[] }>(`/admin/dashboard/registrations?months=${months}`, {
      token,
    }),
  getTopCourses: (limit: number, token: string) =>
    api<{ courses: TopCourseItem[] }>(`/admin/dashboard/top-courses?limit=${limit}`, { token }),
  getRoleDistribution: (token: string) =>
    api<{ slices: RoleSlice[] }>('/admin/dashboard/role-distribution', { token }),
  getActivityFeed: (limit: number, token: string) =>
    api<{ items: ActivityItem[] }>(`/admin/dashboard/activity-feed?limit=${limit}`, { token }),
  getAlerts: (token: string) => api<AlertsResponse>('/admin/dashboard/alerts', { token }),
};

// =====================================================
// Admin Content API (Phase 09)
// =====================================================

export interface AdminCourseRow {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  createdAt: string;
  subject: {
    id: string;
    name: string;
    code: string;
    department: { id: string; name: string; code: string };
  };
  instructor: { id: string; name: string; email: string; avatar: string | null };
  _count: { chapters: number; enrollments: number };
}

export interface CourseImpact {
  id: string;
  title: string;
  status: string;
  isDeleted: boolean;
  enrollmentCount: number;
  chapterCount: number;
  lessonCount: number;
  totalCertificates: number;
  activeCertificates: number;
}

export const adminContentApi = {
  listCourses: (
    params: { q?: string; status?: string; subjectId?: string; page?: number; limit?: number },
    token: string,
  ) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return api<Paginated<AdminCourseRow>>(`/admin/content/courses${q ? `?${q}` : ''}`, { token });
  },

  getImpact: (id: string, token: string) =>
    api<CourseImpact>(`/admin/content/courses/${id}/impact`, { token }),

  approve: (id: string, token: string) =>
    api<{ id: string; status: string }>(`/admin/content/courses/${id}/approve`, {
      method: 'PATCH',
      token,
    }),

  reject: (id: string, reason: string, token: string) =>
    api<{ id: string; status: string }>(`/admin/content/courses/${id}/reject`, {
      method: 'PATCH',
      body: { reason },
      token,
    }),

  deleteCourse: (id: string, token: string) =>
    api<{ message: string }>(`/admin/content/courses/${id}`, {
      method: 'DELETE',
      token,
    }),
};

// =====================================================
// Admin Certificates API (Phase 09)
// =====================================================

export interface CertificateRow {
  id: string;
  code: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  student: { id: string; name: string; email: string; avatar: string | null };
  course: { id: string; title: string; thumbnailUrl: string | null };
}

export interface CertificateStatsSummary {
  total: number;
  active: number;
  revoked: number;
  expired: number;
  avgPassRate: number;
}

export interface PassRateCourse {
  courseId: string;
  courseTitle: string;
  enrolled: number;
  passed: number;
  totalCertificates: number;
  passRate: number;
}

export const adminCertificatesApi = {
  list: (
    params: {
      q?: string;
      status?: string;
      courseId?: string;
      studentId?: string;
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
    return api<Paginated<CertificateRow>>(`/admin/certificates${q ? `?${q}` : ''}`, { token });
  },

  getStatsSummary: (token: string) =>
    api<CertificateStatsSummary>('/admin/certificates/stats/summary', { token }),

  getPassRate: (token: string) =>
    api<{ courses: PassRateCourse[] }>('/admin/certificates/stats/pass-rate', { token }),

  revoke: (id: string, reason: string, token: string) =>
    api<CertificateRow>(`/admin/certificates/${id}/revoke`, {
      method: 'PATCH',
      body: { reason },
      token,
    }),
};

// =====================================================
// Admin Reports API (Phase 09)
// =====================================================

export interface ProgressReportRow {
  studentName: string;
  studentEmail: string;
  courseTitle: string;
  progressPercent: number;
  completedAt: string | null;
  score: number | null;
}

export interface ProgressReportResponse {
  filter: Record<string, string | undefined>;
  total: number;
  rows: ProgressReportRow[];
  truncated: boolean;
}

export const adminReportsApi = {
  getProgress: (
    params: {
      departmentId?: string;
      subjectId?: string;
      courseId?: string;
      from?: string;
      to?: string;
    },
    token: string,
  ) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return api<ProgressReportResponse>(`/admin/reports/progress${q ? `?${q}` : ''}`, { token });
  },

  exportProgress: (
    params: {
      format: 'pdf' | 'xlsx';
      departmentId?: string;
      subjectId?: string;
      courseId?: string;
      from?: string;
      to?: string;
    },
    token: string,
  ) => {
    const qs = new URLSearchParams({ format: params.format });
    Object.entries(params).forEach(([k, v]) => {
      if (k !== 'format' && v !== undefined && v !== '') qs.set(k, String(v));
    });
    return downloadBlob(`/admin/reports/progress/export?${qs.toString()}`, token);
  },

  exportUsers: (
    params: { format: 'pdf' | 'xlsx'; role?: string; status?: string },
    token: string,
  ) => {
    const qs = new URLSearchParams({ format: params.format });
    if (params.role) qs.set('role', params.role);
    if (params.status) qs.set('status', params.status);
    return downloadBlob(`/admin/reports/users/export?${qs.toString()}`, token);
  },

  exportCertificates: (format: 'pdf' | 'xlsx', token: string) =>
    downloadBlob(`/admin/reports/certificates/export?format=${format}`, token),
};

// =====================================================
// Admin System Settings API (Phase 09)
// =====================================================

export interface SystemSettingRow {
  key: string;
  value: unknown;
  description: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface SmtpTestResult {
  ok: boolean;
  error?: string;
}

export const adminSettingsApi = {
  getAll: (token: string) => api<SystemSettingRow[]>('/admin/settings', { token }),

  update: (updates: Array<{ key: string; value: unknown }>, token: string) =>
    api<SystemSettingRow[]>('/admin/settings', {
      method: 'PATCH',
      body: { updates },
      token,
    }),

  testSmtp: (
    override: { host?: string; port?: number; user?: string; pass?: string; from?: string },
    token: string,
  ) =>
    api<SmtpTestResult>('/admin/settings/smtp/test', {
      method: 'POST',
      body: override,
      token,
    }),

  triggerBackup: (token: string) =>
    api<{ ok: boolean; id: string; message: string; stub: boolean }>(
      '/admin/settings/backup/trigger',
      { method: 'POST', token },
    ),

  getBackupHistory: (token: string) =>
    api<{
      items: Array<{
        id: string;
        filename: string;
        size: number;
        createdAt: string;
        status: string;
      }>;
      stub: boolean;
      message: string;
    }>('/admin/settings/backup/history', { token }),
};

// =====================================================
// downloadBlob helper — streams a file response into a Blob so the UI
// can trigger a browser download with a synthetic `<a download>` click.
// =====================================================

export async function downloadBlob(path: string, token: string | null): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, text || `Download failed (${res.status})`);
  }
  return res.blob();
}

/**
 * Trigger a browser download for a Blob with the given filename.
 * Creates a synthetic `<a>` element, clicks it, then revokes the URL.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Defer revoke so Safari / Firefox have time to initiate the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
