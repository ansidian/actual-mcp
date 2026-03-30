import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { embedTexts, embedQuery, getEmbeddingConfig } from './embedder.js';
import type { EmbeddingConfig } from './types.js';

const testConfig: EmbeddingConfig = {
  apiUrl: 'http://localhost:9999/v1',
  model: 'test-model',
  apiKey: 'test-key',
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function mockFetchSuccess(embeddings: number[][]) {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      data: embeddings.map((embedding) => ({ embedding })),
    }),
  } as Response);
}

describe('getEmbeddingConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return OpenAI defaults when env vars are not set', () => {
    delete process.env.EMBEDDING_API_URL;
    delete process.env.EMBEDDING_MODEL;
    delete process.env.OPENAI_API_KEY;

    const config = getEmbeddingConfig();

    expect(config.apiUrl).toBe('https://api.openai.com/v1');
    expect(config.model).toBe('text-embedding-3-small');
    expect(config.apiKey).toBe('');
  });

  it('should use env vars when set', () => {
    process.env.EMBEDDING_API_URL = 'http://custom:5000/v1';
    process.env.EMBEDDING_MODEL = 'custom-model';
    process.env.OPENAI_API_KEY = 'sk-test123';

    const config = getEmbeddingConfig();

    expect(config.apiUrl).toBe('http://custom:5000/v1');
    expect(config.model).toBe('custom-model');
    expect(config.apiKey).toBe('sk-test123');
  });
});

describe('embedTexts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return embeddings on success', async () => {
    const mockEmbeddings = [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ];
    mockFetchSuccess(mockEmbeddings);

    const result = await embedTexts(['hello', 'world'], testConfig);

    expect(result).toEqual(mockEmbeddings);
  });

  it('should send Authorization header with API key', async () => {
    const fetchSpy = mockFetchSuccess([[0.1]]);

    await embedTexts(['test'], testConfig);

    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:9999/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-key',
      },
      body: JSON.stringify({ model: 'test-model', input: ['test'] }),
    });
  });

  it('should return null when API key is empty', async () => {
    const result = await embedTexts(['hello'], { ...testConfig, apiKey: '' });

    expect(result).toBeNull();
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
  });

  it('should return a single embedding vector', async () => {
    const mockEmbedding = [0.1, 0.2, 0.3];
    mockFetchSuccess([mockEmbedding]);

    const result = await embedQuery('test query', testConfig);

    expect(result).toEqual(mockEmbedding);
  });

  it('should return null when server is unreachable', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await embedQuery('test query', testConfig);

    expect(result).toBeNull();
  });

  it('should return null when API key is missing', async () => {
    const result = await embedQuery('test query', { ...testConfig, apiKey: '' });

    expect(result).toBeNull();
  });
});
