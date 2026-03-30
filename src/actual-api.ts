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

/**
 * Each MCP server instance gets its own data directory to avoid SQLite lock
 * conflicts on Windows when multiple clients (VS Code, Claude Desktop) run
 * simultaneously. The dir is cleaned up on shutdown, and stale dirs from
 * crashed processes are cleaned up on next startup.
 */
function createInstanceDataDir(): string {
  const base = process.env.ACTUAL_DATA_DIR || DEFAULT_DATA_DIR;
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }

  // Clean up orphaned instance dirs from crashed processes
  for (const entry of fs.readdirSync(base)) {
    if (!entry.startsWith('instance-')) continue;
    const pid = Number(entry.split('-')[1]);
    if (isNaN(pid) || !isProcessRunning(pid)) {
      try {
        fs.rmSync(path.join(base, entry), { recursive: true, force: true });
      } catch {
        // Another instance may be cleaning the same dir — ignore
      }
    }
  }

  const instanceDir = path.join(base, `instance-${process.pid}`);
  fs.mkdirSync(instanceDir, { recursive: true });
  return instanceDir;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Resolves when initActualApi() completes. Tool calls await this before executing.
let apiReady: Promise<void>;
let resolveApiReady: () => void;
let rejectApiReady: (err: Error) => void;
apiReady = new Promise((resolve, reject) => {
  resolveApiReady = resolve;
  rejectApiReady = reject;
});

// Guard against concurrent initActualApi() calls — only the first one runs.
let initStarted = false;

// Track the per-process instance data dir for cleanup on shutdown.
let instanceDataDir: string | null = null;

/**
 * Wait for the API to be initialized. Called by tool handlers before executing.
 */
export function waitForApi(): Promise<void> {
  return apiReady;
}

/**
 * Verify that a budget is actually loaded by attempting a lightweight query.
 * downloadBudget can silently fail (resolve without throwing) when migrations
 * are out of sync, leaving getPrefs() === null and queries broken.
 */
