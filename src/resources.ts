// ----------------------------
// RESOURCES
// ----------------------------

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import api from '@actual-app/api';

// Import types from types.ts
import { Account, Transaction } from './types.js';
import { formatAmount, formatDate, getDateRange } from './utils.js';
import { initActualApi } from './actual-api.js';
import { fetchAllAccounts } from './core/data/fetch-accounts.js';

// Static guide resources
export const GUIDE_RESOURCES = [
  {
    uri: 'actual://guides/month-ahead',
    name: 'Month Ahead Strategy',
    description: "Budgeting strategy: live on last month's income, hold this month's for next month",
    mimeType: 'text/markdown' as const,
  },
  {
    uri: 'actual://guides/andy-context',
    name: "Andy's Financial Context",
    description:
      "How to build Andy's financial picture from live budget data — income, debts, priorities, goals, advice style",
    mimeType: 'text/markdown' as const,
  },
  {
    uri: 'actual://guides/spending-decisions',
    name: 'Spending Decision Framework',
    description:
      'How to evaluate "can I afford X?" using envelope budgeting, priority-aware reallocation, and rolling with the punches',
    mimeType: 'text/markdown' as const,
  },
  {
    uri: 'actual://guides/templates',
    name: 'Budget Template Syntax Reference',
    description:
      'Complete reference for all #template and #goal directives — every type, modifier, and variation. Read this BEFORE writing any template via set-note.',
    mimeType: 'text/markdown' as const,
  },
];

