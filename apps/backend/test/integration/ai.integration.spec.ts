/**
 * Integration tests for the AI module.
 *
 * Exercises RagService + QuotaService + ChatService together with
 * stubbed Gemini + ChromaDB so no external calls are made. Focuses on
 * cross-service contracts:
 *
 *   - splitText chunking boundaries
 *   - retrieve() graceful fallback when ChromaDB / Gemini throw
 *   - quota upsert + hasQuotaFor threshold
 *   - chat stream emits ai_disabled when key missing
 */
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AI_DAILY_HARD_CAP_DISPLAY, RAG_CHUNK_SIZE } from '../../src/modules/ai/ai.constants';
import { ChatService } from '../../src/modules/ai/chat.service';
import { GeminiService } from '../../src/modules/ai/gemini.service';
import { QuotaService } from '../../src/modules/ai/quota.service';
import { RagService } from '../../src/modules/ai/rag.service';

import { createPrismaStub } from './helpers/prisma-stub';

/** Minimal Gemini stub that lets tests control embed + stream outputs. */
class StubGemini {
  configured = true;
  embedResult: number[] | Error = [0.1, 0.2, 0.3];
  isConfigured() {
    return this.configured;
  }
  async embed(_text: string): Promise<number[]> {
    if (this.embedResult instanceof Error) throw this.embedResult;
    return this.embedResult;
  }
  getChatModel() {
    const fakeStream = {
      stream: (async function* () {
        yield { text: () => 'hello' };
        yield { text: () => ' world' };
      })(),
      response: Promise.resolve({ text: () => 'hello world' }),
    };
    return {
      generateContentStream: jest.fn().mockResolvedValue(fakeStream),
      startChat: jest.fn().mockReturnValue({
        sendMessageStream: jest.fn().mockResolvedValue(fakeStream),
      }),
    };
  }
  getLiteModel() {
    return this.getChatModel();
  }
  getEmbeddingModel() {
    return { embedContent: jest.fn() };
  }
}

