// ----------------------------
// GET GUIDE TOOL
// ----------------------------

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { errorFromCatch } from '../../../utils/response.js';
import { GUIDE_CONTENT, GUIDE_RESOURCES } from '../../../resources.js';
import type { ToolInput } from '../../../types.js';

const guideNames = GUIDE_RESOURCES.map((g) => g.uri.replace('actual://guides/', ''));

const GetGuideArgsSchema = z.object({
  name: z
    .string()
    .optional()
    .describe(
      `Guide name to retrieve. Available guides: ${guideNames.join(', ')}. ` +
        'Omit to list all available guides.'
    ),
});

type GetGuideArgs = z.infer<typeof GetGuideArgsSchema>;

export const schema = {
  name: 'get-guide',
  description:
    'IMPORTANT: Call this tool BEFORE giving financial advice. ' +
    'Read "andy-context" at session start to learn how to build the user\'s financial picture. ' +
    'Read "spending-decisions" before evaluating any purchase or "can I afford" question. ' +
    'Read "month-ahead" when asked about month-ahead progress. ' +
    'These guides contain required methodology — do not skip them.',
  inputSchema: zodToJsonSchema(GetGuideArgsSchema) as ToolInput,
};

export async function handler(args: GetGuideArgs): Promise<CallToolResult> {
  try {
    const v = GetGuideArgsSchema.parse(args);

    if (!v.name) {
      const list = GUIDE_RESOURCES.map((g) => ({
        name: g.uri.replace('actual://guides/', ''),
        title: g.name,
        description: g.description,
      }));
      return {
        content: [{ type: 'text', text: JSON.stringify(list, null, 2) }],
      };
    }

    const uri = `actual://guides/${v.name}`;
    const content = GUIDE_CONTENT[uri];

    if (!content) {
      return {
        content: [
          {
            type: 'text',
            text: `Unknown guide "${v.name}". Available: ${guideNames.join(', ')}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: content }],
    };
  } catch (err) {
    return errorFromCatch(err);
  }
}
