// ----------------------------
// TOOLS
// ----------------------------

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { syncBudget, waitForApi } from '../actual-api.js';
import { error, errorFromCatch } from '../utils/response.js';

import * as balanceHistory from './balance-history/index.js';
import * as getGroupedCategories from './categories/get-grouped-categories/index.js';
import * as getAccounts from './get-accounts/index.js';
import * as getTransactions from './get-transactions/index.js';
import * as monthlySummary from './monthly-summary/index.js';
import * as getPayees from './payees/get-payees/index.js';
import * as getRules from './rules/get-rules/index.js';
import * as spendingByCategory from './spending-by-category/index.js';
import * as getSchedules from './schedules/get-schedules/index.js';
import * as getNotes from './notes/get-notes/index.js';
import * as getBudgetMonth from './get-budget-month/index.js';
import * as getGuide from './guides/get-guide/index.js';
import * as queryKnowledge from './knowledge/query-knowledge/index.js';

interface ToolModule {
  schema: { name: string; description: string; inputSchema: unknown };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => Promise<any>;
}

const readTools: ToolModule[] = [
  getTransactions,
  spendingByCategory,
  monthlySummary,
  balanceHistory,
  getAccounts,
  getGroupedCategories,
  getPayees,
  getRules,
  getSchedules,
  getNotes,
  getBudgetMonth,
  queryKnowledge,
  getGuide,
];

// Write tool import paths — loaded on demand when --enable-write is set
const writeToolPaths: string[] = [
  './categories/create-category/index.js',
  './categories/update-category/index.js',
  './categories/delete-category/index.js',
  './categories/create-category-group/index.js',
  './categories/update-category-group/index.js',
  './categories/delete-category-group/index.js',
  './payees/create-payee/index.js',
  './payees/update-payee/index.js',
  './payees/delete-payee/index.js',
  './rules/create-rule/index.js',
  './rules/update-rule/index.js',
  './rules/delete-rule/index.js',
  './update-transaction/index.js',
  './delete-transaction/index.js',
  './create-transaction/index.js',
  './import-transactions/index.js',
  './run-bank-sync/index.js',
  './schedules/create-schedule/index.js',
  './schedules/update-schedule/index.js',
  './schedules/delete-schedule/index.js',
  './notes/set-note/index.js',
  './budget/set-budget-amount/index.js',
  './budget/hold-for-next-month/index.js',
];

async function loadWriteTools(): Promise<ToolModule[]> {
  const modules = await Promise.all(writeToolPaths.map((p) => import(p)));
  return modules as ToolModule[];
}

export const setupTools = (server: Server, enableWrite: boolean): void => {
  // Write tools loaded lazily — null until first access when enableWrite is true
  let writeTools: ToolModule[] | null = null;

  const getAllTools = async (): Promise<ToolModule[]> => {
    if (!enableWrite) return readTools;
    if (!writeTools) {
      writeTools = await loadWriteTools();
    }
    return [...readTools, ...writeTools];
  };

  /**
   * Handler for listing available tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const allTools = await getAllTools();
    return {
      tools: allTools.map((tool) => tool.schema),
    };
  });

  /**
   * Handler for calling tools
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const allTools = await getAllTools();
    const tool = allTools.find((t) => t.schema.name === name);

    if (!tool) {
      return error(`Unknown tool ${name}`);
    }

    try {
      await waitForApi();
      await syncBudget();
      return await tool.handler(args);
    } catch (err) {
      const errMsg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null
            ? JSON.stringify(err)
            : String(err);
      console.error(`Error executing tool ${name}: ${errMsg}`);
      return errorFromCatch(err);
    }
  });
};
