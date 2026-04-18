/**
 * Phase 16 — typed wrappers around /api/v1/certificates/*.
 *
 * Split into three callsites:
 *   - `certificatesApi`        auth-required endpoints
 *   - `certificatesPublicApi`  /verify/:code — no auth
 *   - `certificateCriteriaApi` /criteria/:courseId CRUD
 */
import { api } from './api';

// =====================================================
// Shared types
// =====================================================

export interface GradeThresholds {
  excellent: number;
  good: number;
  pass: number;
}

export interface CertificateCriteriaDto {
  id: string | null;
  courseId: string;
  minPassScore: number;
  minProgress: number;
  minPracticeScore: number;
  noSafetyViolation: boolean;
  requiredLessons: string[];
  validityMonths: number | null;
  gradeThresholds: GradeThresholds;
  customCriteria: unknown;
  exists: boolean;
}

export interface IssueResult {
  issued: boolean;
  certificateId?: string;
  grade?: string;
  finalScore?: number;
  reason?: string;
}

export type CertificateStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export interface PublicCertificate {
  code: string;
  studentName: string;
  courseName: string;
  issuedAt: string;
  expiresAt: string | null;
  grade: string | null;
  finalScore: number | null;
  status: CertificateStatus;
  institutionName: string;
  revokedReason: string | null;
}

export interface DownloadUrlResponse {
  url: string;
  filename: string;
}

// =====================================================
// Auth-required
// =====================================================

export const certificatesApi = {
  checkAndIssue: (courseId: string, token: string) =>
    api<IssueResult>(`/certificates/check/${courseId}`, { method: 'POST', token }),

  issueManual: (payload: { studentId: string; courseId: string; note?: string }, token: string) =>
    api<IssueResult>('/certificates/issue-manual', { method: 'POST', body: payload, token }),

  download: (certificateId: string, token: string) =>
    api<DownloadUrlResponse>(`/certificates/${certificateId}/download`, { token }),
};

// =====================================================
// Public — /verify/:code
// =====================================================

/**
 * Absolute-URL fetch because the Next.js SSR runtime (in `/verify/[code]`)
 * runs on the server and relative `/api/v1` paths wouldn't resolve. We
 * read the API base from env and bypass the typed `api()` helper — no
 * token, no auth-store, just a plain GET.
 */
export async function fetchPublicCertificate(code: string): Promise<PublicCertificate | null> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
  const res = await fetch(`${baseUrl}/certificates/verify/${encodeURIComponent(code)}`, {
    // Don't cache — a revoked cert should reflect immediately.
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`verify failed: HTTP ${res.status}`);
  return res.json() as Promise<PublicCertificate>;
}

// =====================================================
// Criteria CRUD
// =====================================================

export const certificateCriteriaApi = {
  get: (courseId: string, token: string) =>
    api<CertificateCriteriaDto>(`/certificates/criteria/${courseId}`, { token }),

  upsert: (
    courseId: string,
    payload: Partial<Omit<CertificateCriteriaDto, 'id' | 'courseId' | 'exists'>>,
    token: string,
  ) =>
    api<CertificateCriteriaDto>(`/certificates/criteria/${courseId}`, {
      method: 'PUT',
      body: payload,
      token,
    }),

  remove: (courseId: string, token: string) =>
    api<{ message: string }>(`/certificates/criteria/${courseId}`, {
      method: 'DELETE',
      token,
    }),
};
