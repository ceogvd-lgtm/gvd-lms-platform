import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';

import { PrismaService } from '../../common/prisma/prisma.service';

import { AI_RECOMMENDATION_TYPES, GEMINI_DEFAULT_CHAT_MODEL } from './ai.constants';
import { ChatService } from './chat.service';
import { GeminiService } from './gemini.service';
import { QuestionSuggestService } from './question-suggest.service';
import { QuotaService } from './quota.service';
import { RagService } from './rag.service';
import { RecommendationsService } from './recommendations.service';
import { WeeklyReportService } from './weekly-report.service';

/**
 * Phase 17 — behavioural tests for the Gemini-backed services.
 *
 * We inject a fake Gemini that lets each test control what the SDK
 * appears to return (stream, text, or throw). The real @google/generative-ai
 * is never called — that path is covered by an e2e harness, not this spec.
 */

// ---------- Helpers ----------
function fakeStreamResult(chunks: string[], throwAt?: { status?: number }) {
  return {
    stream: (async function* () {
      if (throwAt) {
        const err: Error & { status?: number } = new Error('boom');
        err.status = throwAt.status;
        throw err;
      }
      for (const c of chunks) yield { text: () => c };
    })(),
  };
}

function buildGeminiMock(
  overrides: Partial<{
    configured: boolean;
    chatStreamChunks: string[];
    chatThrow: { status?: number } | null;
    liteText: string;
    liteThrow: boolean;
  }> = {},
) {
  const cfg = {
    configured: overrides.configured ?? true,
    chatStreamChunks: overrides.chatStreamChunks ?? ['Xin chào ', 'học viên!'],
    chatThrow: overrides.chatThrow ?? null,
    liteText: overrides.liteText ?? '["Ôn lại bài 1", "Luyện tập thêm"]',
    liteThrow: overrides.liteThrow ?? false,
  };
  return {
    isConfigured: () => cfg.configured,
    getChatModel: () => ({
      startChat: () => ({
        sendMessageStream: async () =>
          fakeStreamResult(cfg.chatStreamChunks, cfg.chatThrow ?? undefined),
      }),
    }),
    getLiteModel: () => ({
      generateContent: async () => {
        if (cfg.liteThrow) throw new Error('lite boom');
        return { response: { text: () => cfg.liteText } };
      },
    }),
    getEmbeddingModel: () => ({ embedContent: async () => ({ embedding: { values: [0, 0, 0] } }) }),
    getModelIds: () => ({
      chat: GEMINI_DEFAULT_CHAT_MODEL,
      lite: 'lite',
      embedding: 'embedding',
    }),
    embed: async () => [0, 0, 0],
  };
}

function fakeResponse(): Response & { _chunks: string[]; _ended: boolean } {
  const chunks: string[] = [];
  let ended = false;
  return {
    _chunks: chunks,
    get _ended() {
      return ended;
    },
    setHeader: () => undefined,
    flushHeaders: () => undefined,
    write: (s: string) => {
      chunks.push(s);
      return true;
    },
    end: () => {
      ended = true;
      return {} as never;
    },
  } as unknown as Response & { _chunks: string[]; _ended: boolean };
}

