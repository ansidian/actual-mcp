// ----------------------------
// GET SCHEDULES TOOL
// ----------------------------

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { successWithJson, errorFromCatch } from '../../../utils/response.js';
import { fetchAllSchedules } from '../../../core/data/fetch-schedules.js';
import type { ToolInput } from '../../../types.js';

const GetSchedulesArgsSchema = z.object({
  includeCompleted: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to include completed schedules. Defaults to false.'),
});

type GetSchedulesArgs = z.infer<typeof GetSchedulesArgsSchema>;

export const schema = {
  name: 'get-schedules',
  description:
    'Retrieve all schedules with their conditions (amount, recurrence, next date). ' +
    'Amounts are in cents (negative = expense). ' +
    'Each schedule includes its rule conditions showing date recurrence and amount.',
  inputSchema: zodToJsonSchema(GetSchedulesArgsSchema) as ToolInput,
};

export async function handler(args: GetSchedulesArgs): Promise<CallToolResult> {
  try {
    const validatedArgs = GetSchedulesArgsSchema.parse(args);
    let schedules = await fetchAllSchedules();

    if (!validatedArgs.includeCompleted) {
      schedules = schedules.filter((s) => !s.completed);
    }

    return successWithJson(schedules);
  } catch (err) {
    return errorFromCatch(err);
  }
}
