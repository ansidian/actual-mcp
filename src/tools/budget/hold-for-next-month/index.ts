// ----------------------------
// HOLD FOR NEXT MONTH TOOL
// ----------------------------

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { success, errorFromCatch } from '../../../utils/response.js';
import { holdForNextMonth } from '../../../actual-api.js';
import type { ToolInput } from '../../../types.js';

const HoldForNextMonthArgsSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .describe('The current month in YYYY-MM format (e.g., "2026-02"). Funds will be held for the following month.'),
  amount: z
    .number()
    .describe(
      'The amount in cents to hold for next month. ' +
        'For example, to hold $400 for next month, pass 40000. ' +
        "This moves money from the current month's To Budget into the next month."
    ),
});

type HoldForNextMonthArgs = z.infer<typeof HoldForNextMonthArgsSchema>;

export const schema = {
  name: 'hold-for-next-month',
  description:
    "Hold an amount from the current month's To Budget for next month. " +
    'Used for the month-ahead budgeting strategy — income received this month ' +
    'is held and budgeted next month instead. Amount is in cents.',
  inputSchema: zodToJsonSchema(HoldForNextMonthArgsSchema) as ToolInput,
};

export async function handler(args: HoldForNextMonthArgs): Promise<CallToolResult> {
  try {
    const v = HoldForNextMonthArgsSchema.parse(args);
    await holdForNextMonth(v.month, v.amount);
    const dollars = (v.amount / 100).toFixed(2);
    return success(`Held $${dollars} from ${v.month} for next month`);
  } catch (err) {
    return errorFromCatch(err);
  }
}
