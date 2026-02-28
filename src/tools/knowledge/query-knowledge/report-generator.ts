import type { SearchResult } from '../../../core/knowledge/types.js';

/**
 * Format search results as a markdown report.
 *
 * @param results - Array of search results from the knowledge store
 * @param vectorSearch - Whether vector search was used
 * @returns Formatted markdown string
 */
export function formatSearchResults(results: SearchResult[], vectorSearch: boolean): string {
  if (results.length === 0) {
    return 'No relevant knowledge base entries found for this query.';
  }

  const mode = vectorSearch ? 'hybrid (BM25 + vector)' : 'keyword (BM25)';
  const lines: string[] = [`**Search mode**: ${mode}\n`];

  for (let i = 0; i < results.length; i++) {
    const { chunk, score } = results[i];
    lines.push(`---\n`);
    lines.push(`### Result ${i + 1} (score: ${score.toFixed(4)})`);
    const sourceLabel =
      chunk.source === 'guide'
        ? `${chunk.guideName} > ${chunk.sectionHeading}`
        : `Transaction Data > ${chunk.sectionHeading}`;
    lines.push(`**Source**: ${sourceLabel}\n`);
    lines.push(chunk.text);
    lines.push('');
  }

  return lines.join('\n');
}
