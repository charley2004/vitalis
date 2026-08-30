import { supabase, isSupabaseConfigured } from './supabase';
import {
  getCategories, getTransactionsForMonth, getBudgets, getFinanceGoals, getGoalCurrentAmount,
  estimateGoalCompletion, currentMonthKey, getFinanceSettings, type FinanceTransaction,
} from './finance';

function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function spendByCategory(transactions: FinanceTransaction[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of transactions) {
    if (t.type === 'expense' && t.categoryId) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amount);
  }
  return m;
}

/** Compact numeric snapshot — this month vs last month per category, budget
 *  pacing, goal run-rate — mirrors buildCoachContext()'s style but is fully
 *  self-contained per request (no persisted history, see finance-insights
 *  edge function header for why). */
async function buildFinanceContext(): Promise<string> {
  const settings = await getFinanceSettings();
  const thisMonth = currentMonthKey();
  const lastMonth = shiftMonthKey(thisMonth, -1);
  const [categories, thisTx, lastTx, budgets, goals] = await Promise.all([
    getCategories(), getTransactionsForMonth(thisMonth), getTransactionsForMonth(lastMonth), getBudgets(), getFinanceGoals(),
  ]);
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const thisSpend = spendByCategory(thisTx);
  const lastSpend = spendByCategory(lastTx);

  const thisIncome = thisTx.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const thisExpense = thisTx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const lastIncome = lastTx.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const lastExpense = lastTx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

  const lines: string[] = [
    `Currency: ${settings.currencyCode}`,
    `This month so far: income ${thisIncome}, expenses ${thisExpense}.`,
    `Last month total: income ${lastIncome}, expenses ${lastExpense}.`,
    'Spend by category (this month vs last month):',
    ...categories.map((c) => `- ${c.name}: ${thisSpend.get(c.id) ?? 0} this month vs ${lastSpend.get(c.id) ?? 0} last month (allocation ${c.percentage}% of income)`),
    'Budgets this month:',
    ...budgets.filter((b) => b.recurring || b.monthKey === thisMonth).map((b) => {
      const cat = categoryMap.get(b.categoryId);
      const spent = thisSpend.get(b.categoryId) ?? 0;
      const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
      return `- ${cat?.name ?? 'Unknown'}: budget ${b.amount}, spent ${spent} (${pct}%)`;
    }),
    'Goals:',
    ...goals.map((g) => {
      const current = getGoalCurrentAmount(g);
      const { monthsRemaining } = estimateGoalCompletion(g);
      return `- ${g.label}: ${current}/${g.targetAmount} (target date ${g.targetDate})${monthsRemaining !== null ? `, ~${monthsRemaining} months to go at current pace` : ''}`;
    }),
  ];

  return lines.join('\n');
}

export async function getFinanceInsights(): Promise<{ insights: string[] } | { error: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Smart Insights needs cloud sync configured first (Settings → Account & Sync).' };
  }
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return { error: 'Sign in (Settings → Account & Sync) to use Smart Insights.' };
  }

  try {
    const context = await buildFinanceContext();
    const { data, error } = await supabase.functions.invoke('finance-insights', { body: { context } });
    if (error) return { error: error.message ?? 'The insights request failed.' };
    if (data?.error) return { error: data.error as string };
    return { insights: Array.isArray(data?.insights) ? (data.insights as string[]) : [] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'The insights request failed.' };
  }
}
