// ----------------------------
// CREATE SCHEDULE TOOL
// ----------------------------

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { successWithJson, errorFromCatch } from '../../../utils/response.js';
import { createScheduleWithConditions } from '../../../actual-api.js';
import type { ToolInput } from '../../../types.js';

const RecurrenceSchema = z.object({
  start: z.string().describe('Next occurrence date in YYYY-MM-DD format'),
  interval: z.number().describe('Repeat every N periods'),
  frequency: z.enum(['monthly', 'yearly', 'weekly', 'daily']).describe('Recurrence frequency'),
  patterns: z
    .array(
      z.object({
        type: z.string().describe('Pattern type, e.g. "day" for day-of-month'),
        value: z.number().describe('Pattern value, e.g. -1 for last day of month'),
      })
    )
    .optional()
    .default([])
    .describe('Recurrence patterns, e.g. [{type: "day", value: -1}] for last day of month'),
  skipWeekend: z.boolean().optional().default(false),
  weekendSolveMode: z.enum(['after', 'before']).optional().default('after'),
  endMode: z.enum(['never', 'after_n_occurrences', 'on_date']).optional().default('never'),
  endOccurrences: z.number().optional().default(1),
  endDate: z.string().optional().describe('End date if endMode is on_date, in YYYY-MM-DD format'),
});

const CreateScheduleArgsSchema = z.object({
  name: z.string().describe('Name/identifier for the schedule (e.g., "gas", "internet")'),
  amount: z.number().describe('Amount in cents, negative for expenses (e.g., -11999 for $119.99 expense)'),
  amountOp: z
    .enum(['is', 'isapprox'])
    .optional()
    .default('isapprox')
    .describe('Whether amount must match exactly or approximately. Default: isapprox'),
  dateOp: z
    .enum(['is', 'isapprox'])
    .optional()
    .default('isapprox')
    .describe('Whether date must match exactly or approximately. Default: isapprox'),
  recurrence: RecurrenceSchema.describe('Recurrence configuration for the schedule'),
});

type CreateScheduleArgs = z.infer<typeof CreateScheduleArgsSchema>;

export const schema = {
  name: 'create-schedule',
  description:
    'Create a new recurring schedule (e.g., bill, subscription). ' +
    'Amount is in cents, negative for expenses. ' +
    'Uses internal API to ensure amount and recurrence are set correctly.',
  inputSchema: zodToJsonSchema(CreateScheduleArgsSchema) as ToolInput,
};

export async function handler(args: CreateScheduleArgs): Promise<CallToolResult> {
  try {
    const v = CreateScheduleArgsSchema.parse(args);

    const conditions = [
      {
        op: v.dateOp,
        field: 'date',
        value: {
          start: v.recurrence.start,
          interval: v.recurrence.interval,
          frequency: v.recurrence.frequency,
          patterns: v.recurrence.patterns,
          skipWeekend: v.recurrence.skipWeekend,
          weekendSolveMode: v.recurrence.weekendSolveMode,
          endMode: v.recurrence.endMode,
          endOccurrences: v.recurrence.endOccurrences,
          endDate: v.recurrence.endDate || v.recurrence.start,
        },
      },
      {
        op: v.amountOp,
        field: 'amount',
        value: v.amount,
      },
    ];

    const id = await createScheduleWithConditions(v.name, v.recurrence.start, v.amount, conditions);
    return successWithJson({ message: `Created schedule "${v.name}"`, id });
  } catch (err) {
    return errorFromCatch(err);
  }
}