export const GUIDE_CONTENT: Record<string, string> = {
  'actual://guides/month-ahead': `# Month Ahead Strategy

## What It Means

"Staying 1 month ahead" means all expenses this month are paid with income earned last month. This month's income is held and only budgeted next month. The goal: you never need this month's paycheck for this month's bills.

## How It Works in Actual Budget

1. When income arrives, do NOT budget it for the current month
2. Click the **To Budget** amount at the top of the budget screen
3. Select **Hold for next month**
4. When the new month starts, that held income becomes available to budget

## Measuring Progress

- **Not ahead**: You budget paychecks immediately for current-month expenses as they arrive
- **Partially ahead**: Some of the current month was pre-funded, but you still needed mid-month income
- **Fully 1 month ahead**: On the 1st of the month, before any paychecks, all templates can run to completion using only held income (no new paychecks needed)

### How templates interact with rollovers

Different template types have different funding needs at month start:

| Template type | Rollover behavior | New funding needed at month start |
|---|---|---|
| \`schedule <name>\` | Balance rolls over but schedule amount is budgeted fresh | Full schedule amount |
| \`up to <cap>\` | Balance rolls over toward cap | Only the gap: cap - current balance (could be $0) |
| \`up to <cap> hold\` | Balance rolls over, overages kept | Only the gap: cap - current balance (could be $0) |
| \`<fixed amount>\` | Balance rolls over but fixed amount added fresh | Full fixed amount |
| \`average N months\` | Balance rolls over but average added fresh | Full average amount |
| \`% of Paycheck\` | Triggered per-paycheck, not at month start | N/A — runs when income arrives |
| \`remainder\` | Gets whatever is left after other templates | N/A — absorbs leftovers |

**Key insight**: "up to" categories with full balances need $0 new funding. A category like Gas (\`up to 75\`) with $75 already in it is fully funded by rollover — the template will budget $0 for it.

### Key metric

To check if a future month is fully funded:
1. Use \`get-budget-month\` for that month
2. For each category, determine the **actual new funding needed**:
   - "up to" categories: max(0, cap - carryover balance)
   - Schedule/fixed/average categories: full template amount
   - "% of Paycheck" and "remainder": exclude from calculation
3. Sum those amounts = **total new funding needed**
4. Compare against held income (To Budget available before any new paychecks)
5. If held income >= total new funding needed, you are 1 month ahead

## Getting There

Building toward month-ahead status requires accumulating enough buffer to cover one month of *new funding needed* (not total category balances). Because "up to" categories self-fund via rollover, the actual amount needed is less than the sum of all template caps.

Strategies:
1. **Gradual**: Each month, hold whatever you can via Hold for Next Month
2. **Windfall**: Use tax refunds, bonuses, or gifts-from-family income to jump ahead
3. **Expense cuts**: Temporarily reduce discretionary/sinking fund contributions to accelerate the buffer

## What to Track

When Andy asks "am I 1 month ahead?" or "how close am I?":
1. Use \`get-budget-month\` for next month
2. Use \`get-budget-month\` for current month to see category balances rolling forward
3. Calculate new funding needed per category (accounting for rollovers on "up to" categories)
4. Compare against held/available income for next month
5. Report: total needed, amount held, gap (if any), and percentage funded
`,

  'actual://guides/andy-context': `# Andy's Financial Context — Discovery Methodology

This guide teaches you how to build Andy's financial picture from live data. Do NOT rely on hardcoded numbers — always verify against current budget data.

## Step 1: Discover Income

Use \`get-transactions\` on the checking account, filtered to the Paycheck income category, for the last 2-3 months.

From the results, determine:
- **Pay frequency**: Weekly? Biweekly? Look at the gap between deposits
- **Pay amount**: Average per paycheck and per month
- **Consistency**: Are amounts stable or variable?

Do not assume a fixed number. Calculate it from actual deposits.

## Step 2: Identify Debts and Obligations

Use \`get-schedules\` to find all recurring financial obligations.

Categorize them:
- **Debt payments**: Look for loan-related schedules (car payment, etc.). Note the amount and whether there's an extra payment category alongside it
- **Fixed bills**: Utilities, internet, etc. Note which are \`isapprox\` (variable) vs \`is\` (exact)
- **Subscriptions**: Monthly and annual recurring charges

## Step 3: Understand the Priority Scheme

Use \`get-notes\` (all notes) to read every category's template directives.

Parse the priority number from \`#template-N\` lines:
- \`#template\` or \`#template-0\` = priority 0 (highest — non-negotiable)
- \`#template-1\` = priority 1 (essential recurring)
- \`#template-2\` = priority 2 (savings & maintenance)
- \`#template-3\` = priority 3 (annual saves)
- \`#template-4\` = priority 4 (sinking funds)
- \`#template-5\` = priority 5 (discretionary — lowest)

Group categories by priority tier. Lower number = funded first when templates run.

## Step 4: Detect Budget Tension

Compare total monthly template commitments against monthly income:

1. Sum all schedule amounts (from \`get-schedules\`)
2. Add fixed template amounts and estimated "up to" refill needs
3. Add "% of Paycheck" contributions
4. Compare total against monthly income from Step 1

If commitments > income, there is a structural deficit. Note the gap — this affects all advice.

## Step 5: Identify Goals and Progress

Check for:
- **Month-ahead progress**: Use \`get-budget-month\` for next month. Is there held income? How much? (See \`actual://guides/month-ahead\` for details)
- **Emergency fund**: Find the emergency fund category. Check its balance vs. any \`#goal\` or \`up to\` target
- **Debt payoff**: If there's an extra payment category for a loan, Andy is actively paying it down faster

## Step 6: Assess Category Health

Use \`get-budget-month\` for the current month:
- **Overspent categories**: Any category with a negative balance needs attention
- **Sinking fund levels**: For "up to" categories, how full are they relative to their caps?
- **Unallocated funds**: What's in To Budget? Is it spoken for or available?

## Quick Transaction Entry

Andy often enters transactions in natural language like "spent $13.33 at Pepe's". To handle this:

1. **First call \`get-payees\`** to fuzzy-match the payee name against existing payees
2. **Payee matching rules**:
   - If exactly one payee matches confidently, use it
   - If multiple payees could match (e.g. duplicates, similar names), ask Andy which one
   - If no payee matches, ask Andy whether to create a new payee or if they meant an existing one
   - Never guess on ambiguous payees — always confirm
3. **Infer the category and account** from the rules below
4. **If uncertain about anything, ask Andy to confirm** — act like a personal assistant, not an autopilot
5. **Date defaults to today** unless Andy specifies otherwise
6. **Amount is always negative** (outflow) unless it's a payment/transfer

### Payee → Category Rules

| Payee type | Category | Examples |
|---|---|---|
| Restaurants, fast food, bakeries | Restaurants | Pepe's, Chipotle, Panda Express, Chick-Fil-A |
| Boba, tea, coffee, snack shops | Drinks + Coffee + Snacks | Wushiland, Molly Tea, Starbucks, Bobapop |
| Costco (store purchases) | Costco | Costco |
| Gas stations (including Costco Gas) | Gas | Costco Gas, any gas station |
| Utilities | Matching utility category | SCE, SoCalGas, Water, Spectrum, Trash |
| Subscriptions | Matching subscription category | Spotify, iCloud, Claude, etc. |
| Other — use general knowledge | Infer best matching category | MapleStory → PC / Games, O'Reilly → Maintenance, etc. |
| Genuinely uncertain | **Ask Andy** | Target, Home Depot, FedEx, etc. |

### Category → Account Routing

| Spending type | Account |
|---|---|
| Restaurants, Drinks + Coffee + Snacks | Chase Freedom Unlimited |
| Gas, Costco (all Costco spending) | Costco Anywhere Visa |
| Utilities (SCE, SoCalGas, Water, Trash, Spectrum) | US Bank Cash+ |

If a transaction doesn't match any of these, ask which account to use.

### Transfers / Payments

When Andy says "payment" to a credit card, this is a **transfer from Savings**:
- Use the Savings transfer payee (get it from \`get-payees\`, it's the one with \`transfer_acct\` matching the Savings account ID)
- Set \`payee\` (not \`payee_name\`) to the transfer payee ID
- Amount should be **positive** (money coming into the credit card)

### What NOT to auto-enter

- **Amazon orders** — these are auto-imported, skip them

## Advice Style

Andy prefers **balanced** financial advice:
- Willing to make tradeoffs when they make sense
- Don't drain sinking funds recklessly or leave buffers empty without good reason
- Don't be overly conservative either — if there's a clear win, recommend it
- Always show the tradeoff, let Andy decide

## When to Run This

Run this discovery process (or relevant parts of it) at the start of any session where you'll be giving financial advice. For quick operational questions ("recategorize this transaction"), you can skip it.
`,

  'actual://guides/spending-decisions': `# Spending Decision Framework

When Andy asks "can I afford X?", "should I buy X?", or "I want to get X", use this framework. Never just check the bank account balance — use envelope budgeting logic.

## Step 1: Identify the Right Category

Match the purchase to an existing budget category:
- Electronics/unexpected → Oh Shit
- Food/groceries → Costco or Drinks + Coffee + Snacks
- Car-related → Gas, Maintenance, or Deductible
- Entertainment → Games
- Personal care → appropriate Health category
- Gift for someone → Gifts

If no category fits, it's **unplanned spending**. Flag this — Andy may want to create a category or use Oh Shit.

## Step 2: Check Category Balance

Use \`get-budget-month\` for the current month and find the category.

- **Balance >= purchase amount**: Green light. This is what the envelope is for. Spend it.
- **Balance < purchase amount**: The envelope is short. Move to Step 3.
- **Balance is 0 or negative**: The envelope is empty or overspent. Move to Step 3.

## Step 3: Check To Budget

Look at the current month's \`toBudget\` amount.

- **toBudget > 0**: There's unallocated money. It can be assigned to the category to cover the purchase. But note: if Andy is holding funds for next month (month-ahead goal), moving To Budget to a category works against that goal. Mention this tradeoff.
- **toBudget <= 0**: No unallocated funds. Move to Step 4.

## Step 4: Roll With the Punches

This is the core of envelope budgeting flexibility. When money isn't available in the right envelope, move it from another one.

### How to find reallocation candidates

1. Use \`get-budget-month\` for the current month
2. Read all category notes with \`get-notes\` to determine priority levels
3. Starting from **priority 5** (lowest/discretionary), walk upward toward the purchase's priority level
4. For each category, check if it has **surplus balance** (positive balance that isn't needed soon)

### Rules for reallocation

- **Never raid upward**: Don't move money from a higher-priority category to fund a lower-priority purchase. Priority 0-1 money should never fund priority 4-5 spending.
- **Same priority is fine**: Moving between categories at the same priority level is a lateral move, not a downgrade.
- **Show the tradeoff explicitly**: For every category you suggest moving money from, state:
  - How much would be moved
  - What the category balance would drop to
  - When that category would next be refilled (next month's template run)
  - Whether this leaves the category dangerously low
- **Dangerously low threshold**: If moving money would leave a sinking fund ("up to" category) below ~25% of its cap, flag it as risky. Example: moving from Oh Shit (\`up to 150\`) when balance is $40 would leave $0 — that's dangerous.
- **Check for upcoming needs**: Use \`get-schedules\` to see if any schedules hit in the next 7-14 days that depend on the category you're considering moving from.

### Example response format

"You want to buy X for $80. Your [Category] has $30, so you're $50 short.

Options:
1. Move $50 from Games ($70 balance → $20 remaining, refills next month)
2. Move $30 from Gifts ($100 balance → $70 remaining) + $20 from Games ($70 → $50)
3. Wait until next paycheck — your [Category] will have enough after templates run

Option 2 spreads the impact. No sinking fund drops below 50% of cap."

## Step 5: "Can Afford" vs "Should Buy"

Having the money available (in the category or via reallocation) doesn't automatically mean it's a good idea. Consider:

- **Would it empty multiple sinking funds?** If covering this purchase requires draining 2+ categories, that's a sign the budget can't comfortably absorb it right now.
- **Is there a structural deficit?** If monthly commitments already exceed income, discretionary spending makes the gap worse. Mention this.
- **Does it delay a goal?** If Andy is working toward month-ahead and this would consume held funds, say so.
- **Is it recurring or one-time?** A one-time $50 purchase is different from a new $50/month subscription. Subscriptions need a permanent budget line.

## Step 6: Large Purchases (Over $100)

For any purchase over $100, always provide a full impact analysis:

1. **Discover income pattern first.** Use \`get-transactions\` on the checking/savings account filtered to income categories (e.g., Paycheck) for the last 2-3 months. Determine pay frequency, average paycheck amount, and approximate next pay date. This context is essential — always factor upcoming paychecks into the timeline.
2. Which categories would lose funding and by how much
3. What each affected category's balance would be after the move
4. How many months until each affected category is back to its cap/target (factor in expected paychecks and template runs)
5. Whether this delays month-ahead progress or other goals
6. Whether spreading the purchase across 2-3 months (budgeting toward it) would be better than buying now — include a timeline showing how paychecks and template runs would rebuild the funds

## Quick Reference

| Situation | Action |
|---|---|
| Category has the money | Spend it — that's what envelopes are for |
| Category is short, To Budget has funds | Assign from To Budget (note month-ahead tradeoff) |
| No To Budget, lower-priority categories have surplus | Suggest reallocation with tradeoffs shown |
| Only higher-priority categories have surplus | Look up pay frequency via get-transactions, then recommend waiting until next paycheck/template run with a specific date |
| Purchase would drain multiple categories | Recommend against, or suggest spreading over months |
| New recurring expense | Needs a template/category change, not just a one-time move |
`,

  'actual://guides/templates': `# Budget Template Syntax Reference

Templates are lines in category notes that tell Actual how much to budget each month. They start with \`#template\` or \`#goal\`. Multiple template lines can be stacked in one category — their amounts are summed.

**IMPORTANT: Read this guide before writing any template via set-note.** If the user describes a budgeting goal in natural language, match their intent to the right template type below.

---

## Format Rules

- One template per line (no line breaks within a template)
- No currency symbols — use \`50\`, not \`$50\`
- No thousands separators — use \`1234\`, not \`1,234\`
- Decimal separator must be a period — use \`123.45\`, not \`123,45\`
- Amounts are always in dollars (not cents) in templates

---

## Priority System

Syntax: \`#template-N\` where N is the priority level. Lower = runs first.

- \`#template\` or \`#template-0\` — priority 0 (default, highest)
- \`#template-1\` — priority 1
- \`#template-5\` — priority 5 (lowest)
- Negative priorities are invalid and will be skipped
- **Remainder templates ignore priority — they always run last**
- If a category has multiple \`schedule\` or \`by\` lines, they are forced to the same priority

---

## Template Types

### 1. Fixed Amount
**User says:** "Budget $50 a month for X" / "Put $50 toward X every month"

\`\`\`
#template 50
\`\`\`

Budgets exactly this amount each month. The amount is added fresh on top of any rollover balance.

**With a balance cap** — "Budget $50 a month but never let it go above $100":
\`\`\`
#template 50 up to 100
\`\`\`

---

### 2. Cap / Refill (up to)
**User says:** "Keep $150 in X" / "Refill X to $150" / "Top it off to $150"

\`\`\`
#template up to 150
\`\`\`

Refills the category to the target balance. If you already have $100, it budgets $50. If you already have $150+, it budgets $0.

**With hold** — "Keep $150 in X but don't take away the extra if I have more":
\`\`\`
#template up to 150 hold
\`\`\`

Same as above but if balance exceeds the cap (e.g., from a refund), the overage is kept rather than reduced.

**Per-day or per-week caps** — "Budget up to $5 a day for coffee" / "Up to $100 a week for food":
\`\`\`
#template up to 5 per day
#template up to 100 per week starting 2024-10-07
\`\`\`

Calculates the cap based on how many days/weeks fall in the month. The \`starting\` date anchors the week cycle.

**Constraint:** Only ONE \`up to\` template is allowed per category.

---

### 3. Save by Date (by)
**User says:** "Save $500 by December" / "I need $1000 by March 2027"

\`\`\`
#template 500 by 2025-12
#template 10000 by 2027-03
\`\`\`

Spreads the target evenly across remaining months. Date format: YYYY-MM.

**Repeating** — "Save $500 by December every year" / "Save $200 every 6 months":
\`\`\`
#template 500 by 2025-12 repeat every year
#template 200 by 2025-06 repeat every 6 months
#template 1000 by 2026-01 repeat every 2 years
\`\`\`

After reaching the target date, the cycle resets and starts saving for the next occurrence.

**With a spending window** — "Save $500 by December, but I'll start spending in November":
\`\`\`
#template 500 by 2025-12 spend from 2025-11
#template 500 by 2025-12 spend from 2025-11 repeat every year
#template 500 by 2025-12 spend from 2025-03 repeat every 2 years
\`\`\`

The \`spend from\` date marks when spending begins (balance may decrease). Saving resumes after the target date.

---

### 4. Periodic / Recurring Interval (repeat every)
**User says:** "Budget $50 every two weeks" / "$500 every quarter" / "$10 a day" / "$1500 once a year in March"

\`\`\`
#template 10 repeat every day starting 2025-01-01
#template 50 repeat every 30 days starting 2025-01-01
#template 50 repeat every week starting 2025-01-03
#template 10 repeat every 2 weeks starting 2025-01-04
#template 500 repeat every 3 months starting 2025-01-01
#template 1500 repeat every year starting 2025-03-01
#template 1500 repeat every 2 years starting 2025-01-01
\`\`\`

The starting date must be YYYY-MM-DD format. The template calculates how many occurrences fall in each month and budgets accordingly.

**With a balance cap** — "Budget $50 every week but cap at $300":
\`\`\`
#template 50 repeat every week starting 2025-01-03 up to 300
#template 10 repeat every day starting 2025-01-01 up to 400
#template 1500 repeat every year starting 2025-05-01 up to 2000
\`\`\`

---

### 5. Schedule-Based
**User says:** "Match my internet bill" / "Budget for my car payment" / "Cover that recurring bill"

\`\`\`
#template schedule Internet
#template schedule Car Payment
\`\`\`

Automatically budgets the amount tied to a named schedule. For non-monthly schedules (e.g., annual), the amount is spread across months. **The schedule name must match EXACTLY** (case-sensitive) — check \`get-schedules\` for the precise name.

**Full amount only when due** — "Only budget for insurance in the month it's due":
\`\`\`
#template schedule full Insurance
\`\`\`

Instead of spreading, budgets the full amount only in the month the schedule is due.

**With cost adjustments** — "Budget for my insurance but add 20% because it keeps going up" / "Add $50 buffer to the electric bill":
\`\`\`
#template schedule Insurance [increase 20%]
#template schedule Insurance [increase 500]
#template schedule Insurance [decrease 20%]
#template schedule Insurance [decrease 500]
\`\`\`

Adjusts the schedule amount by a percentage or fixed dollar amount. Useful for anticipating rate changes.

---

### 6. Average Spending
**User says:** "Budget based on what I usually spend" / "Average my last 3 months of spending"

\`\`\`
#template average 3 months
#template average 6 months
\`\`\`

Looks at actual spending in the category over the last N months and budgets the average.

**With adjustments** — "Average my spending but add 20% buffer" / "Average but reduce by $10":
\`\`\`
#template average 3 months [increase 20%]
#template average 3 months [decrease 10%]
#template average 3 months [increase 11]
#template average 3 months [decrease 1]
\`\`\`

Square brackets with \`increase\` or \`decrease\`, followed by a percentage or fixed dollar amount.

---

### 7. Percentage of Income
**User says:** "Put 10% of my paycheck toward savings" / "Save 5% of all income"

\`\`\`
#template 10% of Paycheck
#template 5% of all income
#template 10% of available funds
\`\`\`

- \`of <CategoryName>\` — percentage of a specific income category (must match exactly)
- \`of all income\` — percentage of total income across all income categories
- \`of available funds\` — percentage of the remaining To Budget amount

**Previous month's income** — "Put 10% of last month's paycheck toward savings":
\`\`\`
#template 10% of previous Paycheck
#template 10% of previous all income
\`\`\`

Uses the prior month's income instead of current month's. NOT available with \`available funds\`.

---

### 8. Copy from Past
**User says:** "Budget the same as last year" / "Match what I budgeted 6 months ago"

\`\`\`
#template copy from 12 months ago
#template copy from 6 months ago
\`\`\`

Copies the budgeted amount from N months prior. Useful for seasonal categories.

---

### 9. Remainder
**User says:** "Put whatever's left here" / "Split the leftovers between X and Y"

\`\`\`
#template remainder
\`\`\`

After all other templates run, allocates whatever is left in To Budget. Always runs last regardless of priority.

**Weighted distribution** — "Split leftovers: 2 parts to savings, 1 part to fun":
\`\`\`
#template remainder 2
#template remainder 1
\`\`\`

Weight determines the share. Default weight is 1. Formula: \`category_share = available_funds / sum_of_weights * category_weight\`.

**With a cap** — "Put leftovers here but cap at $40":
\`\`\`
#template remainder 3 up to 40
\`\`\`

---

### 10. Goal Indicator
**User says:** "I want to reach $500 in this category" / "Show me when I hit my target"

\`\`\`
#goal 500
\`\`\`

Does NOT budget any money. Only changes the category's goal indicator — it turns green when the balance reaches the target. Combine with a template to auto-fund toward the goal:
\`\`\`
#template 50
#goal 500
\`\`\`

This budgets $50/month and shows green when the balance reaches $500.

---

## Stacking Multiple Templates

Multiple lines in one category are summed:
\`\`\`
Netflix #template 24.99
Disney Plus #template 9.99
Amazon Prime #template 7.99
\`\`\`

The prefix label (e.g., "Netflix") is optional — it helps readability but doesn't affect behavior. Total budgeted: $42.97/month.

---

## Application Modes

When templates are applied in the Actual UI, there are several modes:
- **Check templates** — preview what would be budgeted
- **Apply to categories with $0 only** — only fill empty categories
- **Overwrite all existing budgets** — recommended when using priorities, resets and reapplies everything
- **Apply to single category** — run templates for one category only
- **Apply to category group** — run templates for a group

---

## Natural Language → Template Cheat Sheet

| User says... | Template |
|---|---|
| "Budget $50/month" | \`#template 50\` |
| "Keep $150 in there" | \`#template up to 150\` |
| "Save $500 by December" | \`#template 500 by 2025-12\` |
| "Save $500 by December, repeat yearly" | \`#template 500 by 2025-12 repeat every year\` |
| "Budget $50 every two weeks" | \`#template 50 repeat every 2 weeks starting YYYY-MM-DD\` |
| "$500 every quarter" | \`#template 500 repeat every 3 months starting YYYY-MM-DD\` |
| "Match my electric bill" | \`#template schedule Electricity\` |
| "Cover my annual insurance, only in the month it's due" | \`#template schedule full Insurance\` |
| "Budget based on my average spending" | \`#template average 3 months\` |
| "10% of my paycheck" | \`#template 10% of Paycheck\` |
| "Whatever's left over" | \`#template remainder\` |
| "Same as last year" | \`#template copy from 12 months ago\` |
| "Budget $5/day for coffee" | \`#template up to 5 per day\` |
| "I want to hit $1000 in savings" | \`#goal 1000\` |
| "Budget for my bill but add 20% buffer" | \`#template schedule BillName [increase 20%]\` |
`,
};

