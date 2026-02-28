export {
  initKnowledgeStore,
  searchKnowledge,
  isKnowledgeStoreInitialized,
  isVectorSearchAvailable,
  resetKnowledgeStore,
  refreshTransactionChunks,
  isTransactionCacheStale,
} from './knowledge-store.js';
export { chunkGuides } from './chunker.js';
export { chunkTransactions } from './transaction-chunker.js';
export { embedTexts, embedQuery, getEmbeddingConfig, resetModelEnsured } from './embedder.js';
export type { KnowledgeChunk, SearchResult, EmbeddingConfig, GuideResource, ChunkSource } from './types.js';
