// ----------------------------
// UPDATE SCHEDULE TOOL
// ----------------------------

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { success, errorFromCatch } from '../../../utils/response.js';
import { updateScheduleConditions } from '../../../actual-api.js';
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
  conditions: z
    .array(ConditionSchema)
    .describe(
      'Full set of conditions to replace existing ones. ' +
        'Typically includes a date condition and an amount condition.'
    ),
});

type UpdateScheduleArgs = z.infer<typeof UpdateScheduleArgsSchema>;

export const schema = {
  name: 'update-schedule',
  description:
    "Update a schedule's conditions (amount, recurrence). " +
    'Provide the full set of conditions (date + amount) as they replace all existing ones.',
  inputSchema: zodToJsonSchema(UpdateScheduleArgsSchema) as ToolInput,
};

export async function handler(args: UpdateScheduleArgs): Promise<CallToolResult> {
  try {
    const v = UpdateScheduleArgsSchema.parse(args);
    await updateScheduleConditions(
      v.id,
      v.conditions as Array<{ op: string; field: string; value: unknown }>
    );
    return success(`Updated schedule ${v.id}`);
  } catch (err) {
    return errorFromCatch(err);
  }
}
