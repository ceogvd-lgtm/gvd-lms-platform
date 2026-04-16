/**
 * Phase 13 — Virtual Lab API client.
 *
 * Typed wrappers around `/practice/*` and the Phase-13 additions on
 * `/practice-contents/*`. Mirrors the shape the backend services
 * publish so autocomplete in the UI stays sharp.
 */
import { ApiError, api } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

// =====================================================
// Config shapes (kept in sync with scoring-engine.ts)
// =====================================================

export interface ScoringStepConfig {
  stepId: string;
  description?: string;
  maxPoints: number;
  isMandatory?: boolean;
  order?: number;
}

export interface SafetyItemConfig {
  safetyId: string;
  description?: string;
  isCritical?: boolean;
}

export interface ScoringConfig {
  steps: ScoringStepConfig[];
  safetyChecklist: SafetyItemConfig[];
  passScore: number;
  timeLimit?: number | null;
}

// =====================================================
// Attempt / result shapes
// =====================================================

export type ProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface StartAttemptResult {
  attemptId: string;
  scoringConfig: ScoringConfig;
  safetyChecklist: SafetyItemConfig[];
  timeLimit: number | null;
  maxAttempts: number | null;
  attemptsUsed: number;
}

export interface StepBreakdown {
  stepId: string;
  awarded: number;
  maxPoints: number;
  isCorrect: boolean;
  isInOrder: boolean;
  isMandatory: boolean;
  skipped: boolean;
}

export interface CompleteAttemptResult {
  passed: boolean;
  score: number;
  maxScore: number;
  penalty: number;
  criticalViolations: string[];
  stepBreakdown: StepBreakdown[];
  feedback: string;
}

export interface AttemptRow {
  id: string;
  practiceContentId: string;
  studentId: string;
  score: number;
  maxScore: number;
  duration: number;
  status: ProgressStatus;
  completedAt: string | null;
  createdAt: string;
  actions: unknown;
  violations: unknown;
  student?: { id: string; name: string; email: string } | null;
}

export interface PracticeAnalytics {
  totalAttempts: number;
  studentsAttempted: number;
  avgScore: number;
  passRate: number;
  avgDuration: number;
  stepAnalytics: Array<{
    stepId: string;
    description: string;
    attempts: number;
    correct: number;
    correctPercent: number;
  }>;
  safetyViolationStats: Array<{
    safetyId: string;
    description: string;
    isCritical: boolean;
    violationCount: number;
    violationPercent: number;
  }>;
  ranking: Array<{
    studentId: string;
    studentName: string;
    studentEmail: string;
    bestScore: number;
    bestMaxScore: number;
    passed: boolean;
    attemptCount: number;
  }>;
}

// =====================================================
// WebGL upload
// =====================================================

export interface WebGLUploadResult {
  jobId: string;
  rawKey: string;
  projectName: string | null;
  predictedUrl: string;
}

export interface WebGLExtractStatus {
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'unknown';
  progress: number;
  failReason: string | null;
}

// =====================================================
// Request shapes
// =====================================================

export interface RecordActionPayload {
  attemptId: string;
  stepId: string;
  isCorrect: boolean;
  isInOrder?: boolean;
  isSafe?: boolean;
  safetyViolationId?: string;
  score?: number;
  timestamp?: number;
}

export interface CompleteAttemptPayload {
  attemptId: string;
  duration: number;
  stepsResult: Array<{
    stepId: string;
    isCorrect: boolean;
    isInOrder?: boolean;
    durationMs?: number;
  }>;
  safetyViolations: Array<{ safetyId: string; timestamp?: number }>;
}

// =====================================================
// Multipart helper — api() doesn't handle FormData
// =====================================================

async function uploadFile<T>(path: string, file: File, token: string): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `Upload failed (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { message?: string | string[] };
      if (parsed?.message) {
        msg = Array.isArray(parsed.message) ? parsed.message.join(', ') : parsed.message;
      }
    } catch {
      if (text) msg = text;
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

// =====================================================
// practiceApi — student + instructor lifecycle
// =====================================================

export const practiceApi = {
  start: (lessonId: string, token: string) =>
    api<StartAttemptResult>('/practice/start', {
      method: 'POST',
      body: { lessonId },
      token,
    }),

  action: (payload: RecordActionPayload, token: string) =>
    api<{ ok: true }>('/practice/action', {
      method: 'POST',
      body: payload,
      token,
    }),

  complete: (payload: CompleteAttemptPayload, token: string) =>
    api<CompleteAttemptResult>('/practice/complete', {
      method: 'POST',
      body: payload,
      token,
    }),

  listAttempts: (lessonId: string, token: string) =>
    api<AttemptRow[]>(`/practice/${lessonId}/attempts`, { token }),

  getAnalytics: (lessonId: string, token: string) =>
    api<PracticeAnalytics>(`/practice/${lessonId}/analytics`, { token }),
};

// =====================================================
// practiceContentsApi (Phase 13 additions)
// =====================================================

export const practiceContentsApi = {
  uploadWebGL: (lessonId: string, file: File, token: string) =>
    uploadFile<WebGLUploadResult>(`/practice-contents/${lessonId}/upload-webgl`, file, token),

  extractStatus: (lessonId: string, jobId: string, token: string) =>
    api<WebGLExtractStatus>(
      `/practice-contents/${lessonId}/extract-status?jobId=${encodeURIComponent(jobId)}`,
      { token },
    ),
};
