// ----------------------------
// SET NOTE TOOL
// ----------------------------

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { success, errorFromCatch } from '../../../utils/response.js';
import { setNote } from '../../../actual-api.js';
import type { ToolInput } from '../../../types.js';

const SetNoteArgsSchema = z.object({
  id: z.string().describe('The entity ID (usually a category UUID) to set the note on'),
  note: z
    .string()
    .describe(
      'The full note text. For budget templates, use lines starting with #template or #goal. ' +
        'Multiple template lines can be stacked. Examples: ' +
        '"#template 50" (fixed $50/mo), ' +
        '"#template schedule Internet" (match schedule), ' +
        '"#template up to 150" (refill to $150), ' +
        '"#template-1 average 3 months" (priority 1, average spending). ' +
        'WARNING: This replaces the entire note content for this entity.'
    ),
});

type SetNoteArgs = z.infer<typeof SetNoteArgsSchema>;

export const schema = {
  name: 'set-note',
  description:
    'Set/update a note for a category or other entity. Notes store budget template directives. ' +
    'WARNING: This replaces the entire note. To preserve existing content, ' +
    'read the note first with get-notes, modify it, then write it back.',
  inputSchema: zodToJsonSchema(SetNoteArgsSchema) as ToolInput,
};

export async function handler(args: SetNoteArgs): Promise<CallToolResult> {
  try {
    const v = SetNoteArgsSchema.parse(args);
    await setNote(v.id, v.note);
    return success(`Set note for entity ${v.id}`);
  } catch (err) {
    return errorFromCatch(err);
  }
}
