// ----------------------------
// CREATE TRANSACTION TOOL
// ----------------------------

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { successWithJson, errorFromCatch, error } from '../../utils/response.js';
import { createTransaction, getPayees } from '../../actual-api.js';
import { CreateTransactionArgsSchema, type CreateTransactionArgs, ToolInput } from '../../types.js';

export const schema = {
  name: 'create-transaction',
  description:
    'Create a new transaction. Use this to add transactions to accounts. ' +
    'Supports transfers between accounts by specifying transfer_account_id. ' +
    'Before creating a transaction from natural language, call get-guide with "user-context", get-payees, ' +
    'and get-grouped-categories in parallel to resolve the correct account, category, and payee. ' +
    'When the user says "payment" to a credit card, this means a transfer from their Savings account. ' +
    'To create a transfer, set transfer_account_id to the destination account ID and make the amount negative ' +
    '(money leaving the source account). The transfer payee is resolved automatically. ' +
    'Alternatively, set the payee field directly to the transfer payee ID. Do NOT use payee_name for transfers.',
  inputSchema: zodToJsonSchema(CreateTransactionArgsSchema) as ToolInput,
};

/**
 * Resolve the transfer payee ID for a given destination account.
 * Each account in Actual has a corresponding payee with transfer_acct set.
 */
async function resolveTransferPayee(destinationAccountId: string): Promise<string | null> {
  const payees = await getPayees();
  const transferPayee = payees.find((p) => p.transfer_acct === destinationAccountId);
  return transferPayee?.id ?? null;
}

export async function handler(args: CreateTransactionArgs): Promise<CallToolResult> {
  try {
    // Validate with Zod schema
    const validatedArgs = CreateTransactionArgsSchema.parse(args);

    const { account: accountId, transfer_account_id, ...transactionData } = validatedArgs;

    // When transfer_account_id is provided, look up the transfer payee
    // so that addTransactions (with runTransfers: true) creates the counterpart automatically.
    if (transfer_account_id) {
      const transferPayeeId = await resolveTransferPayee(transfer_account_id);
      if (!transferPayeeId) {
        return error(
          `No transfer payee found for account ${transfer_account_id}. Ensure the destination account exists.`
        );
      }
      transactionData.payee = transferPayeeId;
    }

    const id: string = await createTransaction(accountId, transactionData);

    const message = transfer_account_id
      ? `Successfully created transfer transaction ${id} (counterpart created in destination account)`
      : `Successfully created transaction ${id}`;

    return successWithJson(message);
  } catch (err) {
    return errorFromCatch(err);
  }
}
