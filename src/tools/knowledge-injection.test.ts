import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldInjectKnowledge, injectKnowledge, ensureKnowledgeReady } from './knowledge-injection.js';

vi.mock('../core/knowledge/index.js', () => ({
  searchKnowledge: vi.fn(),
  initKnowledgeStore: vi.fn().mockResolvedValue(undefined),
  isTransactionCacheStale: vi.fn(),
  refreshTransactionData: vi.fn().mockResolvedValue(undefined),
}));

import {
  searchKnowledge,
  initKnowledgeStore,
  isTransactionCacheStale,
  refreshTransactionData,
} from '../core/knowledge/index.js';

const mockResult = (text: string) => ({
  content: [{ type: 'text' as const, text }],
});

const mockError = (text: string) => ({
  isError: true as const,
  content: [{ type: 'text' as const, text }],
});

const mockSearchResult = (guideName: string, text: string) => ({
  chunk: {
    id: 'test-0',
    text,
    source: 'guide' as const,
    guideUri: 'actual://guides/test',
    guideName,
    sectionHeading: 'Test Section',
    chunkIndex: 0,
  },
  score: 0.9,
});

describe('knowledge-injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ensureKnowledgeReady', () => {
    it('initializes the knowledge store on every call', async () => {
      vi.mocked(isTransactionCacheStale).mockReturnValue(false);

      await ensureKnowledgeReady();

      expect(initKnowledgeStore).toHaveBeenCalledOnce();
    });

    it('refreshes transactions when cache is stale', async () => {
      vi.mocked(isTransactionCacheStale).mockReturnValue(true);

      await ensureKnowledgeReady();

      expect(refreshTransactionData).toHaveBeenCalledOnce();
    });

    it('skips refresh when cache is fresh', async () => {
      vi.mocked(isTransactionCacheStale).mockReturnValue(false);

      await ensureKnowledgeReady();

      expect(refreshTransactionData).not.toHaveBeenCalled();
    });

    it('does not fail if initialization throws', async () => {
      vi.mocked(initKnowledgeStore).mockRejectedValue(new Error('init failed'));

      await expect(ensureKnowledgeReady()).resolves.toBeUndefined();
    });

    it('does not fail if refresh throws', async () => {
      vi.mocked(isTransactionCacheStale).mockReturnValue(true);
      vi.mocked(refreshTransactionData).mockRejectedValue(new Error('refresh failed'));

      await expect(ensureKnowledgeReady()).resolves.toBeUndefined();
    });
  });

  describe('shouldInjectKnowledge', () => {
    it('returns true for mapped tools', () => {
      expect(shouldInjectKnowledge('get-budget-month')).toBe(true);
      expect(shouldInjectKnowledge('spending-by-category')).toBe(true);
      expect(shouldInjectKnowledge('monthly-summary')).toBe(true);
    });

    it('returns false for unmapped tools', () => {
      expect(shouldInjectKnowledge('get-accounts')).toBe(false);
      expect(shouldInjectKnowledge('get-transactions')).toBe(false);
      expect(shouldInjectKnowledge('query-knowledge')).toBe(false);
    });
  });

  describe('injectKnowledge', () => {
    it('appends knowledge context to mapped tool results', async () => {
      vi.mocked(searchKnowledge).mockResolvedValue([
        mockSearchResult('Spending Decisions', 'Step 1: Check category balance'),
      ]);

      const result = await injectKnowledge('get-budget-month', mockResult('budget data'));

      expect(result.content).toHaveLength(2);
      const injected = (result.content[1] as { type: string; text: string }).text;
      expect(injected).toContain('Budgeting Methodology Context');
      expect(injected).toContain('Spending Decisions');
      expect(injected).toContain('Step 1: Check category balance');
    });

    it('passes through unmapped tools unchanged', async () => {
      const original = mockResult('account data');
      const result = await injectKnowledge('get-accounts', original);
      expect(result).toBe(original);
    });

    it('passes through error results unchanged', async () => {
      const original = mockError('something broke');
      const result = await injectKnowledge('get-budget-month', original);
      expect(result).toBe(original);
    });

    it('passes through when search returns no results', async () => {
      vi.mocked(searchKnowledge).mockResolvedValue([]);

      const original = mockResult('budget data');
      const result = await injectKnowledge('get-budget-month', original);
      expect(result).toBe(original);
    });

    it('passes through when search throws', async () => {
      vi.mocked(searchKnowledge).mockRejectedValue(new Error('embedding failed'));

      const original = mockResult('budget data');
      const result = await injectKnowledge('get-budget-month', original);
      expect(result).toBe(original);
    });

    it('preserves original content items alongside injected knowledge', async () => {
      vi.mocked(searchKnowledge).mockResolvedValue([
        mockSearchResult('Guide', 'methodology text'),
      ]);

      const original = {
        content: [
          { type: 'text' as const, text: 'first block' },
          { type: 'text' as const, text: 'second block' },
        ],
      };

      const result = await injectKnowledge('get-budget-month', original);
      expect(result.content).toHaveLength(3);
      expect((result.content[0] as { type: string; text: string }).text).toBe('first block');
      expect((result.content[1] as { type: string; text: string }).text).toBe('second block');
      expect((result.content[2] as { type: string; text: string }).text).toContain('methodology text');
    });
  });
});
