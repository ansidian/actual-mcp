import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { embedTexts, embedQuery, getEmbeddingConfig, resetModelEnsured } from './embedder.js';
import type { EmbeddingConfig } from './types.js';

const testConfig: EmbeddingConfig = {
  apiUrl: 'http://localhost:9999/v1',
  model: 'test-model',
};

/**
 * Create a mock fetch that handles /models (model already loaded) then /embeddings.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function mockFetchWithModelLoaded(embeddings: number[][]) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.endsWith('/models')) {
      return {
        ok: true,
        json: async () => ({ data: [{ id: 'test-model' }] }),
      } as Response;
    }
    return {
      ok: true,
      json: async () => ({
        data: embeddings.map((embedding) => ({ embedding })),
      }),
    } as Response;
  });
}

describe('getEmbeddingConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return defaults when env vars are not set', () => {
    delete process.env.EMBEDDING_API_URL;
    delete process.env.EMBEDDING_MODEL;

    const config = getEmbeddingConfig();

    expect(config.apiUrl).toBe('http://localhost:1234/v1');
    expect(config.model).toBe('text-embedding-nomic-embed-text-v1.5@q8_0');
  });

  it('should use env vars when set', () => {
    process.env.EMBEDDING_API_URL = 'http://custom:5000/v1';
    process.env.EMBEDDING_MODEL = 'custom-model';

    const config = getEmbeddingConfig();

    expect(config.apiUrl).toBe('http://custom:5000/v1');
    expect(config.model).toBe('custom-model');
  });
});

describe('embedTexts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetModelEnsured();
  });

  it('should return embeddings on success', async () => {
    const mockEmbeddings = [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ];
    mockFetchWithModelLoaded(mockEmbeddings);

    const result = await embedTexts(['hello', 'world'], testConfig);

    expect(result).toEqual(mockEmbeddings);
  });

  it('should return null when server returns an error status', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    const result = await embedTexts(['hello'], testConfig);

    expect(result).toBeNull();
  });

  it('should return null when server is unreachable', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await embedTexts(['hello'], testConfig);

    expect(result).toBeNull();
  });
});

describe('embedQuery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetModelEnsured();
  });

  it('should return a single embedding vector', async () => {
    const mockEmbedding = [0.1, 0.2, 0.3];
    mockFetchWithModelLoaded([mockEmbedding]);

    const result = await embedQuery('test query', testConfig);

    expect(result).toEqual(mockEmbedding);
  });

  it('should return null when server is unreachable', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await embedQuery('test query', testConfig);

    expect(result).toBeNull();
  });
});

describe('ensureModelLoaded (via embedTexts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetModelEnsured();
  });

  it('should attempt to load model when not found in /models list', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.endsWith('/models')) {
        return { ok: true, json: async () => ({ data: [] }) } as Response;
      }
      if (urlStr.includes('/api/v1/models/load')) {
        return { ok: true, json: async () => ({ status: 'loaded' }) } as Response;
      }
      // /embeddings call
      return {
        ok: true,
        json: async () => ({ data: [{ embedding: [0.1] }] }),
      } as Response;
    });

    await embedTexts(['test'], testConfig);

    const calls = fetchSpy.mock.calls.map((c) => (typeof c[0] === 'string' ? c[0] : c[0].toString()));
    expect(calls).toContain('http://localhost:9999/v1/models');
    expect(calls).toContain('http://localhost:9999/api/v1/models/load');
  });

  it('should skip load attempt when model is already loaded', async () => {
    const fetchSpy = mockFetchWithModelLoaded([[0.1]]);

    await embedTexts(['test'], testConfig);

    const calls = fetchSpy.mock.calls.map((c) => (typeof c[0] === 'string' ? c[0] : c[0].toString()));
    expect(calls).toContain('http://localhost:9999/v1/models');
    expect(calls).not.toContain('http://localhost:9999/api/v1/models/load');
  });

  it('should only check /models once per session (caches result)', async () => {
    const fetchSpy = mockFetchWithModelLoaded([[0.1]]);

    await embedTexts(['first'], testConfig);
    await embedTexts(['second'], testConfig);

    const modelsCalls = fetchSpy.mock.calls.filter((c) => {
      const url = typeof c[0] === 'string' ? c[0] : c[0].toString();
      return url.endsWith('/models');
    });
    expect(modelsCalls).toHaveLength(1);
  });
});
