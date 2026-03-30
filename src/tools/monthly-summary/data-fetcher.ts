import { fetchAllAccounts } from '../../core/data/fetch-accounts.js';
import { fetchAllCategories } from '../../core/data/fetch-categories.js';
import { fetchTransactionsByScope } from '../../core/data/fetch-transactions.js';
import type { Account, Category, Transaction } from '../../core/types/domain.js';

export class MonthlySummaryDataFetcher {
  /**
   * Fetch accounts, categories, and all transactions for the given period.
   * If accountId is provided, only fetch transactions for that account.
   */
  async fetchAll(
    accountId: string | undefined,
    start: string,
    end: string
  ): Promise<{
    accounts: Account[];
    categories: Category[];
    transactions: Transaction[];
  }> {
    const accounts = await fetchAllAccounts();
    const categories = await fetchAllCategories();
    const transactions = await fetchTransactionsByScope(accountId, accounts, start, end);
    return { accounts, categories, transactions };
  }
}
