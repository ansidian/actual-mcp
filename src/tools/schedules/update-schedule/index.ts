// ----------------------------
// UPDATE SCHEDULE TOOL
// ----------------------------

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { success, errorFromCatch } from '../../../utils/response.js';
import { updateSchedule } from '../../../actual-api.js';
import type { ToolInput } from '../../../types.js';

const ConditionSchema = z.object({
  op: z.string().describe('Operator: "is" or "isapprox"'),
  field: z.string().describe('Field: "date" or "amount"'),
  value: z
    .any()
    .refine((v) => v !== undefined, { message: 'value is required' })
    .describe(
      'Condition value. For date: recurrence object with start, interval, frequency, patterns, etc. ' +
        'For amount: integer in cents (negative for expense).'
    ),
});

const UpdateScheduleArgsSchema = z.object({
  id: z.string().describe('The schedule ID to update (UUID format)'),
  name: z.string().optional().describe('New name for the schedule. If omitted, the name is unchanged.'),
  conditions: z
    .array(ConditionSchema)
    .optional()
    .describe(
      'Full set of conditions to replace existing ones. ' +
        'Typically includes a date condition and an amount condition. ' +
        'If omitted, conditions are unchanged.'
    ),
});

type UpdateScheduleArgs = z.infer<typeof UpdateScheduleArgsSchema>;

export const schema = {
  name: 'update-schedule',
  description:
    "Update a schedule's name and/or conditions (amount, recurrence). " +
    'Provide the full set of conditions (date + amount) as they replace all existing ones.',
  inputSchema: zodToJsonSchema(UpdateScheduleArgsSchema) as ToolInput,
};

export async function handler(args: UpdateScheduleArgs): Promise<CallToolResult> {
  try {
    const v = UpdateScheduleArgsSchema.parse(args);
    await updateSchedule(v.id, {
      name: v.name,
      conditions: v.conditions as Array<{ op: string; field: string; value: unknown }>,
    });
    const parts = [];
    if (v.name) parts.push(`renamed to "${v.name}"`);
    if (v.conditions) parts.push('conditions updated');
    return success(`Schedule ${v.id}: ${parts.join(', ') || 'no changes'}`);
  } catch (err) {
    return errorFromCatch(err);
  }
}