export const setupResources = (server: Server): void => {
  /**
   * Handler for listing available resources (accounts + guides)
   */
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      await initActualApi();
      const accounts: Account[] = await fetchAllAccounts();
      return {
        resources: [
          ...GUIDE_RESOURCES,
          ...accounts.map((account) => ({
            uri: `actual://accounts/${account.id}`,
            name: account.name,
            description: `${account.name} (${account.type || 'Account'})${account.closed ? ' - CLOSED' : ''}`,
            mimeType: 'text/markdown',
          })),
        ],
      };
    } catch (error) {
      console.error('Error listing resources:', error);
      throw error;
    }
  });

  /**
   * Handler for reading resources (account details and transactions)
   */
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      const uri: string = request.params.uri;

      // Static guide resources — no API connection needed
      if (GUIDE_CONTENT[uri]) {
        return {
          contents: [{ uri, text: GUIDE_CONTENT[uri], mimeType: 'text/markdown' }],
        };
      }

      await initActualApi();
      const url = new URL(uri);

      // Parse the path to determine what to return
      const pathParts: string[] = url.pathname.split('/').filter(Boolean);

      // If the path is just "accounts", return list of all accounts
      if (pathParts.length === 0 && url.hostname === 'accounts') {
        const accounts: Account[] = await api.getAccounts();

        const accountsText: string = accounts
          .map((account) => {
            const closed = account.closed ? ' (CLOSED)' : '';
            const offBudget = account.offbudget ? ' (OFF BUDGET)' : '';
            const balance = account.balance !== undefined ? ` - ${formatAmount(account.balance)}` : '';

            return `- ${account.name}${closed}${offBudget}${balance} [ID: ${account.id}]`;
          })
          .join('\n');

        return {
          contents: [
            {
              uri: uri,
              text: `# Actual Budget Accounts\n\n${accountsText}\n\nTotal Accounts: ${accounts.length}`,
              mimeType: 'text/markdown',
            },
          ],
        };
      }

      // If the path is "accounts/{id}", return account details
      if (pathParts.length === 1 && url.hostname === 'accounts') {
        const accountId: string = pathParts[0];
        const accounts: Account[] = await api.getAccounts();
        const account: Account | undefined = accounts.find((a) => a.id === accountId);

        if (!account) {
          return {
            contents: [
              {
                uri: uri,
                text: `Error: Account with ID ${accountId} not found`,
                mimeType: 'text/plain',
              },
            ],
          };
        }

        const balance: number = await api.getAccountBalance(accountId);
        const formattedBalance: string = formatAmount(balance);

        const details = `# Account: ${account.name}

ID: ${account.id}
Type: ${account.type || 'Unknown'}
Balance: ${formattedBalance}
On Budget: ${!account.offbudget}
Status: ${account.closed ? 'Closed' : 'Open'}

To view transactions for this account, use the get-transactions tool.`;

        return {
          contents: [
            {
              uri: uri,
              text: details,
              mimeType: 'text/markdown',
            },
          ],
        };
      }

      // If the path is "accounts/{id}/transactions", return transactions
      if (pathParts.length === 2 && pathParts[1] === 'transactions' && url.hostname === 'accounts') {
        const accountId: string = pathParts[0];
        const { startDate, endDate } = getDateRange();
        const transactions: Transaction[] = await api.getTransactions(accountId, startDate, endDate);

        if (!transactions || transactions.length === 0) {
          return {
            contents: [
              {
                uri: uri,
                text: `No transactions found for account ID ${accountId} between ${startDate} and ${endDate}`,
                mimeType: 'text/plain',
              },
            ],
          };
        }

        // Create a markdown table of transactions
        const header = '| Date | Payee | Category | Amount | Notes |\n| ---- | ----- | -------- | ------ | ----- |\n';
        const rows: string = transactions
          .map((t) => {
            const amount: string = formatAmount(t.amount);
            const date: string = formatDate(t.date);
            const payee: string = t.payee_name || '(No payee)';
            const category: string = t.category_name || '(Uncategorized)';
            const notes: string = t.notes || '';

            return `| ${date} | ${payee} | ${category} | ${amount} | ${notes} |`;
          })
          .join('\n');

        const text = `# Transactions for Account\n\nTime period: ${startDate} to ${endDate}\nTotal Transactions: ${transactions.length}\n\n${header}${rows}`;

        return {
          contents: [
            {
              uri: uri,
              text: text,
              mimeType: 'text/markdown',
            },
          ],
        };
      }

      // If we don't recognize the URI pattern, return an error
      return {
        contents: [
          {
            uri: uri,
            text: `Error: Unrecognized resource URI: ${uri}`,
            mimeType: 'text/plain',
          },
        ],
      };
    } catch (error) {
      console.error('Error reading resource:', error);
      throw error;
    }
  });
};