// =====================================================
// ChatService
// =====================================================
describe('ChatService', () => {
  let service: ChatService;
  let prismaMock: any;
  let geminiMock: ReturnType<typeof buildGeminiMock>;
  let ragMock: { retrieve: jest.Mock };
  let quotaMock: { checkAndIncrement: jest.Mock };

  const makeModule = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: GeminiService, useValue: geminiMock },
        { provide: RagService, useValue: ragMock },
        { provide: QuotaService, useValue: quotaMock },
      ],
    }).compile();
    service = module.get(ChatService);
  };

  beforeEach(() => {
    prismaMock = {
      client: {
        user: {
          findUnique: jest.fn().mockResolvedValue({ id: 's1', name: 'Nam', role: 'STUDENT' }),
        },
        lesson: {
          findUnique: jest.fn().mockResolvedValue({ id: 'l1', title: 'An toàn', type: 'THEORY' }),
        },
        lessonProgress: { findUnique: jest.fn().mockResolvedValue(null) },
        aiChatMessage: {
          create: jest.fn().mockResolvedValue({ id: 'msg-id' }),
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      },
    };
    ragMock = { retrieve: jest.fn().mockResolvedValue('') };
    quotaMock = { checkAndIncrement: jest.fn().mockResolvedValue({ requests: 1, tokens: 0 }) };
    geminiMock = buildGeminiMock();
  });

  it('streams text chunks from the model and ends with [DONE]', async () => {
    await makeModule();
    const res = fakeResponse();
    await service.streamReply({ message: 'hi', lessonId: 'l1' }, res, 's1');

    const body = res._chunks.join('');
    expect(body).toContain('Xin chào ');
    expect(body).toContain('học viên!');
    expect(body).toContain('[DONE]');
    expect(res._ended).toBe(true);
    // Quota was incremented for the chat bucket.
    expect(quotaMock.checkAndIncrement).toHaveBeenCalledWith('chat');
    // Both turns persisted.
    expect(prismaMock.client.aiChatMessage.create).toHaveBeenCalledTimes(2);
  });

  it('translates 429 errors into a {error:"quota_exceeded"} frame instead of throwing', async () => {
    geminiMock = buildGeminiMock({ chatThrow: { status: 429 } });
    await makeModule();
    const res = fakeResponse();

    await expect(service.streamReply({ message: 'hi' }, res, 's1')).resolves.toBeUndefined();

    const body = res._chunks.join('');
    expect(body).toContain('quota_exceeded');
    expect(res._ended).toBe(true);
  });

  it('emits {error:"ai_disabled"} when no API key is configured', async () => {
    geminiMock = buildGeminiMock({ configured: false });
    await makeModule();
    const res = fakeResponse();

    await service.streamReply({ message: 'hi' }, res, 's1');

    const body = res._chunks.join('');
    expect(body).toContain('ai_disabled');
    expect(res._ended).toBe(true);
  });

  it('rateMessage enforces that the message belongs to the calling student', async () => {
    await makeModule();
    prismaMock.client.aiChatMessage.findUnique.mockResolvedValue({ id: 'm1', studentId: 'other' });

    await expect(service.rateMessage('m1', 's1', 1)).rejects.toThrow();
  });

  it('rateMessage updates the rating column when ownership matches', async () => {
    await makeModule();
    prismaMock.client.aiChatMessage.findUnique.mockResolvedValue({ id: 'm1', studentId: 's1' });
    prismaMock.client.aiChatMessage.update.mockResolvedValue({ id: 'm1', rating: -1 });

    const result = await service.rateMessage('m1', 's1', -1);

    expect(result).toEqual({ id: 'm1', rating: -1 });
    expect(prismaMock.client.aiChatMessage.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { rating: -1 },
      select: { id: true, rating: true },
    });
  });
});

