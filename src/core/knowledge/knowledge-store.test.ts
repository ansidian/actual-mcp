import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initKnowledgeStore,
  searchKnowledge,
  isKnowledgeStoreInitialized,
  isVectorSearchAvailable,
  resetKnowledgeStore,
  refreshTransactionChunks,
  isTransactionCacheStale,
} from './knowledge-store.js';
import type { Transaction, Category, CategoryGroup, Account } from '../types/domain.js';

// Mock dependencies
vi.mock('../../resources.js', () => ({
  GUIDE_CONTENT: {
    'actual://guides/test-guide': `# Test Guide

## Budgeting Basics

Learn how to create a budget and track your spending effectively.

## Saving Strategies

Tips for saving money including emergency funds and sinking funds.

## Template Syntax

Use #template directives to automate your budget categories.`,
  },
  GUIDE_RESOURCES: [
    {
      uri: 'actual://guides/test-guide',
      name: 'Test Guide',
      description: 'A test guide',
      mimeType: 'text/markdown',
    },
  ],
}));

vi.mock('./embedder.js', () => ({
  embedTexts: vi.fn(),
  embedQuery: vi.fn(),
}));

import { embedTexts } from './embedder.js';

// ── Test data for transaction chunks ───────────────────────────────

const testCategories: Category[] = [
  { id: 'cat-food', name: 'Groceries', group_id: 'grp-food', is_income: false },
  { id: 'cat-pay', name: 'Paycheck', group_id: 'grp-income', is_income: true },
];

const testCategoryGroups: CategoryGroup[] = [
  { id: 'grp-food', name: 'Food & Dining' },
  { id: 'grp-income', name: 'Income', is_income: true },
];

const testAccounts: Account[] = [{ id: 'acct-1', name: 'Checking' }];

function makeTestTransactions(): Transaction[] {
  return [
    {
      id: 'tx-1',
      account: 'acct-1',
      date: '2025-12-01',
      amount: -8000,
      payee_name: 'Costco',
      category: 'cat-food',
    },
    {
      id: 'tx-2',
      account: 'acct-1',
      date: '2025-12-15',
      amount: -5000,
      payee_name: 'Trader Joes',
      category: 'cat-food',
    },
    {
      id: 'tx-3',
      account: 'acct-1',
      date: '2025-12-01',
      amount: 500000,
      payee_name: 'Employer',
      category: 'cat-pay',
    },
  ];
}

describe('knowledge-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetKnowledgeStore();
  });

  describe('initKnowledgeStore', () => {
    it('should initialize with BM25-only when embeddings are unavailable', async () => {
      vi.mocked(embedTexts).mockResolvedValue(null);

      await initKnowledgeStore();

      expect(isKnowledgeStoreInitialized()).toBe(true);
      expect(isVectorSearchAvailable()).toBe(false);
    });

    it('should initialize with vectors when embeddings are available', async () => {
      const mockEmbeddings = Array(3)
        .fill(null)
        .map(() => new Array(768).fill(0.1));
      vi.mocked(embedTexts).mockResolvedValue(mockEmbeddings);

      await initKnowledgeStore();

      expect(isKnowledgeStoreInitialized()).toBe(true);
      expect(isVectorSearchAvailable()).toBe(true);
    });

    it('should not re-initialize if already initialized', async () => {
      vi.mocked(embedTexts).mockResolvedValue(null);

      await initKnowledgeStore();
      await initKnowledgeStore();

      expect(embedTexts).toHaveBeenCalledTimes(1);
    });
  });

  describe('searchKnowledge', () => {
    it('should return relevant results for BM25 search', async () => {
      vi.mocked(embedTexts).mockResolvedValue(null);

      const results = await searchKnowledge('budget');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.text).toBeDefined();
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should return results with correct chunk structure', async () => {
      vi.mocked(embedTexts).mockResolvedValue(null);

      const results = await searchKnowledge('template syntax');

      expect(results.length).toBeGreaterThan(0);
      const chunk = results[0].chunk;
      expect(chunk).toHaveProperty('id');
      expect(chunk).toHaveProperty('text');
      expect(chunk).toHaveProperty('source');
      expect(chunk).toHaveProperty('guideUri');
      expect(chunk).toHaveProperty('guideName');
      expect(chunk).toHaveProperty('sectionHeading');
      expect(chunk).toHaveProperty('chunkIndex');
    });

    it('should return empty results for unrelated queries', async () => {
      vi.mocked(embedTexts).mockResolvedValue(null);

      const results = await searchKnowledge('quantum physics spacetime');

      expect(results).toHaveLength(0);
    });

    it('should auto-initialize if not yet initialized', async () => {
      vi.mocked(embedTexts).mockResolvedValue(null);

      expect(isKnowledgeStoreInitialized()).toBe(false);

      await searchKnowledge('budget');

      expect(isKnowledgeStoreInitialized()).toBe(true);
    });
  });

  describe('refreshTransactionChunks', () => {
    it('should add transaction chunks to the index', async () => {
      vi.mocked(embedTexts).mockResolvedValue(null);

      await refreshTransactionChunks(makeTestTransactions(), testCategories, testCategoryGroups, testAccounts);

      // Search for transaction-specific content
      const results = await searchKnowledge('Groceries Costco spending');
      expect(results.length).toBeGreaterThan(0);
      const txResult = results.find((r) => r.chunk.source === 'transaction');
      expect(txResult).toBeDefined();
    });

    it('should preserve guide chunks after transaction refresh', async () => {
      vi.mocked(embedTexts).mockResolvedValue(null);

      await initKnowledgeStore();
      await refreshTransactionChunks(makeTestTransactions(), testCategories, testCategoryGroups, testAccounts);

      // Guide content should still be searchable
      const results = await searchKnowledge('template syntax');
      expect(results.length).toBeGreaterThan(0);
      const guideResult = results.find((r) => r.chunk.source === 'guide');
      expect(guideResult).toBeDefined();
    });

    it('should rebuild on every call (no TTL caching)', async () => {
      vi.mocked(embedTexts).mockResolvedValue(null);

      await refreshTransactionChunks(makeTestTransactions(), testCategories, testCategoryGroups, testAccounts);
      const callCountAfterFirst = vi.mocked(embedTexts).mock.calls.length;

      // Second call should also embed (always refreshes)
      await refreshTransactionChunks(makeTestTransactions(), testCategories, testCategoryGroups, testAccounts);
      expect(vi.mocked(embedTexts).mock.calls.length).toBeGreaterThan(callCountAfterFirst);
    });
  });

  describe('isTransactionCacheStale', () => {
    it('should be stale when no transaction data has been loaded', () => {
      expect(isTransactionCacheStale()).toBe(true);
    });

    it('should not be stale right after refresh', async () => {
      vi.mocked(embedTexts).mockResolvedValue(null);

      await refreshTransactionChunks(makeTestTransactions(), testCategories, testCategoryGroups, testAccounts);

      expect(isTransactionCacheStale()).toBe(false);
    });
  });

  describe('resetKnowledgeStore', () => {
    it('should reset all state', async () => {
      vi.mocked(embedTexts).mockResolvedValue(null);
      await initKnowledgeStore();

      expect(isKnowledgeStoreInitialized()).toBe(true);

      resetKnowledgeStore();

      expect(isKnowledgeStoreInitialized()).toBe(false);
      expect(isVectorSearchAvailable()).toBe(false);
      expect(isTransactionCacheStale()).toBe(true);
    });
  });
});
