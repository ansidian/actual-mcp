/**
 * Transaction chunker — aggregates raw transactions into semantic chunks
 * for the knowledge store.
 *
 * Produces 6 chunk types: monthly category spending, monthly income,
 * monthly overview, large transactions, category group trends,
 * and recurring payees.
 */

import type { Transaction, Category, CategoryGroup, Account } from '../types/domain.js';
import type { KnowledgeChunk } from './types.js';

const LARGE_TRANSACTION_THRESHOLD_CENTS = 50_000; // $500
const RECURRING_PAYEE_MIN_MONTHS = 4;
const TOP_PAYEES_PER_CATEGORY = 3;
const TOP_CATEGORIES_PER_OVERVIEW = 5;

// ── Utility helpers ────────────────────────────────────────────────

/**
 * Format cents as a display string (e.g., 123456 → "$1,234.56").
 *
 * @param cents - Amount in cents (negative = spending)
 * @returns Formatted dollar string
 */
export function centsToDisplay(cents: number): string {
  const abs = Math.abs(cents);
  const dollars = abs / 100;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a year/month pair as "Month YYYY" (e.g., 12, 2025 → "December 2025").
 *
 * @param year - 4-digit year
 * @param month - 1-based month number
 * @returns Formatted month string
 */
export function formatMonth(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Format a year/month pair as short "Mon" (e.g., 12 → "Dec").
 */
function formatMonthShort(month: number): string {
  const date = new Date(2000, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short' });
}

/**
 * Parse YYYY-MM-DD date string into { year, month }.
 */
function parseYearMonth(dateStr: string): { year: number; month: number } {
  const [yearStr, monthStr] = dateStr.split('-');
  return { year: parseInt(yearStr, 10), month: parseInt(monthStr, 10) };
}

/**
 * Build a category lookup map from category and group arrays.
 */
function buildCategoryLookup(
  categories: Category[],
  categoryGroups: CategoryGroup[]
): Map<string, { name: string; groupName: string; isIncome: boolean }> {
  const groupMap = new Map<string, string>();
  for (const g of categoryGroups) {
    groupMap.set(g.id, g.name);
  }

  const lookup = new Map<string, { name: string; groupName: string; isIncome: boolean }>();
  for (const c of categories) {
    lookup.set(c.id, {
      name: c.name,
      groupName: groupMap.get(c.group_id) || 'Unknown',
      isIncome: c.is_income === true,
    });
  }
  return lookup;
}

/**
 * Sort month keys (YYYY-MM) chronologically.
 */
function sortMonthKeys(keys: string[]): string[] {
  return [...keys].sort();
}

// ── Chunk generators ───────────────────────────────────────────────

interface MonthCategoryData {
  total: number;
  count: number;
  payees: Map<string, { total: number; count: number }>;
}

/**
 * Generate monthly category spending chunks.
 * One chunk per category per month with top payees.
 */
function generateMonthlyCategoryChunks(
  transactions: Transaction[],
  categoryLookup: Map<string, { name: string; groupName: string; isIncome: boolean }>
): KnowledgeChunk[] {
  // Reason: Group by month → category, skipping transfers and income
  const buckets = new Map<string, Map<string, MonthCategoryData>>();

  for (const tx of transactions) {
    if (!tx.category || tx.transfer_id) continue;
    const catInfo = categoryLookup.get(tx.category);
    if (!catInfo || catInfo.isIncome) continue;
    if (tx.amount >= 0) continue; // Skip non-spending

    const { year, month } = parseYearMonth(tx.date);
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const payeeName = tx.payee_name || 'Unknown';

    if (!buckets.has(monthKey)) buckets.set(monthKey, new Map());
    const monthMap = buckets.get(monthKey)!;

    if (!monthMap.has(tx.category)) {
      monthMap.set(tx.category, { total: 0, count: 0, payees: new Map() });
    }
    const data = monthMap.get(tx.category)!;
    data.total += tx.amount; // negative
    data.count += 1;

    if (!data.payees.has(payeeName)) data.payees.set(payeeName, { total: 0, count: 0 });
    const payeeData = data.payees.get(payeeName)!;
    payeeData.total += tx.amount;
    payeeData.count += 1;
  }

  const chunks: KnowledgeChunk[] = [];
  let chunkIndex = 0;

  for (const monthKey of sortMonthKeys([...buckets.keys()])) {
    const { year, month } = parseYearMonth(`${monthKey}-01`);
    const monthLabel = formatMonth(year, month);
    const categoryMap = buckets.get(monthKey)!;

    for (const [catId, data] of categoryMap) {
      const catInfo = categoryLookup.get(catId);
      if (!catInfo) continue;

      const avg = centsToDisplay(Math.round(data.total / data.count));
      const topPayees = [...data.payees.entries()]
        .sort((a, b) => a[1].total - b[1].total) // most negative first
        .slice(0, TOP_PAYEES_PER_CATEGORY)
        .map(([name, p]) => `${name} (${centsToDisplay(p.total)}, ${p.count} txns)`)
        .join(', ');

      const text =
        `Monthly Spending — ${catInfo.name} (${monthLabel})\n\n` +
        `Spent ${centsToDisplay(data.total)} across ${data.count} transactions.\n` +
        `Category group: ${catInfo.groupName}.\n` +
        `Average transaction: ${avg}.\n` +
        `Top payees: ${topPayees}.`;

      chunks.push({
        id: `tx-cat-${monthKey}-${chunkIndex}`,
        text,
        source: 'transaction',
        guideUri: '',
        guideName: '',
        sectionHeading: `${catInfo.name} — ${monthLabel}`,
        chunkIndex: chunkIndex++,
      });
    }
  }

  return chunks;
}

/**
 * Generate monthly income summary chunks.
 * One chunk per month showing income sources.
 */
function generateMonthlyIncomeChunks(
  transactions: Transaction[],
  categoryLookup: Map<string, { name: string; groupName: string; isIncome: boolean }>
): KnowledgeChunk[] {
  const buckets = new Map<string, { total: number; count: number; sources: Map<string, number> }>();

  for (const tx of transactions) {
    if (tx.transfer_id) continue;
    const catInfo = tx.category ? categoryLookup.get(tx.category) : null;
    const isIncome = catInfo?.isIncome || tx.amount > 0;
    if (!isIncome || tx.amount <= 0) continue;

    const { year, month } = parseYearMonth(tx.date);
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const sourceName = tx.payee_name || catInfo?.name || 'Other Income';

    if (!buckets.has(monthKey)) buckets.set(monthKey, { total: 0, count: 0, sources: new Map() });
    const data = buckets.get(monthKey)!;
    data.total += tx.amount;
    data.count += 1;
    data.sources.set(sourceName, (data.sources.get(sourceName) || 0) + tx.amount);
  }

  const chunks: KnowledgeChunk[] = [];
  let chunkIndex = 0;

  for (const monthKey of sortMonthKeys([...buckets.keys()])) {
    const { year, month } = parseYearMonth(`${monthKey}-01`);
    const monthLabel = formatMonth(year, month);
    const data = buckets.get(monthKey)!;

    const sourcesList = [...data.sources.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => `${name} (${centsToDisplay(amount)})`)
      .join(', ');

    const text =
      `Income Summary — ${monthLabel}\n\n` +
      `Total income: ${centsToDisplay(data.total)} from ${data.count} transactions.\n` +
      `Sources: ${sourcesList}.`;

    chunks.push({
      id: `tx-income-${monthKey}-${chunkIndex}`,
      text,
      source: 'transaction',
      guideUri: '',
      guideName: '',
      sectionHeading: `Income — ${monthLabel}`,
      chunkIndex: chunkIndex++,
    });
  }

  return chunks;
}

/**
 * Generate monthly overview chunks.
 * One chunk per month with income/expenses/savings breakdown.
 */
function generateMonthlyOverviewChunks(
  transactions: Transaction[],
  categoryLookup: Map<string, { name: string; groupName: string; isIncome: boolean }>
): KnowledgeChunk[] {
  interface MonthOverview {
    income: number;
    expenses: number;
    savings: number;
    count: number;
    categoryTotals: Map<string, number>;
  }

  const buckets = new Map<string, MonthOverview>();

  for (const tx of transactions) {
    if (tx.transfer_id) continue;

    const { year, month } = parseYearMonth(tx.date);
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;

    if (!buckets.has(monthKey)) {
      buckets.set(monthKey, { income: 0, expenses: 0, savings: 0, count: 0, categoryTotals: new Map() });
    }
    const data = buckets.get(monthKey)!;
    data.count += 1;

    const catInfo = tx.category ? categoryLookup.get(tx.category) : null;
    const isSavings =
      catInfo?.groupName.toLowerCase().includes('saving') || catInfo?.groupName.toLowerCase().includes('invest');

    if (catInfo?.isIncome || tx.amount > 0) {
      data.income += tx.amount;
    } else if (isSavings) {
      data.savings += Math.abs(tx.amount);
    } else {
      data.expenses += Math.abs(tx.amount);
      const catName = catInfo?.name || 'Uncategorized';
      data.categoryTotals.set(catName, (data.categoryTotals.get(catName) || 0) + Math.abs(tx.amount));
    }
  }

  const chunks: KnowledgeChunk[] = [];
  let chunkIndex = 0;

  for (const monthKey of sortMonthKeys([...buckets.keys()])) {
    const { year, month } = parseYearMonth(`${monthKey}-01`);
    const monthLabel = formatMonth(year, month);
    const data = buckets.get(monthKey)!;

    const net = data.income - data.expenses - data.savings;
    const savingsRate = data.income > 0 ? ((data.income - data.expenses - data.savings) / data.income) * 100 : 0;

    const topCats = [...data.categoryTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_CATEGORIES_PER_OVERVIEW)
      .map(([name, total]) => `${name} (${centsToDisplay(total)})`)
      .join(', ');

    const text =
      `Monthly Overview — ${monthLabel}\n\n` +
      `Income: ${centsToDisplay(data.income)} | Expenses: ${centsToDisplay(data.expenses)} | ` +
      `Savings/Investments: ${centsToDisplay(data.savings)}\n` +
      `Net: ${net >= 0 ? '+' : '-'}${centsToDisplay(Math.abs(net))} (savings rate: ${savingsRate.toFixed(1)}%). ` +
      `${data.count} transactions.\n` +
      `Top spending: ${topCats || 'None'}.`;

    chunks.push({
      id: `tx-overview-${monthKey}-${chunkIndex}`,
      text,
      source: 'transaction',
      guideUri: '',
      guideName: '',
      sectionHeading: `Overview — ${monthLabel}`,
      chunkIndex: chunkIndex++,
    });
  }

  return chunks;
}

/**
 * Generate a single chunk listing all large transactions.
 * Threshold: $500 (50,000 cents).
 */
function generateLargeTransactionChunk(
  transactions: Transaction[],
  categoryLookup: Map<string, { name: string; groupName: string; isIncome: boolean }>
): KnowledgeChunk[] {
  const large = transactions
    .filter((tx) => !tx.transfer_id && Math.abs(tx.amount) >= LARGE_TRANSACTION_THRESHOLD_CENTS)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  if (large.length === 0) return [];

  const lines = large.map((tx) => {
    const catInfo = tx.category ? categoryLookup.get(tx.category) : null;
    const catLabel = catInfo ? ` (${catInfo.name})` : '';
    const payee = tx.payee_name || 'Unknown';
    return `- ${tx.date}: ${centsToDisplay(tx.amount)} to ${payee}${catLabel}`;
  });

  const text =
    `Large Transactions (Last 6 Months)\n\n` +
    `Transactions over ${centsToDisplay(LARGE_TRANSACTION_THRESHOLD_CENTS)}:\n` +
    lines.join('\n');

  return [
    {
      id: 'tx-large-0',
      text,
      source: 'transaction',
      guideUri: '',
      guideName: '',
      sectionHeading: 'Large Transactions',
      chunkIndex: 0,
    },
  ];
}

/**
 * Generate category group trend chunks.
 * One chunk per expense group, showing monthly totals and average.
 */
function generateCategoryGroupTrendChunks(
  transactions: Transaction[],
  categoryLookup: Map<string, { name: string; groupName: string; isIncome: boolean }>
): KnowledgeChunk[] {
  // Reason: Group by categoryGroup → month, tracking per-category averages
  const groups = new Map<string, { months: Map<string, number>; categories: Map<string, number> }>();

  for (const tx of transactions) {
    if (!tx.category || tx.transfer_id) continue;
    const catInfo = categoryLookup.get(tx.category);
    if (!catInfo || catInfo.isIncome) continue;
    if (tx.amount >= 0) continue;

    const { year, month } = parseYearMonth(tx.date);
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;

    if (!groups.has(catInfo.groupName)) {
      groups.set(catInfo.groupName, { months: new Map(), categories: new Map() });
    }
    const data = groups.get(catInfo.groupName)!;
    data.months.set(monthKey, (data.months.get(monthKey) || 0) + Math.abs(tx.amount));
    data.categories.set(catInfo.name, (data.categories.get(catInfo.name) || 0) + Math.abs(tx.amount));
  }

  const chunks: KnowledgeChunk[] = [];
  let chunkIndex = 0;

  for (const [groupName, data] of groups) {
    const sortedMonths = sortMonthKeys([...data.months.keys()]);
    if (sortedMonths.length === 0) continue;

    const firstMonth = parseYearMonth(`${sortedMonths[0]}-01`);
    const lastMonth = parseYearMonth(`${sortedMonths[sortedMonths.length - 1]}-01`);
    const dateRange = `${formatMonthShort(firstMonth.month)} ${firstMonth.year}–${formatMonthShort(lastMonth.month)} ${lastMonth.year}`;

    const monthlyLine = sortedMonths
      .map((mk) => {
        const m = parseYearMonth(`${mk}-01`);
        return `${formatMonthShort(m.month)}: ${centsToDisplay(data.months.get(mk)!)}`;
      })
      .join(' | ');

    const totalAll = [...data.months.values()].reduce((sum, v) => sum + v, 0);
    const avg = centsToDisplay(Math.round(totalAll / sortedMonths.length));

    const catBreakdown = [...data.categories.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, total]) => `${name} (avg ${centsToDisplay(Math.round(total / sortedMonths.length))})`)
      .join(', ');

    const text =
      `Spending Trend — ${groupName} (${dateRange})\n\n` +
      `${monthlyLine}\n` +
      `${sortedMonths.length}-month avg: ${avg}/month.\n` +
      `Categories: ${catBreakdown}.`;

    chunks.push({
      id: `tx-trend-${chunkIndex}`,
      text,
      source: 'transaction',
      guideUri: '',
      guideName: '',
      sectionHeading: `Trend — ${groupName}`,
      chunkIndex: chunkIndex++,
    });
  }

  return chunks;
}

/**
 * Generate a recurring payee detection chunk.
 * Lists payees appearing in 4+ of the covered months.
 */
function generateRecurringPayeeChunk(
  transactions: Transaction[],
  categoryLookup: Map<string, { name: string; groupName: string; isIncome: boolean }>
): KnowledgeChunk[] {
  // Reason: Track which months each payee appears in, plus average amount
  const payeeData = new Map<string, { months: Set<string>; totalAmount: number; count: number; category: string }>();
  const allMonths = new Set<string>();

  for (const tx of transactions) {
    if (!tx.payee_name || tx.transfer_id) continue;
    if (tx.amount >= 0) continue; // spending only

    const { year, month } = parseYearMonth(tx.date);
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    allMonths.add(monthKey);

    if (!payeeData.has(tx.payee_name)) {
      const catInfo = tx.category ? categoryLookup.get(tx.category) : null;
      payeeData.set(tx.payee_name, {
        months: new Set(),
        totalAmount: 0,
        count: 0,
        category: catInfo?.groupName || 'Uncategorized',
      });
    }
    const data = payeeData.get(tx.payee_name)!;
    data.months.add(monthKey);
    data.totalAmount += Math.abs(tx.amount);
    data.count += 1;
  }

  const totalMonths = allMonths.size;
  const recurring = [...payeeData.entries()]
    .filter(([, data]) => data.months.size >= RECURRING_PAYEE_MIN_MONTHS)
    .sort((a, b) => b[1].totalAmount - a[1].totalAmount);

  if (recurring.length === 0) return [];

  const lines = recurring.map(([name, data]) => {
    const avgPerMonth = centsToDisplay(Math.round(data.totalAmount / data.months.size));
    return `- ${name}: ${avgPerMonth}/month, ${data.months.size}/${totalMonths} months (${data.category})`;
  });

  const text =
    `Recurring Expenses (Last 6 Months)\n\n` +
    `Payees appearing in ${RECURRING_PAYEE_MIN_MONTHS}+ months:\n` +
    lines.join('\n');

  return [
    {
      id: 'tx-recurring-0',
      text,
      source: 'transaction',
      guideUri: '',
      guideName: '',
      sectionHeading: 'Recurring Expenses',
      chunkIndex: 0,
    },
  ];
}

// ── Main export ────────────────────────────────────────────────────

/**
 * Aggregate transactions into semantic knowledge chunks.
 *
 * @param transactions - Enriched transactions (with payee_name, category_name)
 * @param categories - All budget categories
 * @param categoryGroups - All category groups
 * @param accounts - All accounts
 * @returns Array of transaction-derived knowledge chunks
 */
export function chunkTransactions(
  transactions: Transaction[],
  categories: Category[],
  categoryGroups: CategoryGroup[],
  _accounts: Account[]
): KnowledgeChunk[] {
  if (transactions.length === 0) return [];

  const categoryLookup = buildCategoryLookup(categories, categoryGroups);

  return [
    ...generateMonthlyCategoryChunks(transactions, categoryLookup),
    ...generateMonthlyIncomeChunks(transactions, categoryLookup),
    ...generateMonthlyOverviewChunks(transactions, categoryLookup),
    ...generateLargeTransactionChunk(transactions, categoryLookup),
    ...generateCategoryGroupTrendChunks(transactions, categoryLookup),
    ...generateRecurringPayeeChunk(transactions, categoryLookup),
  ];
}
