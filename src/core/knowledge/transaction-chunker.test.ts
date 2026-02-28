import { describe, it, expect } from 'vitest';
import { chunkTransactions, centsToDisplay, formatMonth } from './transaction-chunker.js';
import type { Transaction, Category, CategoryGroup, Account } from '../types/domain.js';

// ── Test data factories ────────────────────────────────────────────

function makeTransaction(overrides: Partial<Transaction> & { date: string; amount: number }): Transaction {
  return {
    id: `tx-${Math.random().toString(36).slice(2, 8)}`,
    account: 'acct-1',
    payee_name: 'Test Payee',
    category: 'cat-groceries',
    ...overrides,
  };
}

const categories: Category[] = [
  { id: 'cat-groceries', name: 'Groceries', group_id: 'grp-food', is_income: false },
  { id: 'cat-restaurants', name: 'Restaurants', group_id: 'grp-food', is_income: false },
  { id: 'cat-rent', name: 'Rent', group_id: 'grp-housing', is_income: false },
  { id: 'cat-paycheck', name: 'Paycheck', group_id: 'grp-income', is_income: true },
];

const categoryGroups: CategoryGroup[] = [
  { id: 'grp-food', name: 'Food & Dining' },
  { id: 'grp-housing', name: 'Housing' },
  { id: 'grp-income', name: 'Income', is_income: true },
];

const accounts: Account[] = [{ id: 'acct-1', name: 'Checking' }];

// ── Utility tests ──────────────────────────────────────────────────

describe('centsToDisplay', () => {
  it('should format cents as dollars', () => {
    expect(centsToDisplay(123456)).toBe('$1,234.56');
    expect(centsToDisplay(-50000)).toBe('$500.00');
    expect(centsToDisplay(99)).toBe('$0.99');
    expect(centsToDisplay(0)).toBe('$0.00');
  });
});

describe('formatMonth', () => {
  it('should format year/month as readable string', () => {
    expect(formatMonth(2025, 12)).toBe('December 2025');
    expect(formatMonth(2026, 1)).toBe('January 2026');
  });
});

// ── chunkTransactions ──────────────────────────────────────────────

