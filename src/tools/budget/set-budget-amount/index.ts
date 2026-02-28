// ----------------------------
// SET BUDGET AMOUNT TOOL
// ----------------------------

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { success, errorFromCatch } from '../../../utils/response.js';
import { setBudgetAmount } from '../../../actual-api.js';
import type { ToolInput } from '../../../types.js';

const SetBudgetAmountArgsSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .describe('The month to set the budget for, in YYYY-MM format (e.g., "2026-02")'),
  categoryId: z.string().describe('The category ID (UUID) to set the budget amount for'),
  amount: z
    .number()
    .describe(
      'The budgeted amount in cents. This is the absolute value to set, not a delta. ' +
        'For example, to budget $50 for a category, pass 5000. ' +
        'To move money between categories, read the current budgeted amounts first with get-budget-month, ' +
        'then set new values for both the source and destination categories.'
    ),
});

type SetBudgetAmountArgs = z.infer<typeof SetBudgetAmountArgsSchema>;

export const schema = {
  name: 'set-budget-amount',
  description:
    'Set the budgeted amount for a category in a specific month. ' +
    'Use this to move money between categories (rolling with the punches): ' +
    'decrease the source category and increase the destination. ' +
    'Amount is in cents and is absolute (not a delta) — read current values first with get-budget-month.',
  inputSchema: zodToJsonSchema(SetBudgetAmountArgsSchema) as ToolInput,
};

export async function handler(args: SetBudgetAmountArgs): Promise<CallToolResult> {
  try {
    const v = SetBudgetAmountArgsSchema.parse(args);
    await setBudgetAmount(v.month, v.categoryId, v.amount);
    const dollars = (v.amount / 100).toFixed(2);
    return success(`Set budget amount for category ${v.categoryId} in ${v.month} to $${dollars}`);
  } catch (err) {
    return errorFromCatch(err);
  }
}
