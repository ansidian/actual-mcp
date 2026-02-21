// ----------------------------
// DELETE SCHEDULE TOOL
// ----------------------------

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { success, errorFromCatch } from '../../../utils/response.js';
import { deleteSchedule } from '../../../actual-api.js';
import type { ToolInput } from '../../../types.js';

const DeleteScheduleArgsSchema = z.object({
  id: z.string().describe('The schedule ID to delete (UUID format)'),
});

type DeleteScheduleArgs = z.infer<typeof DeleteScheduleArgsSchema>;

export const schema = {
  name: 'delete-schedule',
  description: 'Delete a schedule by ID. This is permanent.',
  inputSchema: zodToJsonSchema(DeleteScheduleArgsSchema) as ToolInput,
};

export async function handler(args: DeleteScheduleArgs): Promise<CallToolResult> {
  try {
    const v = DeleteScheduleArgsSchema.parse(args);
    await deleteSchedule(v.id);
    return success(`Deleted schedule ${v.id}`);
  } catch (err) {
    return errorFromCatch(err);
  }
}
