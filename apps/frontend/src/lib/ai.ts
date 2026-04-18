/**
 * Phase 17 — AI Learning Assistant client library.
 *
 * Wraps the `/api/v1/ai/*` endpoints with typed helpers + one custom
 * streaming helper for the SSE chat. Consumers import from here rather
 * than hitting `fetch` directly so the auth-token + refresh behaviour
 * stays consistent with `lib/api.ts`.
 */
import { api } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

// =====================================================
// Response shapes
// =====================================================

export interface AiRecommendationRow {
  id: string;
  type: string;
  content: string;
  lessonId: string | null;
  isRead: boolean;
  createdAt: string;
  lesson: { id: string; title: string } | null;
}

export interface AiHealthPayload {
  gemini: {
    configured: boolean;
    models: { chat: string; lite: string; embedding: string } | null;
  };
  quotaToday: Array<{ model: string; requests: number; tokens: number }>;
  chroma: {
    connected: boolean;
    collection: string;
    indexedDocuments: number;
    error?: string;
  };
}

export interface ChatHistoryTurn {
  role: 'user' | 'model';
  content: string;
}

// =====================================================
// REST helpers
// =====================================================

export const aiApi = {
  getSuggestions: (lessonId: string, token: string) =>
    api<{ lessonId: string; questions: string[] }>(`/ai/suggestions/${lessonId}`, { token }),

  listRecommendations: (token: string) =>
    api<{ data: AiRecommendationRow[] }>('/ai/recommendations', { token }),

  markRecommendationRead: (id: string, token: string) =>
    api<{ ok: true }>(`/ai/recommendations/${id}/read`, {
      method: 'PATCH',
      token,
    }),

  rateMessage: (messageId: string, rating: 1 | -1, token: string) =>
    api<{ id: string; rating: number }>(`/ai/chat/${messageId}/rating`, {
      method: 'PATCH',
      body: { rating },
      token,
    }),

  indexLesson: (lessonId: string, token: string) =>
    api<{ enqueued: boolean; lessonId: string }>('/ai/index-lesson', {
      method: 'POST',
      body: { lessonId },
      token,
    }),

  getHealth: (token: string) => api<AiHealthPayload>('/ai/health', { token }),
};

// =====================================================
// SSE streaming — custom because `api()` consumes the body
// as a single JSON read.
// =====================================================

export interface ChatStreamFrame {
  text?: string;
  messageId?: string;
  userMessageId?: string;
  sessionId?: string;
  error?: 'quota_exceeded' | 'ai_error' | 'ai_disabled';
  done?: boolean;
}

export interface ChatStreamOptions {
  message: string;
  lessonId?: string;
  history?: ChatHistoryTurn[];
  sessionId?: string;
  signal?: AbortSignal;
  onFrame: (frame: ChatStreamFrame) => void;
}

/**
 * POST to `/ai/chat` and forward each SSE frame to `onFrame`. Resolves
 * when the server writes `[DONE]` or the stream closes; rejects on
 * non-2xx status only. The caller owns display decisions — we don't
 * retry here.
 */
export async function streamChat(token: string, opts: ChatStreamOptions): Promise<void> {
  const res = await fetch(`${API_URL}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      message: opts.message,
      lessonId: opts.lessonId,
      history: opts.history,
      sessionId: opts.sessionId,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Chat stream failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // SSE frames are delimited by double-newline.
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const payload = frame
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6))
        .join('\n');
      if (!payload) continue;
      if (payload === '[DONE]') {
        opts.onFrame({ done: true });
        return;
      }
      try {
        const parsed = JSON.parse(payload) as ChatStreamFrame;
        opts.onFrame(parsed);
      } catch {
        // Malformed frame — ignore rather than abort the stream.
      }
    }
  }
  opts.onFrame({ done: true });
}
