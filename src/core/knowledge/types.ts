/**
 * Types for the RAG knowledge base system.
 */

export type ChunkSource = 'guide' | 'transaction';

export interface KnowledgeChunk {
  id: string;
  text: string;
  source: ChunkSource;
  guideUri: string;
  guideName: string;
  sectionHeading: string;
  chunkIndex: number;
}

export interface SearchResult {
  chunk: KnowledgeChunk;
  score: number;
}

export interface EmbeddingConfig {
  apiUrl: string;
  model: string;
}

export interface GuideResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}
