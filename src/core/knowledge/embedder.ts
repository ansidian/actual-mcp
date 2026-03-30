/**
 * Embedding wrapper using the OpenAI embeddings API.
 *
 * Defaults to OpenAI's text-embedding-3-small model. Also works with any
 * OpenAI-compatible server (LM Studio, Ollama, vLLM) by setting
 * EMBEDDING_API_URL and EMBEDDING_MODEL env vars.
 *
 * Falls back gracefully: returns null when the API key is missing or the
 * server is unreachable, allowing the knowledge store to use BM25-only search.
 */

import type { EmbeddingConfig } from './types.js';

interface EmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

/**
 * Get embedding configuration from environment variables.
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  return {
    apiUrl: process.env.EMBEDDING_API_URL || 'https://api.openai.com/v1',
    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    apiKey: process.env.OPENAI_API_KEY || '',
  };
}

/**
 * Generate embeddings for multiple texts using the OpenAI embeddings API.
 *
 * @param texts - Array of strings to embed
 * @param config - Optional config override (defaults to env vars)
 * @returns Array of embedding vectors, or null if the API is unavailable
 */
export async function embedTexts(texts: string[], config?: EmbeddingConfig): Promise<number[][] | null> {
  const { apiUrl, model, apiKey } = config || getEmbeddingConfig();

  if (!apiKey) {
    return null;
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    const response = await fetch(`${apiUrl}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input: texts }),
    });

    if (!response.ok) {
      console.error(`Embedding API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as EmbeddingResponse;
    return data.data.map((item) => item.embedding);
  } catch (err) {
    console.error(`Embedding server unreachable at ${apiUrl}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Generate an embedding for a single query string.
 *
 * @param query - The text to embed
 * @param config - Optional config override
 * @returns Embedding vector, or null if the API is unavailable
 */
export async function embedQuery(query: string, config?: EmbeddingConfig): Promise<number[] | null> {
  const result = await embedTexts([query], config);
  return result ? result[0] : null;
}
