/**
 * Knowledge store using Orama for hybrid BM25 + vector search.
 *
 * Singleton with lazy initialization. Indexes guide content on first use
 * (permanent) and transaction-derived chunks on demand (TTL-cached).
 * Falls back to BM25-only search when the embedding server is unavailable.
 */

import { create, insertMultiple, search } from '@orama/orama';
import type { Orama, Results } from '@orama/orama';
import { GUIDE_CONTENT, GUIDE_RESOURCES } from '../../resources.js';
import { chunkGuides } from './chunker.js';
import { embedTexts, embedQuery } from './embedder.js';
import type { KnowledgeChunk, SearchResult } from './types.js';
import type { Transaction, Category, CategoryGroup, Account } from '../types/domain.js';
import { chunkTransactions } from './transaction-chunker.js';

const VECTOR_SIZE = 768;
const TRANSACTION_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface OramaDoc {
  text: string;
  source: string;
  guideUri: string;
  guideName: string;
  sectionHeading: string;
  chunkIndex: number;
  embedding: number[];
}

const oramaSchema = {
  text: 'string' as const,
  source: 'string' as const,
  guideUri: 'string' as const,
  guideName: 'string' as const,
  sectionHeading: 'string' as const,
  chunkIndex: 'number' as const,
  embedding: `vector[${VECTOR_SIZE}]` as const,
};

// ── State ──────────────────────────────────────────────────────────

let db: Orama<typeof oramaSchema> | null = null;
let vectorsAvailable = false;
let initialized = false;
let initializing = false;

// Guide data (permanent — never re-fetched)
let guideChunks: KnowledgeChunk[] = [];
let guideEmbeddings: number[][] | null = null;

// Transaction data (TTL-cached)
let txChunks: KnowledgeChunk[] = [];
let txEmbeddings: number[][] | null = null;
let txTimestamp: number | null = null;

// ── TTL helpers ────────────────────────────────────────────────────

/**
 * Check if the transaction chunk cache is stale.
 */
export function isTransactionCacheStale(): boolean {
  if (!txTimestamp) return true;
  return Date.now() - txTimestamp > TRANSACTION_TTL_MS;
}

// ── Index building ─────────────────────────────────────────────────

/**
 * Build (or rebuild) the Orama index from guide + transaction chunks.
 */
function rebuildIndex(): void {
  const allChunks = [...guideChunks, ...txChunks];
  const allEmbeddings: (number[] | null)[] = [
    ...(guideEmbeddings || guideChunks.map(() => null)),
    ...(txEmbeddings || txChunks.map(() => null)),
  ];

  db = create({ schema: oramaSchema });

  const docs: OramaDoc[] = allChunks.map((chunk, i) => ({
    text: chunk.text,
    source: chunk.source,
    guideUri: chunk.guideUri,
    guideName: chunk.guideName,
    sectionHeading: chunk.sectionHeading,
    chunkIndex: chunk.chunkIndex,
    embedding: allEmbeddings[i] || new Array(VECTOR_SIZE).fill(0),
  }));

  if (docs.length > 0) {
    insertMultiple(db, docs);
  }
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Initialize the knowledge store with guide content.
 * Called once on first use — guide chunks are permanent.
 */
export async function initKnowledgeStore(): Promise<void> {
  if (initialized || initializing) return;
  initializing = true;

  try {
    guideChunks = chunkGuides(GUIDE_CONTENT, GUIDE_RESOURCES);

    if (guideChunks.length === 0) {
      initialized = true;
      return;
    }

    const texts = guideChunks.map((c) => c.text);
    guideEmbeddings = await embedTexts(texts);
    vectorsAvailable = guideEmbeddings !== null;

    rebuildIndex();
    initialized = true;
  } finally {
    initializing = false;
  }
}

/**
 * Refresh transaction-derived chunks in the knowledge store.
 * Always rebuilds — embedding is near-instant on modern GPUs.
 * Guide chunks are preserved (permanent).
 *
 * @param transactions - Enriched transactions
 * @param categories - All budget categories
 * @param categoryGroups - All category groups
 * @param accounts - All accounts
 */
export async function refreshTransactionChunks(
  transactions: Transaction[],
  categories: Category[],
  categoryGroups: CategoryGroup[],
  accounts: Account[]
): Promise<void> {
  // Ensure guide chunks are initialized first
  if (!initialized) {
    await initKnowledgeStore();
  }

  txChunks = chunkTransactions(transactions, categories, categoryGroups, accounts);

  if (txChunks.length > 0) {
    const texts = txChunks.map((c) => c.text);
    txEmbeddings = await embedTexts(texts);

    // Reason: If transaction embeddings succeed but guide embeddings didn't, enable vectors now
    if (txEmbeddings && !vectorsAvailable) {
      vectorsAvailable = true;
    }
  } else {
    txEmbeddings = null;
  }

  rebuildIndex();
  txTimestamp = Date.now();
}

/**
 * Search the knowledge store with a natural language query.
 *
 * Uses hybrid BM25 + vector search when embeddings are available,
 * falls back to BM25-only otherwise.
 *
 * @param query - Natural language search query
 * @param topK - Number of results to return (default 3)
 * @returns Array of search results with scores
 */
export async function searchKnowledge(query: string, topK = 3): Promise<SearchResult[]> {
  if (!initialized) {
    await initKnowledgeStore();
  }

  const allChunks = [...guideChunks, ...txChunks];

  if (!db || allChunks.length === 0) {
    return [];
  }

  let results: Results<OramaDoc>;

  if (vectorsAvailable) {
    const queryEmbedding = await embedQuery(query);

    if (queryEmbedding) {
      results = search(db, {
        mode: 'hybrid',
        term: query,
        vector: {
          value: queryEmbedding,
          property: 'embedding',
        },
        limit: topK,
      }) as Results<OramaDoc>;
    } else {
      results = search(db, {
        term: query,
        limit: topK,
      }) as Results<OramaDoc>;
    }
  } else {
    results = search(db, {
      term: query,
      limit: topK,
    }) as Results<OramaDoc>;
  }

  return results.hits.map((hit) => {
    const isGuide = hit.document.source === 'guide';
    const id = isGuide
      ? `${hit.document.guideUri.replace('actual://guides/', '')}-${hit.document.chunkIndex}`
      : `tx-${hit.document.chunkIndex}`;

    return {
      chunk: {
        id,
        text: hit.document.text,
        source: hit.document.source as 'guide' | 'transaction',
        guideUri: hit.document.guideUri,
        guideName: hit.document.guideName,
        sectionHeading: hit.document.sectionHeading,
        chunkIndex: hit.document.chunkIndex,
      },
      score: hit.score,
    };
  });
}

/**
 * Check if the knowledge store has been initialized.
 */
export function isKnowledgeStoreInitialized(): boolean {
  return initialized;
}

/**
 * Check if vector search is available.
 */
export function isVectorSearchAvailable(): boolean {
  return vectorsAvailable;
}

/**
 * Reset the knowledge store (for testing).
 */
export function resetKnowledgeStore(): void {
  db = null;
  guideChunks = [];
  guideEmbeddings = null;
  txChunks = [];
  txEmbeddings = null;
  txTimestamp = null;
  vectorsAvailable = false;
  initialized = false;
  initializing = false;
}
