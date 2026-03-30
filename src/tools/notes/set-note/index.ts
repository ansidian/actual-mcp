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
        'CRITICAL: Template amounts are ALWAYS in dollars, not cents. ' +
        '"up to 20" = $20, "#template 50" = $50. Never multiply by 100. ' +
        'CRITICAL: Never use priority 0 (#template without a number) unless explicitly asked. ' +
        'Check existing priorities via get-notes first and place new templates in the appropriate tier. ' +
        'WARNING: This replaces the entire note content for this entity.'
    ),
});

type SetNoteArgs = z.infer<typeof SetNoteArgsSchema>;

export const schema = {
  name: 'set-note',
  description:
    'Set/update a note for a category or other entity. Notes store budget template directives. ' +
    'IMPORTANT: Before writing any #template or #goal directive: ' +
    '(1) Call get-guide with name "templates" for syntax reference. ' +
    '(2) Call get-notes to see ALL existing priorities and find the right tier for the new template. ' +
    'Template amounts are in DOLLARS (not cents) — "up to 20" means $20, never use "up to 2000" for $20. ' +
    'Never default to priority 0 — match the existing priority structure. ' +
    'WARNING: This replaces the entire note. To preserve existing content, ' +
    'read the note first with get-notes, modify it, then write it back.',
  inputSchema: zodToJsonSchema(SetNoteArgsSchema) as ToolInput,
};

/**
 * Detect template amounts that look like they were accidentally written in cents.
 * Templates use dollars — "up to 150" means $150, "#template 50" means $50/mo.
 * If someone writes "up to 7500" intending $75, this catches it.
 */
function detectCentsAmounts(note: string): string[] {
  const warnings: string[] = [];
  const lines = note.split('\n');
  for (const line of lines) {
    if (!line.startsWith('#template') && !line.startsWith('#goal')) continue;

    // Skip lines with [confirmed] marker — user already verified the large amount
    if (line.includes('[confirmed]')) continue;

    // Check "up to <amount>" — most common mistake
    const upToMatch = line.match(/up to (\d+(?:\.\d+)?)/);
    if (upToMatch) {
      const amount = parseFloat(upToMatch[1]);
      if (amount >= 1000 && amount % 100 === 0) {
        warnings.push(
          `"${line}" sets a cap of $${amount.toLocaleString()}. ` +
            `Did you mean "up to ${amount / 100}" ($${amount / 100})?`
        );
      }
    }

    // Check fixed amounts like "#template 5000" or "#template-56 5000"
    const fixedMatch = line.match(/^#(?:template|goal)(?:-\d+)?\s+(\d+(?:\.\d+)?)\s*$/);
    if (fixedMatch) {
      const amount = parseFloat(fixedMatch[1]);
      if (amount >= 1000 && amount % 100 === 0) {
        warnings.push(
          `"${line}" budgets $${amount.toLocaleString()}/mo. ` +
            `Did you mean "${line.replace(fixedMatch[1], String(amount / 100))}" ($${amount / 100}/mo)?`
        );
      }
    }
  }
  return warnings;
}

export async function handler(args: SetNoteArgs): Promise<CallToolResult> {
  try {
    const v = SetNoteArgsSchema.parse(args);

    const warnings = detectCentsAmounts(v.note);
    if (warnings.length > 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text:
              'NOTE NOT SAVED. Possible cents-vs-dollars mistake detected:\n\n' +
              warnings.join('\n') +
              '\n\nTemplate amounts are always in DOLLARS, not cents. ' +
              'ASK THE USER to confirm which amount they intended. ' +
              'If the user confirms the large dollar amount is correct, ' +
              'retry with [confirmed] appended to the flagged template line(s).',
          },
        ],
        isError: true,
      };
    }

    await setNote(v.id, v.note);
    return success(`Set note for entity ${v.id}`);
  } catch (err) {
    return errorFromCatch(err);
  }
}