// =====================================================
// RecommendationsService
// =====================================================
describe('RecommendationsService', () => {
  let service: RecommendationsService;
  let prismaMock: any;
  let geminiMock: ReturnType<typeof buildGeminiMock>;
  let quotaMock: { checkAndIncrement: jest.Mock };

  const buildStatsSpyTarget = () => {
    prismaMock.client.lessonProgress.findMany.mockResolvedValue([
      {
        lessonId: 'l1',
        score: 30,
        lesson: { id: 'l1', title: 'Bài 1', chapter: { title: 'Cơ bản' } },
      },
    ]);
    prismaMock.client.practiceAttempt.count.mockResolvedValue(2);
    prismaMock.client.courseEnrollment.findFirst.mockResolvedValue({
      lastActiveAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });
    prismaMock.client.courseEnrollment.findMany.mockResolvedValue([{ studentId: 's1' }]);
  };

  const makeModule = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: GeminiService, useValue: geminiMock },
        { provide: QuotaService, useValue: quotaMock },
      ],
    }).compile();
    service = module.get(RecommendationsService);
  };

  beforeEach(() => {
    prismaMock = {
      client: {
        lessonProgress: { findMany: jest.fn() },
        practiceAttempt: { count: jest.fn() },
        courseEnrollment: { findFirst: jest.fn(), findMany: jest.fn() },
        aiRecommendation: {
          createMany: jest.fn().mockResolvedValue({ count: 0 }),
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      },
    };
    quotaMock = { checkAndIncrement: jest.fn().mockResolvedValue({ requests: 1, tokens: 0 }) };
    geminiMock = buildGeminiMock();
  });

  it('parses a JSON array response and inserts recommendations', async () => {
    buildStatsSpyTarget();
    prismaMock.client.aiRecommendation.createMany.mockResolvedValue({ count: 2 });
    await makeModule();

    const n = await service.generateForStudent('s1');

    expect(n).toBe(2);
    expect(prismaMock.client.aiRecommendation.createMany).toHaveBeenCalledTimes(1);
    const args = prismaMock.client.aiRecommendation.createMany.mock.calls[0]![0];
    expect(args.data).toHaveLength(2);
    expect(args.data[0].studentId).toBe('s1');
  });

  it('does not throw and returns 0 when the model returns unparseable text', async () => {
    buildStatsSpyTarget();
    geminiMock = buildGeminiMock({ liteText: 'not json at all' });
    await makeModule();

    const n = await service.generateForStudent('s1');
    expect(n).toBe(0);
    expect(prismaMock.client.aiRecommendation.createMany).not.toHaveBeenCalled();
  });

  it('does not throw when Gemini itself throws — returns 0', async () => {
    buildStatsSpyTarget();
    geminiMock = buildGeminiMock({ liteThrow: true });
    await makeModule();

    const n = await service.generateForStudent('s1');
    expect(n).toBe(0);
  });

  it('classifies safety-keyword recommendations as SAFETY_REMINDER', async () => {
    buildStatsSpyTarget();
    geminiMock = buildGeminiMock({
      liteText: '["Nhớ đeo PPE khi thực hành", "Ôn lại bài 1"]',
    });
    prismaMock.client.aiRecommendation.createMany.mockResolvedValue({ count: 2 });
    await makeModule();

    await service.generateForStudent('s1');
    const rows = prismaMock.client.aiRecommendation.createMany.mock.calls[0]![0].data;
    expect(rows[0].type).toBe(AI_RECOMMENDATION_TYPES.SAFETY_REMINDER);
    expect(rows[1].type).toBe(AI_RECOMMENDATION_TYPES.REVIEW_LESSON);
  });
});

// =====================================================
// WeeklyReportService
// =====================================================
describe('WeeklyReportService', () => {
  let service: WeeklyReportService;
  let prismaMock: any;
  let geminiMock: ReturnType<typeof buildGeminiMock>;
  let quotaMock: { checkAndIncrement: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      client: {
        lessonProgress: { count: jest.fn(), aggregate: jest.fn() },
        quizAttempt: { aggregate: jest.fn() },
        practiceAttempt: { count: jest.fn() },
      },
    };
    quotaMock = { checkAndIncrement: jest.fn().mockResolvedValue({ requests: 1, tokens: 0 }) };
    geminiMock = buildGeminiMock({ liteText: 'Tuần qua bạn học rất chăm chỉ!' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyReportService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: GeminiService, useValue: geminiMock },
        { provide: QuotaService, useValue: quotaMock },
      ],
    }).compile();
    service = module.get(WeeklyReportService);
  });

  it('returns a deterministic fallback sentence when Gemini is misconfigured', async () => {
    geminiMock = buildGeminiMock({ configured: false });
    // Re-inject with misconfigured mock.
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyReportService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: GeminiService, useValue: geminiMock },
        { provide: QuotaService, useValue: quotaMock },
      ],
    }).compile();
    service = module.get(WeeklyReportService);

    const text = await service.generateNarrative({
      completedLessons: 5,
      avgScorePercent: 80,
      totalMinutes: 120,
      safetyViolations: 0,
    });
    expect(text).toContain('5 bài học');
    expect(text).toContain('80%');
  });

  it('returns the Gemini narrative on success', async () => {
    const text = await service.generateNarrative({
      completedLessons: 3,
      avgScorePercent: 60,
      totalMinutes: 90,
      safetyViolations: 1,
    });
    expect(text).toBe('Tuần qua bạn học rất chăm chỉ!');
  });

  it('falls back cleanly when Gemini throws', async () => {
    geminiMock = buildGeminiMock({ liteThrow: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyReportService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: GeminiService, useValue: geminiMock },
        { provide: QuotaService, useValue: quotaMock },
      ],
    }).compile();
    service = module.get(WeeklyReportService);

    const text = await service.generateNarrative({
      completedLessons: 2,
      avgScorePercent: 40,
      totalMinutes: 30,
      safetyViolations: 0,
    });
    expect(text).toContain('2 bài học');
    expect(text).toContain('40%');
  });
});