describe('AI integration', () => {
  let prisma: ReturnType<typeof createPrismaStub>;
  let gemini: StubGemini;
  let rag: RagService;
  let quota: QuotaService;
  let chat: ChatService;

  beforeEach(async () => {
    prisma = createPrismaStub();
    gemini = new StubGemini();

    const mod = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              CHROMA_HOST: 'localhost',
              CHROMA_PORT: '18000', // unreachable port — retrieve must fall back
              CHROMA_COLLECTION: 'test_docs',
              GEMINI_API_KEY: 'fake-key-long-enough',
            }),
          ],
        }),
      ],
      providers: [
        RagService,
        QuotaService,
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: GeminiService, useValue: gemini },
      ],
    }).compile();

    rag = mod.get(RagService);
    quota = mod.get(QuotaService);
    chat = mod.get(ChatService);
  });

  // ============================================================
  // RAG splitText
  // ============================================================
  describe('RagService.splitText', () => {
    it('returns empty array for empty input', () => {
      expect(rag.splitText('')).toEqual([]);
    });

    it('short text fits in one chunk', () => {
      const chunks = rag.splitText('hello world');
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe('hello world');
    });

    it('long text splits into overlapping chunks', () => {
      const text = 'a'.repeat(RAG_CHUNK_SIZE * 3);
      const chunks = rag.splitText(text);
      expect(chunks.length).toBeGreaterThan(1);
      // All chunks must respect size boundary
      for (const c of chunks) {
        expect(c.length).toBeLessThanOrEqual(RAG_CHUNK_SIZE);
      }
    });

    it('normalizes CRLF to LF', () => {
      const chunks = rag.splitText('line1\r\nline2\r\nline3');
      expect(chunks[0]).toContain('line1\nline2');
    });
  });

  // ============================================================
  // RAG retrieve — graceful fallback
  // ============================================================
  describe('RagService.retrieve', () => {
    it('returns empty string for empty query', async () => {
      const res = await rag.retrieve('', 'lesson-1');
      expect(res).toBe('');
    });

    it('returns empty string when Gemini embed throws', async () => {
      gemini.embedResult = new Error('Gemini down');
      const res = await rag.retrieve('what is PPE?', 'lesson-1');
      expect(res).toBe('');
    });

    it('returns empty string when ChromaDB unreachable (port 18000)', async () => {
      // embed succeeds but chroma.query will time out / refuse connection
      const res = await rag.retrieve('what is PPE?', 'lesson-1');
      expect(res).toBe('');
    }, 15000);
  });

  // ============================================================
  // RAG ping + indexed doc count — both tolerate Chroma offline
  // ============================================================
  describe('RagService connectivity', () => {
    it('ping returns connected=false when Chroma unreachable', async () => {
      const res = await rag.ping();
      expect(res.connected).toBe(false);
      expect(res.error).toBeDefined();
    }, 15000);

    it('getIndexedDocCount returns 0 when Chroma offline', async () => {
      const count = await rag.getIndexedDocCount();
      expect(count).toBe(0);
    }, 15000);
  });

  // ============================================================
  // QUOTA
  // ============================================================
  describe('QuotaService', () => {
    it('checkAndIncrement upserts with composite key (date, model)', async () => {
      prisma.client.aiQuotaLog.upsert.mockResolvedValue({
        requests: 5,
        tokens: 100,
      });

      const res = await quota.checkAndIncrement('chat', 50);
      expect(res.requests).toBe(5);
      expect(res.tokens).toBe(100);
      const call = prisma.client.aiQuotaLog.upsert.mock.calls[0][0];
      expect(call.where.date_model.model).toBe('chat');
      expect(call.update.requests).toEqual({ increment: 1 });
      expect(call.update.tokens).toEqual({ increment: 50 });
    });

    it('hasQuotaFor returns true below hard cap', async () => {
      prisma.client.aiQuotaLog.findUnique.mockResolvedValue({
        requests: AI_DAILY_HARD_CAP_DISPLAY - 1,
      });
      expect(await quota.hasQuotaFor('chat')).toBe(true);
    });

    it('hasQuotaFor returns false at hard cap', async () => {
      prisma.client.aiQuotaLog.findUnique.mockResolvedValue({
        requests: AI_DAILY_HARD_CAP_DISPLAY,
      });
      expect(await quota.hasQuotaFor('chat')).toBe(false);
    });

    it('hasQuotaFor returns true when row missing (first call of day)', async () => {
      prisma.client.aiQuotaLog.findUnique.mockResolvedValue(null);
      expect(await quota.hasQuotaFor('embedding')).toBe(true);
    });

    it('getTodaySnapshot fills all three buckets even when some are empty', async () => {
      prisma.client.aiQuotaLog.findMany.mockResolvedValue([
        { model: 'chat', requests: 10, tokens: 200 },
      ]);
      const snap = await quota.getTodaySnapshot();
      expect(snap).toHaveLength(3);
      const chat = snap.find((s) => s.model === 'chat')!;
      const embedding = snap.find((s) => s.model === 'embedding')!;
      expect(chat.requests).toBe(10);
      expect(embedding.requests).toBe(0);
    });
  });

  // ============================================================
  // CHAT — SSE + ai_disabled path
  // ============================================================
  describe('ChatService.streamReply', () => {
    function fakeRes() {
      const writes: string[] = [];
      const res = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: (chunk: string) => {
          writes.push(chunk);
          return true;
        },
        end: jest.fn(),
      };
      return { res, writes };
    }

    it('emits ai_disabled + ends when Gemini not configured', async () => {
      gemini.configured = false;
      const { res, writes } = fakeRes();
      await chat.streamReply(
        { message: 'hi', lessonId: null as unknown as string },
        res as never,
        'stu-1',
      );
      const payload = writes.map((w) => w.trim()).join('\n');
      expect(payload).toContain('"error":"ai_disabled"');
      expect(res.end).toHaveBeenCalled();
    });

    it('increments quota before streaming (when configured)', async () => {
      prisma.client.user.findUnique.mockResolvedValue({
        id: 'stu-1',
        name: 'Alice',
        role: 'STUDENT',
      });
      prisma.client.aiChatMessage.create.mockResolvedValue({ id: 'msg-1' });
      prisma.client.aiQuotaLog.upsert.mockResolvedValue({ requests: 1, tokens: 0 });

      const { res } = fakeRes();
      await chat.streamReply({ message: 'hi' } as never, res as never, 'stu-1');
      expect(prisma.client.aiQuotaLog.upsert).toHaveBeenCalled();
    });
  });
});
