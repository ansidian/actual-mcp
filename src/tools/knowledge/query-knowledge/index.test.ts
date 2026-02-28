import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler, schema } from './index.js';

vi.mock('../../../core/knowledge/index.js', () => ({
  searchKnowledge: vi.fn(),
  isVectorSearchAvailable: vi.fn(),
}));

vi.mock('./data-fetcher.js', () => ({
  refreshTransactionData: vi.fn().mockResolvedValue(undefined),
}));

import { searchKnowledge, isVectorSearchAvailable } from '../../../core/knowledge/index.js';
import { refreshTransactionData } from './data-fetcher.js';

describe('query-knowledge tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('schema', () => {
    it('should have correct name and requiresApi flag', () => {
      expect(schema.name).toBe('query-knowledge');
      expect(schema.requiresApi).toBe(true);
    });
  });

  describe('handler', () => {
    it('should refresh transaction data before searching', async () => {
      vi.mocked(searchKnowledge).mockResolvedValue([]);
      vi.mocked(isVectorSearchAvailable).mockReturnValue(false);

      await handler({ query: 'test query' });

      expect(refreshTransactionData).toHaveBeenCalledOnce();
    });

    it('should return formatted results for a valid query', async () => {
      vi.mocked(searchKnowledge).mockResolvedValue([
        {
          chunk: {
            id: 'test-0',
            text: 'Budget content here',
            source: 'guide' as const,
            guideUri: 'actual://guides/test',
            guideName: 'Test Guide',
            sectionHeading: 'Budgeting',
            chunkIndex: 0,
          },
          score: 0.95,
        },
      ]);
      vi.mocked(isVectorSearchAvailable).mockReturnValue(true);

      const result = await handler({ query: 'how to budget' });

      expect(result.isError).toBeUndefined();
      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toContain('hybrid (BM25 + vector)');
      expect(text).toContain('Test Guide');
      expect(text).toContain('Budget content here');
      expect(searchKnowledge).toHaveBeenCalledWith('how to budget', 3);
    });

    it('should return no-results message for unmatched queries', async () => {
      vi.mocked(searchKnowledge).mockResolvedValue([]);
      vi.mocked(isVectorSearchAvailable).mockReturnValue(false);

      const result = await handler({ query: 'quantum physics' });

      const text = (result.content[0] as { type: string; text: string }).text;
      expect(text).toContain('No relevant knowledge base entries found');
    });

    it('should return error for invalid input', async () => {
      const result = await handler({ query: '' });

      expect(result.isError).toBe(true);
    });
  });
});
