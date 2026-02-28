// ----------------------------
// CREATE TRANSACTION TOOL
// ----------------------------

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { successWithJson, errorFromCatch } from '../../utils/response.js';
import { createTransaction } from '../../actual-api.js';
import { CreateTransactionArgsSchema, type CreateTransactionArgs, ToolInput } from '../../types.js';

export const schema = {
  name: 'create-transaction',
  description:
    'Create a new transaction. Use this to add transactions to accounts. ' +
    'Before creating a transaction from natural language, call get-guide with "andy-context", get-payees, ' +
    'and get-grouped-categories in parallel to resolve the correct account, category, and payee. ' +
    'When the user says "payment" to a credit card, this means a transfer from their Savings account. ' +
    'To create a transfer, set the payee field to the transfer payee ID of the source account, ' +
    'and the amount should be positive (money coming into the credit card). Do NOT use payee_name for transfers.',
  inputSchema: zodToJsonSchema(CreateTransactionArgsSchema) as ToolInput,
};

export async function handler(args: CreateTransactionArgs): Promise<CallToolResult> {
  try {
    // Validate with Zod schema
    const validatedArgs = CreateTransactionArgsSchema.parse(args);

    const { account: accountId, ...transactionData } = validatedArgs;

    const id: string = await createTransaction(accountId, transactionData);

    return successWithJson('Successfully created transaction ' + id);
  } catch (err) {
    return errorFromCatch(err);
  }
}
