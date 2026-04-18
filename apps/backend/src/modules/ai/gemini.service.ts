import {
  GoogleGenerativeAI,
  type EmbedContentRequest,
  type GenerativeModel,
} from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  GEMINI_DEFAULT_CHAT_MODEL,
  GEMINI_DEFAULT_EMBEDDING_MODEL,
  GEMINI_DEFAULT_LITE_MODEL,
} from './ai.constants';

/**
 * Thin wrapper around `@google/generative-ai`. Three responsibilities:
 *
 *   1. Instantiate one `GoogleGenerativeAI` per process with the key
 *      loaded from env (service is a singleton — the underlying client
 *      is cheap to reuse).
 *   2. Expose helper accessors for the three model roles the product
 *      cares about (chat / lite / embedding) so callers don't re-specify
 *      generation config per call.
 *   3. Provide a single `getConfiguredKey()` so health + quota checks
 *      can report "is the key present?" without leaking it.
 *
 * The class deliberately does NOT implement any business logic — RAG,
 * quota, system-prompt building all live in their own services.
 *
 * IMPORTANT: never use `gemini-2.0-flash` (429 rate limit) or
 * `gemini-1.5-flash` (retired 404). Defaults point at the verified
 * working model ids; override via `GEMINI_MODEL` / `GEMINI_MODEL_LITE`
 * / `GEMINI_MODEL_EMBEDDING` env vars.
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly client: GoogleGenerativeAI | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('GEMINI_API_KEY');
    if (!apiKey || apiKey.length < 10) {
      this.logger.warn('GEMINI_API_KEY missing — AI module will return error/fallback responses.');
      this.client = null;
      return;
    }
    this.client = new GoogleGenerativeAI(apiKey);
  }

  /** Used by /ai/health to report "configured? yes/no" without leaking the key. */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /** Main chat model. Larger context + temperature 0.7 for conversational replies. */
  getChatModel(): GenerativeModel {
    this.assertConfigured();
    const model = this.config.get<string>('GEMINI_MODEL') ?? GEMINI_DEFAULT_CHAT_MODEL;
    return this.client!.getGenerativeModel({
      model,
      generationConfig: {
        // Must be ≥ 1000 — gemini-2.5-flash burns tokens on "thinking"
        // reasoning even before producing user-visible output, so a
        // 256-token cap starves the response.
        maxOutputTokens: 1024,
        temperature: 0.7,
      },
    });
  }

  /**
   * Cheaper model for batch jobs (recommendations, weekly report,
   * suggested questions). Lower temperature because we want the JSON
   * output to be deterministic enough to parse reliably.
   */
  getLiteModel(): GenerativeModel {
    this.assertConfigured();
    const model = this.config.get<string>('GEMINI_MODEL_LITE') ?? GEMINI_DEFAULT_LITE_MODEL;
    return this.client!.getGenerativeModel({
      model,
      generationConfig: { maxOutputTokens: 512, temperature: 0.5 },
    });
  }

  /** 768-dim embedding model used by RagService. */
  getEmbeddingModel(): GenerativeModel {
    this.assertConfigured();
    const model =
      this.config.get<string>('GEMINI_MODEL_EMBEDDING') ?? GEMINI_DEFAULT_EMBEDDING_MODEL;
    return this.client!.getGenerativeModel({ model });
  }

  /**
   * Tiny helper around the embedding SDK so callers can pass a raw
   * string and get back the float vector directly. Accepts an
   * `EmbedContentRequest` for future flexibility (task type, title).
   */
  async embed(input: string | EmbedContentRequest): Promise<number[]> {
    const model = this.getEmbeddingModel();
    const req: EmbedContentRequest =
      typeof input === 'string' ? { content: { parts: [{ text: input }], role: 'user' } } : input;
    const res = await model.embedContent(req);
    return res.embedding.values;
  }

  /** Display-only model ids for /ai/health. */
  getModelIds(): { chat: string; lite: string; embedding: string } {
    return {
      chat: this.config.get<string>('GEMINI_MODEL') ?? GEMINI_DEFAULT_CHAT_MODEL,
      lite: this.config.get<string>('GEMINI_MODEL_LITE') ?? GEMINI_DEFAULT_LITE_MODEL,
      embedding:
        this.config.get<string>('GEMINI_MODEL_EMBEDDING') ?? GEMINI_DEFAULT_EMBEDDING_MODEL,
    };
  }

  private assertConfigured(): void {
    if (!this.client) {
      throw new Error('Gemini client not configured — set GEMINI_API_KEY');
    }
  }
}
