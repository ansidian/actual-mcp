import api from '@actual-app/api';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BudgetFile, TransactionData, UpdateTransactionData } from './types.js';
import {
  APIAccountEntity,
  APICategoryEntity,
  APICategoryGroupEntity,
  APIPayeeEntity,
} from '@actual-app/api/@types/loot-core/src/server/api-models.js';
import { RuleEntity, TransactionEntity } from '@actual-app/api/@types/loot-core/src/types/models/index.js';

const DEFAULT_DATA_DIR: string = path.resolve(os.homedir() || '.', '.actual');

// API initialization state
let initialized = false;
let initializing = false;
let initializationError: Error | null = null;

/**
 * Initialize the Actual Budget API
 */
export async function initActualApi(): Promise<void> {
  if (initialized) return;
  if (initializing) {
    // Wait for initialization to complete if already in progress
    while (initializing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (initializationError) throw initializationError;
    return;
  }

  initializing = true;
  try {
    console.error('Initializing Actual Budget API...');
    const dataDir = process.env.ACTUAL_DATA_DIR || DEFAULT_DATA_DIR;
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    await api.init({
      dataDir,
      serverURL: process.env.ACTUAL_SERVER_URL!,
      password: process.env.ACTUAL_PASSWORD!,
    } as any);

    const budgets: BudgetFile[] = await api.getBudgets();
    if (!budgets || budgets.length === 0) {
      throw new Error('No budgets found. Please create a budget in Actual first.');
    }

    // Use specified budget or the first one
    const budgetId: string = process.env.ACTUAL_BUDGET_SYNC_ID || budgets[0].cloudFileId || budgets[0].id || '';
    console.error(`Loading budget: ${budgetId}`);
    await api.downloadBudget(
      budgetId,
      process.env.ACTUAL_BUDGET_ENCRYPTION_PASSWORD
        ? {
            password: process.env.ACTUAL_BUDGET_ENCRYPTION_PASSWORD,
          }
        : undefined
    );

    initialized = true;
    console.error('Actual Budget API initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Actual Budget API:', error);
    initializationError = error instanceof Error ? error : new Error(String(error));
    throw initializationError;
  } finally {
    initializing = false;
  }
}

/**
 * Shutdown the Actual Budget API
 */
export async function shutdownActualApi(): Promise<void> {
  if (!initialized) return;
  await api.shutdown();
  initialized = false;
}

// ----------------------------
// FETCH
// ----------------------------

/**
 * Get all accounts (ensures API is initialized)
 */
export async function getAccounts(): Promise<APIAccountEntity[]> {
  await initActualApi();
  return api.getAccounts();
}

/**
 * Get all categories (ensures API is initialized)
 */
export async function getCategories(): Promise<APICategoryEntity[]> {
  await initActualApi();
  return api.getCategories() as Promise<APICategoryEntity[]>;
}

/**
 * Get all category groups (ensures API is initialized)
 */
export async function getCategoryGroups(): Promise<APICategoryGroupEntity[]> {
  await initActualApi();
  return api.getCategoryGroups();
}

/**
 * Get all payees (ensures API is initialized)
 */
export async function getPayees(): Promise<APIPayeeEntity[]> {
  await initActualApi();
  return api.getPayees();
}

/**
 * Get transactions for a specific account and date range (ensures API is initialized)
 */
export async function getTransactions(accountId: string, start: string, end: string): Promise<TransactionEntity[]> {
  await initActualApi();
  return api.getTransactions(accountId, start, end);
}

/**
 * Get all rules (ensures API is initialized)
 */
export async function getRules(): Promise<RuleEntity[]> {
  await initActualApi();
  return api.getRules();
}

// ----------------------------
// ACTION
// ----------------------------

/**
 * Create a new payee (ensures API is initialized)
 */
export async function createPayee(args: Record<string, unknown>): Promise<string> {
  await initActualApi();
  return api.createPayee(args as any);
}

/**
 * Update a payee (ensures API is initialized)
 */
export async function updatePayee(id: string, args: Record<string, unknown>): Promise<unknown> {
  await initActualApi();
  return api.updatePayee(id, args);
}

/**
 * Delete a payee (ensures API is initialized)
 */
export async function deletePayee(id: string): Promise<unknown> {
  await initActualApi();
  return api.deletePayee(id);
}

/**
 * Create a new rule (ensures API is initialized)
 */
export async function createRule(args: Record<string, unknown>): Promise<RuleEntity> {
  await initActualApi();
  return api.createRule(args as any);
}

/**
 * Update a rule (ensures API is initialized)
 */
export async function updateRule(args: Record<string, unknown>): Promise<RuleEntity> {
  await initActualApi();
  return api.updateRule(args as any);
}

/**
 * Delete a rule (ensures API is initialized)
 */
export async function deleteRule(id: string): Promise<boolean> {
  await initActualApi();
  return api.deleteRule(id);
}

/**
 * Create a new category (ensures API is initialized)
 */
export async function createCategory(args: Record<string, unknown>): Promise<string> {
  await initActualApi();
  return api.createCategory(args as any);
}

/**
 * Update a category (ensures API is initialized)
 */
export async function updateCategory(id: string, args: Record<string, unknown>): Promise<unknown> {
  await initActualApi();
  return api.updateCategory(id, args);
}

/**
 * Delete a category (ensures API is initialized)
 */
export async function deleteCategory(id: string): Promise<{ error?: string }> {
  await initActualApi();
  return api.deleteCategory(id);
}

/**
 * Create a new category group (ensures API is initialized)
 */
export async function createCategoryGroup(args: Record<string, unknown>): Promise<string> {
  await initActualApi();
  return api.createCategoryGroup(args as any);
}

/**
 * Update a category group (ensures API is initialized)
 */
export async function updateCategoryGroup(id: string, args: Record<string, unknown>): Promise<unknown> {
  await initActualApi();
  return api.updateCategoryGroup(id, args);
}

/**
 * Delete a category group (ensures API is initialized)
 */
export async function deleteCategoryGroup(id: string): Promise<unknown> {
  await initActualApi();
  return api.deleteCategoryGroup(id);
}

/**
 * Create a transaction (ensures API is initialized)
 */
export async function createTransaction(accountId: string, data: TransactionData): Promise<string> {
  await initActualApi();
  return api.addTransactions(accountId, [data]);
}

/**
 * Update a transaction (ensures API is initialized)
 */
export async function updateTransaction(id: string, data: UpdateTransactionData): Promise<unknown> {
  await initActualApi();
  return api.updateTransaction(id, data as any);
}

/**
 * Delete a transaction (ensures API is initialized)
 */
export async function deleteTransaction(id: string): Promise<unknown> {
  await initActualApi();
  return api.deleteTransaction(id);
}

// ----------------------------
// SCHEDULES
// ----------------------------

/**
 * Get all schedules from the schedules table
 */
export async function getSchedules(): Promise<unknown[]> {
  await initActualApi();
  const result = await api.runQuery(api.q('schedules').select(['id', 'name', 'rule', 'next_date', 'completed']));
  return (result as { data: unknown[] }).data;
}

/**
 * Get a rule's conditions by rule ID.
 * Schedule conditions are stored as rule conditions.
 */
export async function getRuleById(ruleId: string): Promise<RuleEntity | undefined> {
  await initActualApi();
  const rules = await api.getRules();
  return rules.find((r: RuleEntity) => r.id === ruleId);
}

/**
 * Create a new schedule. Uses api.createSchedule() for the initial record,
 * then api.internal.send('schedule/update') to fix amount and recurrence
 * since createSchedule alone doesn't reliably set these fields.
 */
export async function createScheduleWithConditions(
  name: string,
  date: string,
  amount: number,
  conditions: Array<{ op: string; field: string; value: unknown }>
): Promise<string> {
  await initActualApi();
  const id: string = await api.createSchedule({ name, date, amount } as any);
  await api.internal.send('schedule/update', { schedule: { id }, conditions });
  return id;
}

/**
 * Update a schedule's name and/or conditions (amount, date/recurrence).
 * api.updateSchedule() throws "Unknown operator: id", so we must
 * use internal.send instead.
 */
export async function updateSchedule(
  id: string,
  options: {
    name?: string;
    conditions?: Array<{ op: string; field: string; value: unknown }>;
  }
): Promise<void> {
  await initActualApi();
  const schedule: Record<string, unknown> = { id };
  if (options.name !== undefined) schedule.name = options.name;
  await api.internal.send('schedule/update', {
    schedule,
    conditions: options.conditions ?? [],
  });
}

/**
 * Delete a schedule by ID.
 */
export async function deleteSchedule(id: string): Promise<void> {
  await initActualApi();
  await api.internal.send('schedule/delete', { id });
}

// ----------------------------
// NOTES
// ----------------------------

/**
 * Get notes for all entities or a specific entity.
 */
export async function getNotes(entityId?: string): Promise<Array<{ id: string; note: string }>> {
  await initActualApi();
  let query = api.q('notes').select(['id', 'note']);
  if (entityId) {
    query = query.filter({ id: entityId });
  }
  const result = await api.runQuery(query);
  return (result as { data: Array<{ id: string; note: string }> }).data;
}

/**
 * Set a note for an entity (category, account, etc).
 */
export async function setNote(id: string, note: string): Promise<void> {
  await initActualApi();
  await api.internal.send('notes-save', { id, note });
}

// ----------------------------
// BUDGET MONTH
// ----------------------------

/**
 * Get budget month data including category breakdowns.
 */
export async function getBudgetMonth(month: string): Promise<unknown> {
  await initActualApi();
  return api.getBudgetMonth(month);
}

/**
 * Set the budgeted amount for a category in a specific month.
 * This is the core mechanism for moving money between categories.
 *
 * @param month - Month in YYYY-MM format
 * @param categoryId - Category UUID
 * @param amount - Amount in cents (the absolute budgeted value, not a delta)
 */
export async function setBudgetAmount(month: string, categoryId: string, amount: number): Promise<void> {
  await initActualApi();
  await api.setBudgetAmount(month, categoryId, amount);
}

/**
 * Hold an amount from To Budget for next month.
 * Used for the month-ahead budgeting strategy.
 *
 * @param month - Current month in YYYY-MM format
 * @param amount - Amount in cents to hold for next month
 */
export async function holdForNextMonth(month: string, amount: number): Promise<void> {
  await initActualApi();
  await api.internal.send('api/budget-hold-for-next-month', { month, amount });
}

// ----------------------------
// BANK SYNC
// ----------------------------

/**
 * Run bank sync for accounts (ensures API is initialized)
 *
 * @param accountId - Optional. Specific account ID, or special value:
 *   - "onbudget": sync all on-budget linked accounts
 *   - "offbudget": sync all off-budget linked accounts
 *   - undefined: sync ALL linked accounts
 */
export async function runBankSync(accountId?: string): Promise<void> {
  await initActualApi();
  // API expects { accountId } object or undefined for all accounts
  return api.runBankSync(accountId ? { accountId } : undefined);
}