async function verifyBudgetLoaded(): Promise<boolean> {
  try {
    // getAccounts is lightweight and will throw if no budget is open
    await api.getAccounts();
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize the Actual Budget API.
 * Called once at server startup — the connection stays open for the process lifetime.
 * Automatically recovers from out-of-sync errors by clearing the local cache and retrying.
 */
export async function initActualApi(): Promise<void> {
  // Only the first caller runs init; subsequent callers wait on the same promise.
  if (initStarted) return apiReady;
  initStarted = true;

  console.error('Initializing Actual Budget API...');

  // Each instance gets its own data dir — avoids SQLite EPERM lock conflicts
  // on Windows when multiple clients (VS Code, Claude Desktop) run at once.
  // Always starts fresh (empty dir) so there's no stale cache to sync.
  const dataDir = createInstanceDataDir();
  instanceDataDir = dataDir;

  // Catch unhandled rejections from @actual-app/api internals — the library
  // sometimes fires deferred rejections with plain objects (#<Object>) that
  // crash the Node process before our catch blocks can handle them.
  const swallowApiRejection = (reason: unknown) => {
    console.error('Suppressed unhandled rejection during init:', reason);
  };
  process.on('unhandledRejection', swallowApiRejection);

  try {
    await api.init({
      dataDir,
      serverURL: process.env.ACTUAL_SERVER_URL!,
      password: process.env.ACTUAL_PASSWORD!,
    } as any);

    const budgets: BudgetFile[] = await api.getBudgets();
    if (!budgets || budgets.length === 0) {
      throw new Error('No budgets found. Please create a budget in Actual first.');
    }

    const budgetId: string = process.env.ACTUAL_BUDGET_SYNC_ID || budgets[0].cloudFileId || budgets[0].id || '';
    const encryptionOpts = process.env.ACTUAL_BUDGET_ENCRYPTION_PASSWORD
      ? { password: process.env.ACTUAL_BUDGET_ENCRYPTION_PASSWORD }
      : undefined;

    console.error(`Loading budget: ${budgetId}`);
    await api.downloadBudget(budgetId, encryptionOpts);
    const loaded = await verifyBudgetLoaded();

    if (!loaded) {
      throw new Error(
        'Budget failed to load after fresh download. The Actual server may have ' +
        'newer migrations than @actual-app/api supports. Try: npm install @actual-app/api@latest'
      );
    }

    console.error('Actual Budget API initialized successfully');
    resolveApiReady();
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    rejectApiReady(error);
    throw error;
  } finally {
    // Remove the safety net after init completes (success or failure)
    process.removeListener('unhandledRejection', swallowApiRejection);
  }
}

/**
 * Lightweight incremental sync — pulls remote changes.
 */
export async function syncBudget(): Promise<void> {
  await api.sync();
}

/**
 * Shutdown the Actual Budget API and clean up the per-process instance directory.
 */
export async function shutdownActualApi(): Promise<void> {
  await api.shutdown();
  if (instanceDataDir) {
    try {
      fs.rmSync(instanceDataDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup — Windows may still hold locks briefly after shutdown
    }
    instanceDataDir = null;
  }
}

// ----------------------------
// FETCH
// ----------------------------

export async function getAccounts(): Promise<APIAccountEntity[]> {
  return api.getAccounts();
}

export async function getCategories(): Promise<APICategoryEntity[]> {
  return api.getCategories() as Promise<APICategoryEntity[]>;
}

export async function getCategoryGroups(): Promise<APICategoryGroupEntity[]> {
  return api.getCategoryGroups();
}

export async function getPayees(): Promise<APIPayeeEntity[]> {
  return api.getPayees();
}

export async function getTransactions(accountId: string, start: string, end: string): Promise<TransactionEntity[]> {
  return api.getTransactions(accountId, start, end);
}

export async function getRules(): Promise<RuleEntity[]> {
  return api.getRules();
}

// ----------------------------
// ACTION
// ----------------------------

export async function createPayee(args: Record<string, unknown>): Promise<string> {
  return api.createPayee(args as any);
}

export async function updatePayee(id: string, args: Record<string, unknown>): Promise<unknown> {
  return api.updatePayee(id, args);
}

export async function deletePayee(id: string): Promise<unknown> {
  return api.deletePayee(id);
}

export async function createRule(args: Record<string, unknown>): Promise<RuleEntity> {
  return api.createRule(args as any);
}

export async function updateRule(args: Record<string, unknown>): Promise<RuleEntity> {
  return api.updateRule(args as any);
}

export async function deleteRule(id: string): Promise<boolean> {
  return api.deleteRule(id);
}

export async function createCategory(args: Record<string, unknown>): Promise<string> {
  return api.createCategory(args as any);
}

export async function updateCategory(id: string, args: Record<string, unknown>): Promise<unknown> {
  return api.updateCategory(id, args);
}

export async function deleteCategory(id: string): Promise<{ error?: string }> {
  return api.deleteCategory(id) as any;
}

export async function createCategoryGroup(args: Record<string, unknown>): Promise<string> {
  return api.createCategoryGroup(args as any);
}

export async function updateCategoryGroup(id: string, args: Record<string, unknown>): Promise<unknown> {
  return api.updateCategoryGroup(id, args);
}

export async function deleteCategoryGroup(id: string): Promise<unknown> {
  return api.deleteCategoryGroup(id);
}

export async function createTransaction(accountId: string, data: TransactionData): Promise<string> {
  return api.addTransactions(accountId, [data], { runTransfers: true });
}

/**
 * Import a list of transactions using Actual's reconciliation logic.
 * Deduplicates via imported_id and optionally supports dry-run validation.
 */
export async function importTransactions(
  accountId: string,
  transactions: unknown[],
  opts?: { defaultCleared?: boolean; dryRun?: boolean }
): Promise<{ added: string[]; updated: string[]; errors: Array<{ message: string }> }> {
  return api.importTransactions(accountId, transactions as any, opts);
}

export async function updateTransaction(id: string, data: UpdateTransactionData): Promise<unknown> {
  return api.updateTransaction(id, data as any);
}

export async function deleteTransaction(id: string): Promise<unknown> {
  return api.deleteTransaction(id);
}

// ----------------------------
// SCHEDULES
// ----------------------------

/**
 * Get all schedules from the schedules table
 */
export async function getSchedules(): Promise<unknown[]> {
  const result = await api.runQuery(api.q('schedules').select(['id', 'name', 'rule', 'next_date', 'completed']));
  return (result as { data: unknown[] }).data;
}

/**
 * Get a rule's conditions by rule ID.
 * Schedule conditions are stored as rule conditions.
 */
export async function getRuleById(ruleId: string): Promise<RuleEntity | undefined> {
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
  await api.internal.send('schedule/delete', { id });
}

// ----------------------------
// NOTES
// ----------------------------

/**
 * Get notes for all entities or a specific entity.
 */
export async function getNotes(entityId?: string): Promise<Array<{ id: string; note: string }>> {
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
  await api.internal.send('notes-save', { id, note });
}

// ----------------------------
// BUDGET MONTH
// ----------------------------

/**
 * Get budget month data including category breakdowns.
 */
export async function getBudgetMonth(month: string): Promise<unknown> {
  return api.getBudgetMonth(month);
}

/**
 * Set the budgeted amount for a category in a specific month.
 *
 * @param month - Month in YYYY-MM format
 * @param categoryId - Category UUID
 * @param amount - Amount in cents (the absolute budgeted value, not a delta)
 */
export async function setBudgetAmount(month: string, categoryId: string, amount: number): Promise<void> {
  await api.setBudgetAmount(month, categoryId, amount);
}

/**
 * Hold an amount from To Budget for next month.
 *
 * @param month - Current month in YYYY-MM format
 * @param amount - Amount in cents to hold for next month
 */
export async function holdForNextMonth(month: string, amount: number): Promise<void> {
  await api.internal.send('api/budget-hold-for-next-month', { month, amount });
}

// ----------------------------
// BANK SYNC
// ----------------------------

/**
 * Run bank sync for accounts.
 *
 * @param accountId - Optional. Specific account ID, or special value:
 *   - "onbudget": sync all on-budget linked accounts
 *   - "offbudget": sync all off-budget linked accounts
 *   - undefined: sync ALL linked accounts
 */
export async function runBankSync(accountId?: string): Promise<void> {
  // API expects { accountId } object or undefined for all accounts
  return api.runBankSync(accountId ? { accountId } : undefined);
}
