import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChromaClient, type Collection } from 'chromadb';
import type * as PdfParseNs from 'pdf-parse';

import { RAG_CHUNK_OVERLAP, RAG_CHUNK_SIZE, RAG_TOP_K } from './ai.constants';
import { GeminiService } from './gemini.service';
import { QuotaService } from './quota.service';

/**
 * Phase 17 — Retrieval-Augmented Generation pipeline.
 *
 * When an instructor uploads a PDF attachment, we chunk it, embed the
 * chunks with `text-embedding-004`, and add them to a ChromaDB
 * collection tagged with the lessonId. At chat time the student's
 * question is embedded and the top-3 nearest chunks are stitched into
 * the system prompt so the model answers from the actual course
 * material, not its own prior.
 *
 * Failure modes are all soft — if ChromaDB is down or a chunk fails to
 * embed, `retrieve()` returns an empty string so the chat still works
 * (it just falls back to the model's general knowledge). We never
 * block a student's question on a broken vector store.
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private chroma: ChromaClient | null = null;
  private chromaReady = false;
  private readonly collectionName: string;

  constructor(
    private readonly config: ConfigService,
    private readonly gemini: GeminiService,
    @Optional() private readonly quota?: QuotaService,
  ) {
    this.collectionName = config.get<string>('CHROMA_COLLECTION') ?? 'lms_docs';
  }

  /**
   * Lazy-init the ChromaDB client. We don't connect on module boot
   * because Chroma might not be up yet and we don't want the backend
   * to fail readiness if the vector store is offline.
   */
  private getClient(): ChromaClient {
    if (!this.chroma) {
      const host = this.config.get<string>('CHROMA_HOST') ?? 'localhost';
      const port = Number(this.config.get<string>('CHROMA_PORT') ?? 8000);
      this.chroma = new ChromaClient({ path: `http://${host}:${port}` });
    }
    return this.chroma;
  }

  private async getCollection(): Promise<Collection> {
    // Chroma SDK wants a dummy embedder when we supply vectors
    // ourselves. We pass one that errors loudly if Chroma ever calls
    // it — meaning we forgot to pass `embeddings:` on an add/query.
    const chroma = this.getClient();
    return chroma.getOrCreateCollection({
      name: this.collectionName,
      embeddingFunction: {
        generate: async () => {
          throw new Error('RagService must supply embeddings explicitly — do not let Chroma embed');
        },
      },
    });
  }

  /**
   * Split a block of text into overlapping char-windows. We split on
   * paragraph boundaries first (double newline), then slice oversized
   * paragraphs into RAG_CHUNK_SIZE windows with RAG_CHUNK_OVERLAP
   * carryover. Small paragraphs are passed through whole.
   *
   * Why char-based, not token-based: Gemini's embedding endpoint
   * prices per char and hard-limits at ~8k tokens, and we want the
   * function to work without a tokenizer dependency.
   */
  splitText(text: string, size = RAG_CHUNK_SIZE, overlap = RAG_CHUNK_OVERLAP): string[] {
    if (!text) return [];
    const clean = text.replace(/\r\n/g, '\n').trim();
    const out: string[] = [];
    let i = 0;
    while (i < clean.length) {
      const end = Math.min(clean.length, i + size);
      const chunk = clean.slice(i, end).trim();
      if (chunk.length > 0) out.push(chunk);
      if (end === clean.length) break;
      // Slide the window forward by (size - overlap) — never negative.
      const advance = Math.max(1, size - overlap);
      i += advance;
    }
    return out;
  }

  /**
   * Parse a PDF buffer and push each chunk into Chroma tagged with the
   * lessonId. Embeddings are computed sequentially with a short delay
   * between calls to stay under the free-tier rate limit (60 rpm).
   *
   * The function is idempotent at the lesson level — re-indexing the
   * same lesson produces fresh ids keyed by timestamp, so old chunks
   * stay in place but don't collide. A future cleanup job can drop
   * chunks older than the most recent `indexedAt` per lesson.
   */
  async indexDocument(lessonId: string, buffer: Buffer): Promise<{ chunks: number }> {
    // Phase 18 bugfix — pdf-parse@2.x đổi API từ function `pdfParse(buf)`
    // sang class `PDFParse`. Trước đó code cũ require() hy vọng nhận
    // function → "pdfParse is not a function" → job retry 3 lần rồi fail.
    // Dùng dynamic import để tương thích cả CJS + ESM.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PDFParse } = require('pdf-parse') as typeof PdfParseNs;
    // Buffer là subclass của Uint8Array trong Node → truyền trực tiếp OK.
    // Cast sang Uint8Array rõ ràng để tránh TS phàn nàn về loại data.
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    let fullText = '';
    try {
      const result = await parser.getText();
      fullText = result.text;
    } finally {
      // Giải phóng worker PDF.js để không rò memory khi job retry.
      await parser.destroy().catch(() => undefined);
    }
    const chunks = this.splitText(fullText);
    if (chunks.length === 0) {
      this.logger.warn(
        `indexDocument: PDF lesson=${lessonId} trả text rỗng — có thể là scan/image-only PDF`,
      );
      return { chunks: 0 };
    }

    const embeddings: number[][] = [];
    for (const chunk of chunks) {
      try {
        const vec = await this.gemini.embed(chunk);
        embeddings.push(vec);
        if (this.quota) {
          await this.quota.checkAndIncrement('embedding').catch(() => undefined);
        }
      } catch (err) {
        this.logger.warn(`embed() failed for chunk — skipping: ${(err as Error).message}`);
        embeddings.push([]);
      }
      // 100ms breathing room between embed calls to avoid free-tier 429s.
      await new Promise((r) => setTimeout(r, 100));
    }

    // Filter out any failed chunks before upserting.
    const keep: Array<{ idx: number; text: string; embedding: number[] }> = [];
    chunks.forEach((text, idx) => {
      if (embeddings[idx] && embeddings[idx].length > 0) {
        keep.push({ idx, text, embedding: embeddings[idx] });
      }
    });
    if (keep.length === 0) return { chunks: 0 };

    const collection = await this.getCollection();
    const now = Date.now();
    await collection.add({
      ids: keep.map((k) => `${lessonId}-chunk-${k.idx}-${now}`),
      embeddings: keep.map((k) => k.embedding),
      documents: keep.map((k) => k.text),
      metadatas: keep.map(() => ({
        lessonId,
        indexedAt: new Date(now).toISOString(),
      })),
    });
    this.chromaReady = true;
    return { chunks: keep.length };
  }

  /**
   * Embed the query + pull top-K nearest chunks filtered by lessonId.
   * Any failure (Chroma down, embed error, empty collection) → "".
   * Callers should tolerate the empty string as "no augmentation".
   */
  async retrieve(query: string, lessonId: string): Promise<string> {
    if (!query.trim()) return '';
    try {
      const embedding = await this.gemini.embed(query);
      const collection = await this.getCollection();
      const results = await collection.query({
        queryEmbeddings: [embedding],
        nResults: RAG_TOP_K,
        where: { lessonId },
      });
      const docs = results.documents?.[0] ?? [];
      const joined = docs.filter((d): d is string => typeof d === 'string' && d.length > 0);
      return joined.join('\n\n');
    } catch (err) {
      this.logger.warn(`RAG retrieve fallback — ${(err as Error).message}`);
      return '';
    }
  }

  /**
   * Cheap connection probe used by /ai/health. We don't care about the
   * HTTP response body — just whether we can reach Chroma at all.
   */
  async ping(): Promise<{ connected: boolean; collection: string; error?: string }> {
    try {
      await this.getClient().heartbeat();
      return { connected: true, collection: this.collectionName };
    } catch (err) {
      return {
        connected: false,
        collection: this.collectionName,
        error: (err as Error).message,
      };
    }
  }

  /** Lightweight "has at least one indexed doc" flag for the dashboard. */
  async getIndexedDocCount(): Promise<number> {
    try {
      const collection = await this.getCollection();
      return await collection.count();
    } catch {
      return 0;
    }
  }

  /** Test hook for chromaReady — lets specs assert indexDocument set the flag. */
  get isReady(): boolean {
    return this.chromaReady;
  }
}
