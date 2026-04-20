/**
 * Phase 17 — AI module constants.
 *
 * Exported separately so tests + the processor can reference the same
 * queue name without pulling in the full module.
 */

export const GEMINI_QUEUE = 'gemini-tasks';

/**
 * Daily soft-limit for the free Gemini tier. When a day's counter
 * crosses this threshold we log a warning; the service still tries
 * the request (Google's hard limits kick in with a 429 anyway).
 *
 * Keep in sync with the frontend admin-health progress bar.
 */
export const AI_DAILY_WARN_THRESHOLD = 1400;
export const AI_DAILY_HARD_CAP_DISPLAY = 1500;

/**
 * RAG tuning. Chunk sizes are char-based (not token-based) because
 * Gemini's embedding endpoint prices by total chars; 1000 chars
 * ≈ 250 tokens which sits well under the 2048-token input limit,
 * with 200-char overlap to preserve context across chunk boundaries.
 */
export const RAG_CHUNK_SIZE = 1000;
export const RAG_CHUNK_OVERLAP = 200;
export const RAG_TOP_K = 3;

/**
 * Default Gemini model ids. Service code reads ConfigService first and
 * falls back to these — means tests can boot with no env configured.
 */
export const GEMINI_DEFAULT_CHAT_MODEL = 'gemini-2.5-flash';
export const GEMINI_DEFAULT_LITE_MODEL = 'gemini-flash-lite-latest';
// Phase 18 bugfix — Google deprecate `text-embedding-004` ở v1beta
// (404 Not Found khi embedContent). Chuyển sang `gemini-embedding-001`
// (current stable, tương thích free tier). User có thể override qua env
// GEMINI_MODEL_EMBEDDING nếu Google publish model mới hơn.
export const GEMINI_DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';

export const AI_RECOMMENDATION_TYPES = {
  REVIEW_LESSON: 'REVIEW_LESSON',
  PRACTICE_MORE: 'PRACTICE_MORE',
  SAFETY_REMINDER: 'SAFETY_REMINDER',
  ADAPTIVE: 'ADAPTIVE',
} as const;

export type AiRecommendationType =
  (typeof AI_RECOMMENDATION_TYPES)[keyof typeof AI_RECOMMENDATION_TYPES];
