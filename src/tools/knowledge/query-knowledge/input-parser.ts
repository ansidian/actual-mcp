import { z } from 'zod';
import type { QueryKnowledgeArgs } from './types.js';

export const QueryKnowledgeArgsSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'Natural language question about budgeting methodology, templates, financial advice, or spending decisions'
    ),
  topK: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(3)
    .describe('Number of relevant chunks to return (1-10, default 3)'),
});

/**
 * Parse and validate query-knowledge tool arguments.
 *
 * @param args - Raw tool arguments
 * @returns Validated arguments
 */
export function parseArgs(args: unknown): QueryKnowledgeArgs {
  return QueryKnowledgeArgsSchema.parse(args);
}
