/**
 * Embedding wrapper using the OpenAI-compatible `/v1/embeddings` API.
 *
 * Works with LM Studio, Ollama (OpenAI compat mode), vLLM, or any server
 * implementing the OpenAI embeddings API. Uses native fetch — no additional
 * npm dependencies.
 *
 * When using LM Studio, automatically loads the embedding model if it's
 * not already loaded (via the LM Studio REST API).
 *
 * Falls back gracefully: returns null when the embedding server is unreachable,
 * allowing the knowledge store to use BM25-only search.
 */

import type { EmbeddingConfig } from './types.js';

interface EmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

interface ModelsResponse {
  data: Array<{ id: string }>;
}

let modelEnsured = false;

/**
 * Get embedding configuration from environment variables.
 *
 * @returns Embedding API URL and model name
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  return {
    apiUrl: process.env.EMBEDDING_API_URL || 'http://localhost:1234/v1',
    model: process.env.EMBEDDING_MODEL || 'text-embedding-nomic-embed-text-v1.5@q8_0',
  };
}

/**
 * Derive the LM Studio REST API base URL from the OpenAI-compat URL.
 * Strips trailing `/v1` to get `http://host:port`.
 */
function getBaseUrl(apiUrl: string): string {
  return apiUrl.replace(/\/v1\/?$/, '');
}

/**
 * Ensure the embedding model is loaded in LM Studio.
 *
 * Checks GET /v1/models for the model. If not found, attempts to load it
 * via POST /api/v1/models/load (LM Studio REST API). Skips silently if
 * the server isn't LM Studio or the endpoints aren't available.
 *
 * @param apiUrl - The OpenAI-compat base URL (e.g., http://localhost:1234/v1)
 * @param model - The model identifier to ensure is loaded
 */
async function ensureModelLoaded(apiUrl: string, model: string): Promise<void> {
  if (modelEnsured) return;

  try {
    // Check if model is already loaded via OpenAI-compat endpoint
    const listResponse = await fetch(`${apiUrl}/models`);
    if (!listResponse.ok) return;

    const models = (await listResponse.json()) as ModelsResponse;
    const isLoaded = models.data.some((m) => m.id === model || m.id.includes(model));

    if (isLoaded) {
      modelEnsured = true;
      return;
    }

    // Model not loaded — attempt to load via LM Studio REST API
    console.error(`Embedding model "${model}" not loaded. Attempting to load via LM Studio API...`);
    const baseUrl = getBaseUrl(apiUrl);
    const loadResponse = await fetch(`${baseUrl}/api/v1/models/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });

    if (loadResponse.ok) {
      console.error(`Embedding model "${model}" loaded successfully.`);
      modelEnsured = true;
    } else {
      const errorText = await loadResponse.text().catch(() => 'unknown error');
      console.error(`Failed to load model "${model}": ${loadResponse.status} ${errorText}`);
    }
  } catch {
    // Reason: Server might not be LM Studio, or /api/v1 endpoints not available — skip silently
  }
}

/**
 * Generate embeddings for multiple texts using the OpenAI-compatible API.
 *
 * @param texts - Array of strings to embed
 * @param config - Optional config override (defaults to env vars)
 * @returns Array of embedding vectors, or null if the server is unreachable
 */
export async function embedTexts(texts: string[], config?: EmbeddingConfig): Promise<number[][] | null> {
  const { apiUrl, model } = config || getEmbeddingConfig();

  try {
    await ensureModelLoaded(apiUrl, model);

    const response = await fetch(`${apiUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
    });

    if (!response.ok) {
      console.error(`Embedding API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as EmbeddingResponse;
    return data.data.map((item) => item.embedding);
  } catch (err) {
    // Reason: Connection refused, timeout, or other network error — fall back to BM25
    console.error(`Embedding server unreachable at ${apiUrl}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Generate an embedding for a single query string.
 *
 * @param query - The text to embed
 * @param config - Optional config override
 * @returns Embedding vector, or null if the server is unreachable
 */
export async function embedQuery(query: string, config?: EmbeddingConfig): Promise<number[] | null> {
  const result = await embedTexts([query], config);
  return result ? result[0] : null;
}

/**
 * Reset the model-ensured flag (for testing).
 */
export function resetModelEnsured(): void {
  modelEnsured = false;
}
