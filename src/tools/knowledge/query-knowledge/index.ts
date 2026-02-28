/**
 * query-knowledge tool — search the knowledge base with natural language.
 *
 * Uses Orama for hybrid BM25 + vector search across guide content.
 * Falls back to BM25-only when the embedding server is unavailable.
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolInput } from '../../../types.js';
import { success, errorFromCatch } from '../../../utils/response.js';
import { searchKnowledge, isVectorSearchAvailable } from '../../../core/knowledge/index.js';
import { QueryKnowledgeArgsSchema, parseArgs } from './input-parser.js';
import { formatSearchResults } from './report-generator.js';
import { refreshTransactionData } from './data-fetcher.js';

export const schema = {
  name: 'query-knowledge',
  description:
    'IMPORTANT: Call this tool BEFORE giving financial advice, evaluating purchases, or answering ' +
    '"can I afford" questions. This searches the knowledge base using the user\'s natural language query ' +
    'and returns the most relevant guide sections with the required methodology. ' +
    'Also call at session start with "financial context" to learn how to build the user\'s financial picture. ' +
    'After reading the results, use get-guide if you need the full unabridged guide document.',
  inputSchema: zodToJsonSchema(QueryKnowledgeArgsSchema) as ToolInput,
  requiresApi: true,
};

/**
 * Handle query-knowledge tool calls.
 *
 * @param args - Raw tool arguments
 * @returns MCP tool result with formatted search results
 */
export async function handler(args: unknown): Promise<CallToolResult> {
  try {
    const { query, topK } = parseArgs(args);
    await refreshTransactionData();
    const results = await searchKnowledge(query, topK);
    const vectorSearch = isVectorSearchAvailable();
    const report = formatSearchResults(results, vectorSearch);

    return success(report);
  } catch (err) {
    return errorFromCatch(err);
  }
}
