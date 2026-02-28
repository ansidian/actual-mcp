import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshTransactionData } from './data-fetcher.js';

vi.mock('../../../core/data/fetch-accounts.js', () => ({
  fetchAllAccounts: vi.fn().mockResolvedValue([{ id: 'acct-1', name: 'Checking' }]),
}));

vi.mock('../../../core/data/fetch-categories.js', () => ({
  fetchAllCategories: vi.fn().mockResolvedValue([{ id: 'cat-1', name: 'Groceries', group_id: 'grp-1' }]),
  fetchAllCategoryGroups: vi.fn().mockResolvedValue([{ id: 'grp-1', name: 'Food' }]),
}));

vi.mock('../../../core/data/fetch-transactions.js', () => ({
  fetchAllOnBudgetTransactions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../core/knowledge/index.js', () => ({
  refreshTransactionChunks: vi.fn().mockResolvedValue(undefined),
}));

import { fetchAllAccounts } from '../../../core/data/fetch-accounts.js';
import { fetchAllCategories, fetchAllCategoryGroups } from '../../../core/data/fetch-categories.js';
import { fetchAllOnBudgetTransactions } from '../../../core/data/fetch-transactions.js';
import { refreshTransactionChunks } from '../../../core/knowledge/index.js';

describe('refreshTransactionData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch data and refresh on every call', async () => {
    await refreshTransactionData();

    expect(fetchAllAccounts).toHaveBeenCalledOnce();
    expect(fetchAllCategories).toHaveBeenCalledOnce();
    expect(fetchAllCategoryGroups).toHaveBeenCalledOnce();
    expect(fetchAllOnBudgetTransactions).toHaveBeenCalledOnce();
    expect(refreshTransactionChunks).toHaveBeenCalledOnce();
  });

  it('should pass 6-month date range to transaction fetcher', async () => {
    await refreshTransactionData();

    const call = vi.mocked(fetchAllOnBudgetTransactions).mock.calls[0];
    const startDate = call[1] as string;
    const endDate = call[2] as string;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    expect(diffMonths).toBe(6);
  });
});
