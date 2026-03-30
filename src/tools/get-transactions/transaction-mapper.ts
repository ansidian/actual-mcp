// Maps and formats transaction data for get-transactions tool
import { formatAmount, formatDate } from '../../utils.js';
import type { Transaction } from '../../types.js';

export class GetTransactionsMapper {
  map(transactions: Transaction[]): Array<{
    id: string;
    date: string;
    payee: string;
    category: string;
    amount: string;
    notes: string;
    cleared: boolean;
  }> {
    // Build a lookup of children by parent_id for split category labels
    const childrenByParent = new Map<string, Transaction[]>();
    for (const t of transactions) {
      if (t.is_child && t.parent_id) {
        const siblings = childrenByParent.get(t.parent_id) || [];
        siblings.push(t);
        childrenByParent.set(t.parent_id, siblings);
      }
    }

    return transactions
      .filter((t) => !t.is_child)
      .map((t) => {
        let category: string;
        if (t.is_parent) {
          const children = childrenByParent.get(t.id) || [];
          const childCategories = children
            .map((c) => c.category_name || '(Uncategorized)')
            .filter((name, i, arr) => arr.indexOf(name) === i);
          category = childCategories.length > 0 ? `Split: ${childCategories.join(', ')}` : '(Split)';
        } else {
          category = t.category_name || t.category || '(Uncategorized)';
        }

        return {
          id: t.id,
          date: formatDate(t.date),
          payee: t.payee_name || t.payee || '(No payee)',
          category,
          amount: formatAmount(t.amount),
          notes: t.notes || '',
          cleared: t.cleared ?? false,
        };
      });
  }
}
