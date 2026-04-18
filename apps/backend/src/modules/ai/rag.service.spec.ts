import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { GeminiService } from './gemini.service';
import { QuotaService } from './quota.service';
import { RagService } from './rag.service';

describe('RagService', () => {
  let service: RagService;
  let geminiMock: { embed: jest.Mock };
  let quotaMock: { checkAndIncrement: jest.Mock };
  let configMock: { get: jest.Mock };

  beforeEach(async () => {
    geminiMock = { embed: jest.fn() };
    quotaMock = { checkAndIncrement: jest.fn().mockResolvedValue({ requests: 1, tokens: 0 }) };
    // Point Chroma at a host/port that's guaranteed to fail so the
    // "graceful fallback" tests stay robust even when a real Chroma
    // container is listening on localhost:8000 during dev.
    configMock = {
      get: jest.fn((k: string) => {
        if (k === 'CHROMA_COLLECTION') return 'test_col';
        if (k === 'CHROMA_HOST') return '127.0.0.1';
        if (k === 'CHROMA_PORT') return '1'; // port 1 is never open
        return undefined;
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        { provide: ConfigService, useValue: configMock },
        { provide: GeminiService, useValue: geminiMock },
        { provide: QuotaService, useValue: quotaMock },
      ],
    }).compile();
    service = module.get(RagService);
  });

  describe('splitText', () => {
    it('chunks a long string into overlapping windows of the given size', () => {
      const text = 'a'.repeat(2500);
      const chunks = service.splitText(text, 1000, 200);
      // advance = 1000 - 200 = 800. Windows: [0..1000), [800..1800),
      // [1600..2500) → 3 chunks, last one 900 chars.
      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toHaveLength(1000);
      expect(chunks[1]).toHaveLength(1000);
      expect(chunks[2]).toHaveLength(900); // tail
    });

    it('respects the configured chunk size on every full window', () => {
      const chunks = service.splitText('b'.repeat(1500), 1000, 200);
      expect(chunks[0]).toHaveLength(1000);
    });

    it('returns a single chunk for input shorter than the window', () => {
      expect(service.splitText('hello', 1000, 200)).toEqual(['hello']);
    });

    it('returns an empty array for empty text', () => {
      expect(service.splitText('', 1000, 200)).toEqual([]);
    });

    it('honours a smaller custom chunk size', () => {
      const chunks = service.splitText('a'.repeat(250), 100, 20);
      // advance = 100 - 20 = 80. Windows: [0..100), [80..180), [160..250)
      // → 3 chunks, last one 90 chars.
      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toHaveLength(100);
      expect(chunks[2]).toHaveLength(90);
    });
  });

  describe('retrieve', () => {
    it('returns an empty string for a blank query without hitting ChromaDB', async () => {
      const result = await service.retrieve('   ', 'lesson-1');
      expect(result).toBe('');
      expect(geminiMock.embed).not.toHaveBeenCalled();
    });

    it('returns "" when ChromaDB is unreachable (graceful fallback)', async () => {
      geminiMock.embed.mockResolvedValue([0.1, 0.2, 0.3]);
      // getCollection will hit the lazy ChromaClient and throw because
      // localhost:8000 isn't running in the test env — the service must
      // swallow that error.
      const result = await service.retrieve('how do I use PPE?', 'lesson-1');
      expect(result).toBe('');
    });

    it('returns "" when the embed call itself fails', async () => {
      geminiMock.embed.mockRejectedValue(new Error('embed failed'));
      const result = await service.retrieve('question', 'lesson-1');
      expect(result).toBe('');
    });
  });

  describe('ping', () => {
    it('reports connected:false with an error message when Chroma is down', async () => {
      const res = await service.ping();
      expect(res.connected).toBe(false);
      expect(typeof res.error).toBe('string');
      expect(res.collection).toBe('test_col');
    });
  });

  describe('getIndexedDocCount', () => {
    it('returns 0 when Chroma is unreachable', async () => {
      const n = await service.getIndexedDocCount();
      expect(n).toBe(0);
    });
  });
});
