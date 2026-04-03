/**
 * Knowledge store lifecycle and automatic injection for tool responses.
 *
 * Two responsibilities:
 * 1. ensureKnowledgeReady — called on every tool call to keep the index warm.
 *    Initializes guides on first call, refreshes transaction chunks when TTL expires.
 * 2. injectKnowledge — called after mapped tools return, appends relevant
 *    methodology context to the response.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  searchKnowledge,
  initKnowledgeStore,
  isTransactionCacheStale,
  refreshTransactionData,
} from '../core/knowledge/index.js';
import type { SearchResult } from '../core/knowledge/types.js';

/**
 * Map of tool names to knowledge search queries.
 * Only tools where budgeting methodology meaningfully improves the LLM's
 * response quality are included.
 */
const TOOL_KNOWLEDGE_QUERIES: Record<string, string> = {
  'get-budget-month':
    'budget analysis spending decisions reallocation rules category priorities',
  'spending-by-category':
    'spending patterns analysis category priorities overspending',
  'monthly-summary':
    'income vs spending net income month-ahead budgeting strategy',
};

// Track whether a transaction refresh is already in-flight to avoid concurrent fetches
let refreshInFlight: Promise<void> | null = null;

/**
 * Ensure the knowledge store is initialized and transaction data is fresh.
 * Called on every tool call. Guide initialization is one-shot (permanent).
 * Transaction refresh is TTL-gated (5 minutes).
 *
 * Best-effort — failures are logged but never block the tool call.
 */
export async function ensureKnowledgeReady(): Promise<void> {
  try {
    await initKnowledgeStore();

    if (isTransactionCacheStale() && !refreshInFlight) {
      refreshInFlight = refreshTransactionData().finally(() => {
        refreshInFlight = null;
      });
      await refreshInFlight;
    } else if (refreshInFlight) {
      // Another call already triggered a refresh — wait for it
      await refreshInFlight;
    }
  } catch (err) {
    console.error(
      'Knowledge store initialization/refresh failed:',
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Check whether a tool should have knowledge auto-injected into its response.
 */
export function shouldInjectKnowledge(toolName: string): boolean {
  return toolName in TOOL_KNOWLEDGE_QUERIES;
}

/**
 * Format knowledge results into a compact context block.
 */
function formatInjectedKnowledge(results: SearchResult[]): string {
  if (results.length === 0) return '';

  const sections = results.map((r) => {
    const source =
      r.chunk.source === 'guide'
        ? `${r.chunk.guideName} > ${r.chunk.sectionHeading}`
        : `Transaction Data > ${r.chunk.sectionHeading}`;
    return `### ${source}\n${r.chunk.text}`;
  });

  return [
    '---',
    '**Budgeting Methodology Context** (auto-injected from knowledge base)',
    'Apply these frameworks when interpreting the data above:\n',
    ...sections,
  ].join('\n');
}

/**
 * Append relevant knowledge context to a tool result.
 * Returns the original result unchanged if:
 * - the tool isn't mapped for injection
 * - no relevant results are found
 * - the original result was an error
 */
export async function injectKnowledge(
  toolName: string,
  result: CallToolResult
): Promise<CallToolResult> {
  if (!shouldInjectKnowledge(toolName)) return result;
  if (result.isError) return result;

  const query = TOOL_KNOWLEDGE_QUERIES[toolName];

  try {
    const results = await searchKnowledge(query, 3);
    const knowledgeText = formatInjectedKnowledge(results);
    if (!knowledgeText) return result;

    return {
      ...result,
      content: [
        ...result.content,
        { type: 'text' as const, text: knowledgeText },
      ],
    };
  } catch {
    // Knowledge injection is best-effort — never break the tool response
    return result;
  }
}
