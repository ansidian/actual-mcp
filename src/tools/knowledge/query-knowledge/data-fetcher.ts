/**
 * Data fetcher for transaction-derived RAG chunks.
 *
 * Fetches 6 months of on-budget transactions plus category/account metadata,
 * then refreshes the knowledge store's transaction chunks.
 * Always fetches fresh data on every call — embedding is near-instant on
 * modern GPUs and the Actual API reads from a local database.
 */

import { fetchAllAccounts } from '../../../core/data/fetch-accounts.js';
import { fetchAllCategories, fetchAllCategoryGroups } from '../../../core/data/fetch-categories.js';
import { fetchAllOnBudgetTransactions } from '../../../core/data/fetch-transactions.js';
import { refreshTransactionChunks } from '../../../core/knowledge/index.js';
import { getDateRangeForMonths } from '../../../utils.js';

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
