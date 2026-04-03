/**
 * Shared transaction refresh for the knowledge store.
 *
 * Fetches 6 months of on-budget transactions plus category/account metadata,
 * then rebuilds the knowledge store's transaction chunks and embeddings.
 */

import { fetchAllAccounts } from '../data/fetch-accounts.js';
import { fetchAllCategories, fetchAllCategoryGroups } from '../data/fetch-categories.js';
import { fetchAllOnBudgetTransactions } from '../data/fetch-transactions.js';
import { refreshTransactionChunks } from './knowledge-store.js';
import { getDateRangeForMonths } from '../../utils.js';

const MONTHS_OF_HISTORY = 6;

/**
 * Refresh transaction data in the knowledge store.
 * Fetches all on-budget transactions for the last 6 months, plus category
 * and account metadata, then rebuilds the transaction chunks and embeddings.
 */
export async function refreshTransactionData(): Promise<void> {
  const [accounts, categories, categoryGroups] = await Promise.all([
    fetchAllAccounts(),
    fetchAllCategories(),
    fetchAllCategoryGroups(),
  ]);

  const { start, end } = getDateRangeForMonths(MONTHS_OF_HISTORY);
  const transactions = await fetchAllOnBudgetTransactions(accounts, start, end);

  await refreshTransactionChunks(transactions, categories, categoryGroups, accounts);
}