describe('chunkTransactions', () => {
  it('should return empty array for no transactions', () => {
    const result = chunkTransactions([], categories, categoryGroups, accounts);
    expect(result).toEqual([]);
  });

  it('should generate monthly category spending chunks', () => {
    const transactions: Transaction[] = [
      makeTransaction({ date: '2025-12-01', amount: -5000, payee_name: 'Store A', category: 'cat-groceries' }),
      makeTransaction({ date: '2025-12-15', amount: -3000, payee_name: 'Store B', category: 'cat-groceries' }),
      makeTransaction({ date: '2025-12-20', amount: -2000, payee_name: 'Cafe', category: 'cat-restaurants' }),
    ];

    const chunks = chunkTransactions(transactions, categories, categoryGroups, accounts);
    const catChunks = chunks.filter((c) => c.id.startsWith('tx-cat-'));

    expect(catChunks.length).toBeGreaterThanOrEqual(2); // Groceries + Restaurants
    const groceryChunk = catChunks.find((c) => c.text.includes('Groceries'));
    expect(groceryChunk).toBeDefined();
    expect(groceryChunk!.text).toContain('$80.00'); // 5000 + 3000 cents
    expect(groceryChunk!.text).toContain('2 transactions');
    expect(groceryChunk!.text).toContain('Food & Dining');
    expect(groceryChunk!.source).toBe('transaction');
    expect(groceryChunk!.guideUri).toBe('');
  });

  it('should generate monthly income chunks', () => {
    const transactions: Transaction[] = [
      makeTransaction({ date: '2025-12-01', amount: 500000, payee_name: 'Employer', category: 'cat-paycheck' }),
      makeTransaction({ date: '2025-12-15', amount: 500000, payee_name: 'Employer', category: 'cat-paycheck' }),
    ];

    const chunks = chunkTransactions(transactions, categories, categoryGroups, accounts);
    const incomeChunks = chunks.filter((c) => c.id.startsWith('tx-income-'));

    expect(incomeChunks).toHaveLength(1);
    expect(incomeChunks[0].text).toContain('Income Summary');
    expect(incomeChunks[0].text).toContain('$10,000.00');
    expect(incomeChunks[0].text).toContain('Employer');
  });

  it('should generate monthly overview chunks', () => {
    const transactions: Transaction[] = [
      makeTransaction({ date: '2025-12-01', amount: 500000, payee_name: 'Employer', category: 'cat-paycheck' }),
      makeTransaction({ date: '2025-12-10', amount: -20000, payee_name: 'Store', category: 'cat-groceries' }),
      makeTransaction({ date: '2025-12-15', amount: -100000, payee_name: 'Landlord', category: 'cat-rent' }),
    ];

    const chunks = chunkTransactions(transactions, categories, categoryGroups, accounts);
    const overviewChunks = chunks.filter((c) => c.id.startsWith('tx-overview-'));

    expect(overviewChunks).toHaveLength(1);
    expect(overviewChunks[0].text).toContain('Monthly Overview');
    expect(overviewChunks[0].text).toContain('Income:');
    expect(overviewChunks[0].text).toContain('Expenses:');
  });

  it('should generate large transaction chunk for amounts >= $500', () => {
    const transactions: Transaction[] = [
      makeTransaction({ date: '2025-12-01', amount: -80000, payee_name: 'Best Buy', category: 'cat-groceries' }),
      makeTransaction({ date: '2025-12-05', amount: -5000, payee_name: 'Coffee Shop', category: 'cat-restaurants' }),
    ];

    const chunks = chunkTransactions(transactions, categories, categoryGroups, accounts);
    const largeChunks = chunks.filter((c) => c.id.startsWith('tx-large-'));

    expect(largeChunks).toHaveLength(1);
    expect(largeChunks[0].text).toContain('Best Buy');
    expect(largeChunks[0].text).not.toContain('Coffee Shop'); // under threshold
  });

  it('should skip large transaction chunk when none exceed threshold', () => {
    const transactions: Transaction[] = [
      makeTransaction({ date: '2025-12-01', amount: -1000, payee_name: 'Small Store' }),
    ];

    const chunks = chunkTransactions(transactions, categories, categoryGroups, accounts);
    const largeChunks = chunks.filter((c) => c.id.startsWith('tx-large-'));

    expect(largeChunks).toHaveLength(0);
  });

  it('should generate category group trend chunks', () => {
    const transactions: Transaction[] = [
      makeTransaction({ date: '2025-10-01', amount: -5000, category: 'cat-groceries' }),
      makeTransaction({ date: '2025-11-01', amount: -6000, category: 'cat-groceries' }),
      makeTransaction({ date: '2025-12-01', amount: -7000, category: 'cat-groceries' }),
      makeTransaction({ date: '2025-12-15', amount: -3000, category: 'cat-restaurants' }),
    ];

    const chunks = chunkTransactions(transactions, categories, categoryGroups, accounts);
    const trendChunks = chunks.filter((c) => c.id.startsWith('tx-trend-'));

    expect(trendChunks.length).toBeGreaterThanOrEqual(1);
    const foodTrend = trendChunks.find((c) => c.text.includes('Food & Dining'));
    expect(foodTrend).toBeDefined();
    expect(foodTrend!.text).toContain('Spending Trend');
    expect(foodTrend!.text).toContain('avg');
  });

  it('should generate recurring payee chunk for payees in 4+ months', () => {
    const transactions: Transaction[] = [];
    // Create a payee appearing in 5 months
    for (let m = 8; m <= 12; m++) {
      transactions.push(
        makeTransaction({
          date: `2025-${String(m).padStart(2, '0')}-01`,
          amount: -15000,
          payee_name: 'Netflix',
          category: 'cat-restaurants',
        })
      );
    }
    // A payee in only 2 months (should NOT appear)
    transactions.push(makeTransaction({ date: '2025-11-01', amount: -5000, payee_name: 'Rare Store' }));
    transactions.push(makeTransaction({ date: '2025-12-01', amount: -5000, payee_name: 'Rare Store' }));

    const chunks = chunkTransactions(transactions, categories, categoryGroups, accounts);
    const recurringChunks = chunks.filter((c) => c.id.startsWith('tx-recurring-'));

    expect(recurringChunks).toHaveLength(1);
    expect(recurringChunks[0].text).toContain('Netflix');
    expect(recurringChunks[0].text).toContain('5/5 months');
    expect(recurringChunks[0].text).not.toContain('Rare Store');
  });

  it('should skip transfers', () => {
    const transactions: Transaction[] = [
      makeTransaction({ date: '2025-12-01', amount: -50000, transfer_id: 'transfer-1', category: 'cat-groceries' }),
    ];

    const chunks = chunkTransactions(transactions, categories, categoryGroups, accounts);
    const catChunks = chunks.filter((c) => c.id.startsWith('tx-cat-'));

    expect(catChunks).toHaveLength(0);
  });
});
