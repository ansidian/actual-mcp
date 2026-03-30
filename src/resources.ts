// ----------------------------
// RESOURCES
// ----------------------------

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import api from '@actual-app/api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import types from types.ts
import { Account, Transaction } from './types.js';
import { formatAmount, formatDate, getDateRange } from './utils.js';
import { initActualApi } from './actual-api.js';
import { fetchAllAccounts } from './core/data/fetch-accounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUIDES_DIR = path.join(__dirname, 'guides');

// Static guide resources
export const GUIDE_RESOURCES = [
  {
    uri: 'actual://guides/month-ahead',
    name: 'Month Ahead Strategy',
    description: "Budgeting strategy: live on last month's income, hold this month's for next month",
    mimeType: 'text/markdown' as const,
  },
  {
    uri: 'actual://guides/user-context',
    name: 'User Financial Context',
    description:
      "How to build the user's financial picture from live budget data — income, debts, priorities, goals, advice style",
    mimeType: 'text/markdown' as const,
  },
  {
    uri: 'actual://guides/spending-decisions',
    name: 'Spending Decision Framework',
    description:
      'How to evaluate "can I afford X?" using envelope budgeting, priority-aware reallocation, and rolling with the punches',
    mimeType: 'text/markdown' as const,
  },
  {
    uri: 'actual://guides/templates',
    name: 'Budget Template Syntax Reference',
    description:
      'Complete reference for all #template and #goal directives — every type, modifier, and variation. Read this BEFORE writing any template via set-note.',
    mimeType: 'text/markdown' as const,
  },
];

// Map guide URIs to their markdown file names
const GUIDE_FILES: Record<string, string> = {
  'actual://guides/month-ahead': 'month-ahead.md',
  'actual://guides/user-context': 'user-context.md',
  'actual://guides/spending-decisions': 'spending-decisions.md',
  'actual://guides/templates': 'templates.md',
};

// Simple in-memory cache — guides are read once from disk, then served from memory
const guideCache = new Map<string, string>();

/**
 * Load guide content from disk on first access, then cache.
 */
export function getGuideContent(uri: string): string | undefined {
  const cached = guideCache.get(uri);
  if (cached) return cached;

  const filename = GUIDE_FILES[uri];
  if (!filename) return undefined;

  const filePath = path.join(GUIDES_DIR, filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  guideCache.set(uri, content);
  return content;
}

/**
 * Load all guide content as a URI→content map. Used by knowledge store for indexing.
 */
export function getAllGuideContent(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const uri of Object.keys(GUIDE_FILES)) {
    const content = getGuideContent(uri);
    if (content) result[uri] = content;
  }
  return result;
}

export const setupResources = (server: Server): void => {
  /**
   * Handler for listing available resources (accounts + guides)
   */
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      await initActualApi();
      const accounts: Account[] = await fetchAllAccounts();
      return {
        resources: [
          ...GUIDE_RESOURCES,
          ...accounts.map((account) => ({
            uri: `actual://accounts/${account.id}`,
            name: account.name,
            description: `${account.name} (${account.type || 'Account'})${account.closed ? ' - CLOSED' : ''}`,
            mimeType: 'text/markdown',
          })),
        ],
      };
    } catch (error) {
      console.error('Error listing resources:', error);
      throw error;
    }
  });

  /**
   * Handler for reading resources (account details and transactions)
   */
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      const uri: string = request.params.uri;

      // Static guide resources — no API connection needed, lazy-loaded from disk
      const guideContent = getGuideContent(uri);
      if (guideContent) {
        return {
          contents: [{ uri, text: guideContent, mimeType: 'text/markdown' }],
        };
      }

      await initActualApi();
      const url = new URL(uri);

      // Parse the path to determine what to return
      const pathParts: string[] = url.pathname.split('/').filter(Boolean);

      // If the path is just "accounts", return list of all accounts
      if (pathParts.length === 0 && url.hostname === 'accounts') {
        const accounts: Account[] = await api.getAccounts();

        const accountsText: string = accounts
          .map((account) => {
            const closed = account.closed ? ' (CLOSED)' : '';
            const offBudget = account.offbudget ? ' (OFF BUDGET)' : '';
            const balance = account.balance !== undefined ? ` - ${formatAmount(account.balance)}` : '';

            return `- ${account.name}${closed}${offBudget}${balance} [ID: ${account.id}]`;
          })
          .join('\n');

        return {
          contents: [
            {
              uri: uri,
              text: `# Actual Budget Accounts\n\n${accountsText}\n\nTotal Accounts: ${accounts.length}`,
              mimeType: 'text/markdown',
            },
          ],
        };
      }

      // If the path is "accounts/{id}", return account details
      if (pathParts.length === 1 && url.hostname === 'accounts') {
        const accountId: string = pathParts[0];
        const accounts: Account[] = await api.getAccounts();
        const account: Account | undefined = accounts.find((a) => a.id === accountId);

        if (!account) {
          return {
            contents: [
              {
                uri: uri,
                text: `Error: Account with ID ${accountId} not found`,
                mimeType: 'text/plain',
              },
            ],
          };
        }

        const balance: number = await api.getAccountBalance(accountId);
        const formattedBalance: string = formatAmount(balance);

        const details = `# Account: ${account.name}

ID: ${account.id}
Type: ${account.type || 'Unknown'}
Balance: ${formattedBalance}
On Budget: ${!account.offbudget}
Status: ${account.closed ? 'Closed' : 'Open'}

To view transactions for this account, use the get-transactions tool.`;

        return {
          contents: [
            {
              uri: uri,
              text: details,
              mimeType: 'text/markdown',
            },
          ],
        };
      }

      // If the path is "accounts/{id}/transactions", return transactions
      if (pathParts.length === 2 && pathParts[1] === 'transactions' && url.hostname === 'accounts') {
        const accountId: string = pathParts[0];
        const { startDate, endDate } = getDateRange();
        const transactions: Transaction[] = await api.getTransactions(accountId, startDate, endDate);

        if (!transactions || transactions.length === 0) {
          return {
            contents: [
              {
                uri: uri,
                text: `No transactions found for account ID ${accountId} between ${startDate} and ${endDate}`,
                mimeType: 'text/plain',
              },
            ],
          };
        }

        // Create a markdown table of transactions
        const header = '| Date | Payee | Category | Amount | Notes |\n| ---- | ----- | -------- | ------ | ----- |\n';
        const rows: string = transactions
          .map((t) => {
            const amount: string = formatAmount(t.amount);
            const date: string = formatDate(t.date);
            const payee: string = t.payee_name || '(No payee)';
            const category: string = t.category_name || '(Uncategorized)';
            const notes: string = t.notes || '';

            return `| ${date} | ${payee} | ${category} | ${amount} | ${notes} |`;
          })
          .join('\n');

        const text = `# Transactions for Account\n\nTime period: ${startDate} to ${endDate}\nTotal Transactions: ${transactions.length}\n\n${header}${rows}`;

        return {
          contents: [
            {
              uri: uri,
              text: text,
              mimeType: 'text/markdown',
            },
          ],
        };
      }

      // If we don't recognize the URI pattern, return an error
      return {
        contents: [
          {
            uri: uri,
            text: `Error: Unrecognized resource URI: ${uri}`,
            mimeType: 'text/plain',
          },
        ],
      };
    } catch (error) {
      console.error('Error reading resource:', error);
      throw error;
    }
  });
};
