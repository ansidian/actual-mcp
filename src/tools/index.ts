// ----------------------------
// TOOLS
// ----------------------------

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { initActualApi, shutdownActualApi } from '../actual-api.js';
import { error, errorFromCatch } from '../utils/response.js';

import * as balanceHistory from './balance-history/index.js';
import * as createCategoryGroup from './categories/create-category-group/index.js';
import * as createCategory from './categories/create-category/index.js';
import * as deleteCategoryGroup from './categories/delete-category-group/index.js';
import * as deleteCategory from './categories/delete-category/index.js';
import * as getGroupedCategories from './categories/get-grouped-categories/index.js';
import * as updateCategoryGroup from './categories/update-category-group/index.js';
import * as updateCategory from './categories/update-category/index.js';
import * as getAccounts from './get-accounts/index.js';
import * as getTransactions from './get-transactions/index.js';
import * as monthlySummary from './monthly-summary/index.js';
import * as createPayee from './payees/create-payee/index.js';
import * as deletePayee from './payees/delete-payee/index.js';
import * as getPayees from './payees/get-payees/index.js';
import * as updatePayee from './payees/update-payee/index.js';
import * as createRule from './rules/create-rule/index.js';
import * as deleteRule from './rules/delete-rule/index.js';
import * as getRules from './rules/get-rules/index.js';
import * as updateRule from './rules/update-rule/index.js';
import * as spendingByCategory from './spending-by-category/index.js';
import * as deleteTransaction from './delete-transaction/index.js';
import * as updateTransaction from './update-transaction/index.js';
import * as createTransaction from './create-transaction/index.js';
import * as runBankSync from './run-bank-sync/index.js';
import * as getSchedules from './schedules/get-schedules/index.js';
import * as createSchedule from './schedules/create-schedule/index.js';
import * as updateSchedule from './schedules/update-schedule/index.js';
import * as deleteSchedule from './schedules/delete-schedule/index.js';
import * as getNotes from './notes/get-notes/index.js';
import * as setNote from './notes/set-note/index.js';
import * as getBudgetMonth from './get-budget-month/index.js';
import * as setBudgetAmount from './budget/set-budget-amount/index.js';
import * as holdForNextMonth from './budget/hold-for-next-month/index.js';
import * as getGuide from './guides/get-guide/index.js';
import * as queryKnowledge from './knowledge/query-knowledge/index.js';

const readTools = [
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

const writeTools = [
  createCategory,
  updateCategory,
  deleteCategory,
  createCategoryGroup,
  updateCategoryGroup,
  deleteCategoryGroup,
  createPayee,
  updatePayee,
  deletePayee,
  createRule,
  updateRule,
  deleteRule,
  updateTransaction,
  deleteTransaction,
  createTransaction,
  runBankSync,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  setNote,
  setBudgetAmount,
  holdForNextMonth,
];

export const setupTools = (server: Server, enableWrite: boolean): void => {
  // Selecting available tools based on permissions
  const allTools = enableWrite ? [...readTools, ...writeTools] : readTools;

  /**
   * Handler for listing available tools
   */
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return {
      tools: allTools.map((tool) => tool.schema),
    };
  });

  /**
   * Handler for calling tools
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = allTools.find((t) => t.schema.name === name);

    if (!tool) {
      return error(`Unknown tool ${name}`);
    }

    // Skip Actual API init/shutdown for tools that don't need it (e.g., query-knowledge)
    const needsApi = !('requiresApi' in tool.schema && tool.schema.requiresApi === false);

    try {
      if (needsApi) {
        await initActualApi();
      }

      // @ts-expect-error: Argument type is handled by Zod schema validation
      return tool.handler(args);
    } catch (err) {
      const errMsg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null
            ? JSON.stringify(err)
            : String(err);
      console.error(`Error executing tool ${name}: ${errMsg}`);
      return errorFromCatch(err);
    } finally {
      if (needsApi) {
        await shutdownActualApi();
      }
    }
  });
};
