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
    'Search the budgeting knowledge base for decision-making frameworks, category priority rules, ' +
    'reallocation guidelines, and financial methodology. Returns relevant guide sections that contain ' +
    'step-by-step procedures for spending decisions (priority hierarchies, "roll with the punches" ' +
    'reallocation rules, sinking fund safety thresholds), month-ahead budgeting strategy, and template ' +
    'syntax reference. Also indexes recent transaction patterns for context-aware answers. ' +
    'Use when advising on purchases, moving money between categories, evaluating affordability, ' +
    'or any question where budgeting methodology matters — not just raw numbers.',
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
