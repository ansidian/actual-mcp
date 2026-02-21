// ----------------------------
// GET BUDGET MONTH TOOL
// ----------------------------

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { successWithJson, errorFromCatch } from '../../utils/response.js';
import { fetchBudgetMonth } from '../../core/data/fetch-budget-month.js';
import type { ToolInput } from '../../types.js';

const GetBudgetMonthArgsSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format')
    .describe('The month to retrieve budget data for, in YYYY-MM format (e.g., "2026-02")'),
});

type GetBudgetMonthArgs = z.infer<typeof GetBudgetMonthArgsSchema>;

export const schema = {
  name: 'get-budget-month',
  description:
    'Get budget data for a specific month. Returns toBudget amount, ' +
    'category-level budgeted/spent/balance breakdowns grouped by category group. ' +
    'Amounts are in cents.',
  inputSchema: zodToJsonSchema(GetBudgetMonthArgsSchema) as ToolInput,
};

export async function handler(args: GetBudgetMonthArgs): Promise<CallToolResult> {
  try {
    const v = GetBudgetMonthArgsSchema.parse(args);
    const data = await fetchBudgetMonth(v.month);
    return successWithJson(data);
  } catch (err) {
    return errorFromCatch(err);
  }
}