// =====================================================
// QuestionSuggestService — cache behaviour
// =====================================================
describe('QuestionSuggestService', () => {
  let service: QuestionSuggestService;
  let prismaMock: any;
  let geminiMock: ReturnType<typeof buildGeminiMock>;
  let quotaMock: { checkAndIncrement: jest.Mock };

  const makeModule = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionSuggestService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: GeminiService, useValue: geminiMock },
        { provide: QuotaService, useValue: quotaMock },
      ],
    }).compile();
    service = module.get(QuestionSuggestService);
  };

  beforeEach(() => {
    prismaMock = {
      client: {
        aiSuggestedQuestions: {
          findUnique: jest.fn(),
          upsert: jest.fn(),
          delete: jest.fn().mockResolvedValue(undefined),
        },
        lesson: { findUnique: jest.fn() },
      },
    };
    quotaMock = { checkAndIncrement: jest.fn().mockResolvedValue({ requests: 1, tokens: 0 }) };
    geminiMock = buildGeminiMock({ liteText: '["Câu 1?", "Câu 2?"]' });
  });

  it('returns cached suggestions without calling Gemini when the row is fresh', async () => {
    prismaMock.client.aiSuggestedQuestions.findUnique.mockResolvedValue({
      lessonId: 'l1',
      questions: ['A?', 'B?'],
      updatedAt: new Date(), // now
    });
    await makeModule();
    // Make Gemini throw so this test would fail if it were called.
    jest.spyOn(geminiMock, 'getLiteModel').mockImplementation(() => {
      throw new Error('should not be called');
    });

    const qs = await service.getSuggestions('l1');

    expect(qs).toEqual(['A?', 'B?']);
    expect(prismaMock.client.aiSuggestedQuestions.upsert).not.toHaveBeenCalled();
  });

  it('regenerates when the cache row is older than 24h', async () => {
    prismaMock.client.aiSuggestedQuestions.findUnique.mockResolvedValue({
      lessonId: 'l1',
      questions: ['old1?'],
      updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    prismaMock.client.lesson.findUnique.mockResolvedValue({
      id: 'l1',
      title: 'Lesson 1',
      theoryContent: { overview: 'Nội dung bài học' },
    });
    await makeModule();

    const qs = await service.getSuggestions('l1');

    expect(qs).toEqual(['Câu 1?', 'Câu 2?']);
    expect(prismaMock.client.aiSuggestedQuestions.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns [] when JSON parsing fails and there is no prior cache', async () => {
    prismaMock.client.aiSuggestedQuestions.findUnique.mockResolvedValue(null);
    prismaMock.client.lesson.findUnique.mockResolvedValue({
      id: 'l1',
      title: 'Lesson 1',
      theoryContent: { overview: 'body' },
    });
    geminiMock = buildGeminiMock({ liteText: 'totally not json' });
    await makeModule();

    const qs = await service.getSuggestions('l1');
    expect(qs).toEqual([]);
    expect(prismaMock.client.aiSuggestedQuestions.upsert).not.toHaveBeenCalled();
  });
});
