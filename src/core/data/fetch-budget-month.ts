import { getBudgetMonth } from '../../actual-api.js';

export async function fetchBudgetMonth(month: string): Promise<unknown> {
  return getBudgetMonth(month);
}
