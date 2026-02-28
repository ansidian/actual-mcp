// ----------------------------
// GET NOTES TOOL
// ----------------------------

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { successWithJson, errorFromCatch } from '../../../utils/response.js';
import { fetchAllNotes, fetchNoteById } from '../../../core/data/fetch-notes.js';
import type { ToolInput } from '../../../types.js';

const GetNotesArgsSchema = z.object({
  id: z
    .string()
    .optional()
    .describe('Optional entity ID (e.g., category UUID) to get a specific note. ' + 'If omitted, returns all notes.'),
});

type GetNotesArgs = z.infer<typeof GetNotesArgsSchema>;

export const schema = {
  name: 'get-notes',
  description:
    'Get notes for categories or other entities. ' +
    'Notes contain budget template directives (lines starting with #template or #goal). ' +
    'Provide an ID to get a specific note, or omit to get all notes.',
  inputSchema: zodToJsonSchema(GetNotesArgsSchema) as ToolInput,
};

function extractTemplates(note: string | null): string[] {
  if (!note) return [];
  return note
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('#template') || line.startsWith('#goal'));
}

export async function handler(args: GetNotesArgs): Promise<CallToolResult> {
  try {
    const v = GetNotesArgsSchema.parse(args);

    if (v.id) {
      const note = await fetchNoteById(v.id);
      if (!note) {
        return successWithJson({ id: v.id, note: null, templates: [] });
      }
      return successWithJson({ ...note, templates: extractTemplates(note.note) });
    }

    const notes = await fetchAllNotes();
    const enriched = notes.filter((n) => n.note).map((n) => ({ ...n, templates: extractTemplates(n.note) }));
    return successWithJson(enriched);
  } catch (err) {
    return errorFromCatch(err);
  }
}
