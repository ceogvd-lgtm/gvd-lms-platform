/**
 * Phase 12 — Theory Lesson Engine client.
 *
 * Three sub-surfaces of the backend:
 *   - scormApi   — upload + manifest + track + progress
 *   - xapiApi    — statements LRS stub
 *   - videoApi   — heartbeat progress
 *   - theoryEngineApi — content upload + PPT convert + slides
 *   - lessonEngineApi — lesson complete + progress bundle
 */
import { ApiError, api } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

// =====================================================
// Shared types
// =====================================================

export type ContentKind = 'SCORM' | 'XAPI' | 'POWERPOINT' | 'VIDEO';
export type ProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type ScormVersion = '1.2' | '2004';

export interface SlideItem {
  index: number;
  imageUrl: string;
  notes?: string;
}

export interface SlideDeck {
  lessonId: string;
  sourceKey: string;
  convertedAt: string;
  converter: 'libreoffice' | 'fallback';
  total: number;
  slides: SlideItem[];
  message?: string;
}

export interface ScormManifestResponse {
  version: ScormVersion;
  entryPoint: string;
  entryUrl: string;
  title: string;
}

export interface ScormUploadResult extends ScormManifestResponse {
  itemCount: number;
}

export interface ScormTrackPayload {
  lessonStatus?: 'passed' | 'failed' | 'completed' | 'incomplete' | 'browsed' | 'not attempted';
  scoreRaw?: number;
  sessionTime?: number;
  suspendData?: string;
}

export interface LessonProgressRow {
  id: string;
  lessonId: string;
  studentId: string;
  status: ProgressStatus;
  score: number | null;
  timeSpent: number;
  attempts: number;
  lastViewAt: string;
  completedAt: string | null;
}

export interface VideoProgressRow {
  lessonId: string;
  watchedSeconds: number;
  duration: number;
  lastPosition: number;
  isCompleted: boolean;
  status: ProgressStatus;
}

export interface QuizAttemptRow {
  id: string;
  quizId: string;
  studentId: string;
  score: number;
  maxScore: number;
  answers: unknown;
  startedAt: string;
  completedAt: string | null;
}

export interface LessonStudentProgress {
  progress: LessonProgressRow | null;
  videoProgress: VideoProgressRow | null;
  quizAttempts: QuizAttemptRow[];
}

// =====================================================
// Multipart helper — the JSON api() wrapper can't send FormData
// =====================================================
async function uploadMultipart<T>(
  path: string,
  file: File,
  token: string,
  extraFields: Record<string, string> = {},
): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    let message = `Upload failed (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed?.message)
        message = Array.isArray(parsed.message) ? parsed.message.join(', ') : parsed.message;
    } catch {
      if (text) message = text;
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

// =====================================================
// Theory-engine (content upload + PPT convert + slides)
// =====================================================

export interface TheoryUploadResult {
  content: {
    id: string;
    lessonId: string;
    contentType: string;
    contentUrl: string;
  };
  fileUrl: string;
  fileKey: string;
}

export const theoryEngineApi = {
  uploadContent: (lessonId: string, kind: ContentKind, file: File, token: string) =>
    uploadMultipart<TheoryUploadResult>(`/lessons/${lessonId}/theory/upload`, file, token, {
      kind,
    }),

  convertPpt: (lessonId: string, sourceKey: string, token: string) =>
    api<SlideDeck>(`/lessons/${lessonId}/theory/convert-ppt`, {
      method: 'POST',
      body: { sourceKey },
      token,
    }),

  getSlides: (lessonId: string, token: string) =>
    api<SlideDeck | null>(`/lessons/${lessonId}/theory/slides`, { token }),
};

// =====================================================
// SCORM
// =====================================================

export const scormApi = {
  upload: (lessonId: string, file: File, token: string) =>
    uploadMultipart<ScormUploadResult>(`/scorm/upload/${lessonId}`, file, token),

  manifest: (lessonId: string, token: string) =>
    api<ScormManifestResponse>(`/scorm/${lessonId}/manifest`, { token }),

  track: (lessonId: string, payload: ScormTrackPayload, token: string) =>
    api<{ status: ProgressStatus; score: number | null }>(`/scorm/${lessonId}/track`, {
      method: 'POST',
      body: payload,
      token,
    }),

  progress: (lessonId: string, token: string) =>
    api<LessonProgressRow | null>(`/scorm/${lessonId}/progress`, { token }),
};

// =====================================================
// xAPI
// =====================================================

export interface XapiStatement {
  actor: { name?: string; mbox?: string; account?: { homePage?: string; name?: string } };
  verb: { id: string; display?: Record<string, string> };
  object: { id: string; definition?: Record<string, unknown> };
  result?: {
    score?: { raw?: number; min?: number; max?: number; scaled?: number };
    success?: boolean;
    completion?: boolean;
    duration?: string;
  };
  context?: Record<string, unknown>;
  timestamp?: string;
}

export const xapiApi = {
  record: (statement: XapiStatement, token: string) =>
    api<{ lessonId: string; status: ProgressStatus; score: number | null; verb: string }>(
      '/xapi/statements',
      { method: 'POST', body: statement, token },
    ),

  list: (lessonId: string, token: string) =>
    api<LessonProgressRow | null>(`/xapi/statements?lessonId=${encodeURIComponent(lessonId)}`, {
      token,
    }),
};

// =====================================================
// Video-progress
// =====================================================

export interface VideoTrackPayload {
  watchedSeconds: number;
  duration: number;
  lastPosition: number;
  isCompleted?: boolean;
}

export const videoApi = {
  track: (lessonId: string, payload: VideoTrackPayload, token: string) =>
    api<VideoProgressRow>(`/video/${lessonId}/progress`, {
      method: 'POST',
      body: payload,
      token,
    }),

  get: (lessonId: string, token: string) =>
    api<VideoProgressRow | null>(`/video/${lessonId}/progress`, { token }),
};

// =====================================================
// Lesson-engine helpers (Phase 12 additions on lessons module)
// =====================================================

export const lessonEngineApi = {
  complete: (lessonId: string, token: string) =>
    api<LessonProgressRow>(`/lessons/${lessonId}/complete`, {
      method: 'POST',
      token,
    }),

  progress: (lessonId: string, token: string) =>
    api<LessonStudentProgress>(`/lessons/${lessonId}/progress`, { token }),
};

// =====================================================
// Lesson attachments (Phase 12)
// =====================================================

export interface LessonAttachment {
  id: string;
  lessonId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
}

export const attachmentsApi = {
  list: (lessonId: string, token: string) =>
    api<LessonAttachment[]>(`/lessons/${lessonId}/attachments`, { token }),

  create: (
    lessonId: string,
    body: { fileName: string; fileUrl: string; fileSize: number; mimeType: string },
    token: string,
  ) =>
    api<LessonAttachment>(`/lessons/${lessonId}/attachments`, {
      method: 'POST',
      body,
      token,
    }),

  remove: (lessonId: string, attachmentId: string, token: string) =>
    api<{ message: string; id: string }>(`/lessons/${lessonId}/attachments/${attachmentId}`, {
      method: 'DELETE',
      token,
    }),
};
