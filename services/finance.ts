import AsyncStorage from '@react-native-async-storage/async-storage';
import { KEYS, getTodayKey } from './storage';
import {
  getEvents, upsertEvent, deleteEvent, newEventId, addDaysKey,
  getStatusMap, occurrencesForDateSync,
  type CalendarEvent,
} from './calendar';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FinanceTemplateId = 'personal' | 'student' | 'business' | 'freelancer' | 'family' | 'custom';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type LockMode = 'none' | 'pin' | 'biometric' | 'both';

export interface FinanceCategory {
  id: string;
  name: string;
  emoji: string;
  color: string;
  percentage: number;
  order: number;
}

export interface FinanceTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string | null;
  /** Only for type === 'transfer' — the envelope money moved into */
  transferToCategoryId?: string;
  /** Only for type === 'income' — feeds the "Highest Income Source" report metric */
  sourceLabel?: string;
  date: string; // YYYY-MM-DD
  notes?: string;
  /** Local file:// URI from expo-image-picker — device-only, not cloud-synced in v1 */
  receiptUri?: string;
  createdAt: number;
}

export interface FinanceBudget {
  id: string;
  categoryId: string;
  /** YYYY-MM. When recurring is true this is just the creation month —
   *  the budget applies to every month until a non-recurring override
   *  exists for that specific month. */
  monthKey: string;
  amount: number;
  recurring?: boolean;
  /** 1-28, clamped into shorter months when a reminder event is generated */
  dueDay?: number;
  reminderEnabled?: boolean;
  /** CalendarEvent.id this budget created for its due-date reminder */
  linkedEventId?: string;
}

export interface GoalContribution { amount: number; date: string; }

export interface FinanceGoal {
  id: string;
  label: string;
  emoji: string;
  targetAmount: number;
  targetDate: string;
  contributions: GoalContribution[];
  createdAt: number;
}

export interface AllocationResult {
  categoryId: string;
  name: string;
  color: string;
  percentage: number;
  amount: number;
}

export interface AllocationCalculation {
  id: string;
  label?: string;
  incomeAmount: number;
  results: AllocationResult[];
  createdAt: number;
}

export interface FinanceSettings {
  onboarded: boolean;
  templateId: FinanceTemplateId;
  currencyCode: string;
  lockMode: LockMode;
  /** Manual starting-balance offset, folded into getTotalBalance() */
  balanceAdjustment: number;
}

// ─── IDs ──────────────────────────────────────────────────────────────────────

export function newFinanceId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Templates ────────────────────────────────────────────────────────────────

// Validated for CVD-safety + contrast against the app's dark card surface
// (COLORS.surfaceSolid) — see the dataviz skill's palette validator. Order is
// the safety mechanism (maximizes worst-case adjacent contrast); don't reorder.
export const CATEGORY_COLOR_SWATCHES = [
  '#3987e5', // blue
  '#199e70', // aqua
  '#c98500', // yellow
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
  '#d55181', // magenta
  '#d95926', // orange
];

type TemplateCategory = { name: string; emoji: string; percentage: number };

export const FINANCE_TEMPLATES: Record<FinanceTemplateId, { label: string; description: string; categories: TemplateCategory[] }> = {
  personal: {
    label: 'Personal',
    description: 'Everyday income and spending, split into simple categories.',
    categories: [
      { name: 'Feeding',       emoji: 'bowl',       percentage: 30 },
      { name: 'Transport',     emoji: 'runner',     percentage: 15 },
      { name: 'Savings',       emoji: 'piggy-bank', percentage: 20 },
      { name: 'Bills',         emoji: 'receipt',    percentage: 20 },
      { name: 'Entertainment', emoji: 'signal',     percentage: 10 },
      { name: 'Miscellaneous', emoji: 'tag',        percentage: 5 },
    ],
  },
  student: {
    label: 'Student',
    description: 'For tuition-era budgets — school costs, data, and a safety net.',
    categories: [
      { name: 'Feeding',          emoji: 'bowl',       percentage: 25 },
      { name: 'Transport',        emoji: 'runner',     percentage: 15 },
      { name: 'School Materials', emoji: 'pen',        percentage: 15 },
      { name: 'Data',             emoji: 'signal',     percentage: 10 },
      { name: 'Savings',          emoji: 'piggy-bank', percentage: 20 },
      { name: 'Emergency',        emoji: 'shield',     percentage: 15 },
    ],
  },
  business: {
    label: 'Business',
    description: 'Operating costs, payroll, and owner pay for a small business.',
    categories: [
      { name: 'Operations',     emoji: 'bolt',        percentage: 30 },
      { name: 'Marketing',      emoji: 'trending-up', percentage: 15 },
      { name: 'Payroll',        emoji: 'wallet',      percentage: 25 },
      { name: 'Taxes',          emoji: 'receipt',      percentage: 15 },
      { name: 'Emergency Fund', emoji: 'shield',       percentage: 10 },
      { name: 'Owner Pay',      emoji: 'cash',         percentage: 5 },
    ],
  },
  freelancer: {
    label: 'Freelancer / Creator',
    description: 'Client income split across reinvestment, tax, and take-home.',
    categories: [
      { name: 'Clients',         emoji: 'target',      percentage: 10 },
      { name: 'Equipment',       emoji: 'bolt',        percentage: 15 },
      { name: 'Taxes',           emoji: 'receipt',     percentage: 20 },
      { name: 'Savings',         emoji: 'piggy-bank',  percentage: 20 },
      { name: 'Personal Income', emoji: 'cash',        percentage: 25 },
      { name: 'Investments',     emoji: 'trending-up', percentage: 10 },
    ],
  },
  family: {
    label: 'Family',
    description: 'Household spending across the whole family.',
    categories: [
      { name: 'Groceries',            emoji: 'bowl',       percentage: 25 },
      { name: 'Housing',              emoji: 'receipt',    percentage: 25 },
      { name: 'Children & Education', emoji: 'pen',        percentage: 15 },
      { name: 'Healthcare',           emoji: 'shield',     percentage: 10 },
      { name: 'Savings',              emoji: 'piggy-bank', percentage: 15 },
      { name: 'Family Fun',           emoji: 'signal',     percentage: 10 },
    ],
  },
  custom: {
    label: 'Custom',
    description: 'Start from a blank slate and build your own categories.',
    categories: [],
  },
};

// ─── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(): Promise<FinanceCategory[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.financeCategories);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveCategories(categories: FinanceCategory[]): Promise<void> {
  try { await AsyncStorage.setItem(KEYS.financeCategories, JSON.stringify(categories)); } catch {}
}

export function validateAllocation(categories: FinanceCategory[]): { valid: boolean; total: number } {
  const total = Math.round(categories.reduce((sum, c) => sum + c.percentage, 0) * 100) / 100;
  return { valid: Math.abs(total - 100) < 0.01, total };
}

export async function applyTemplate(templateId: FinanceTemplateId): Promise<FinanceCategory[]> {
  const template = FINANCE_TEMPLATES[templateId];
  const categories: FinanceCategory[] = template.categories.map((c, i) => ({
    id: newFinanceId('cat'),
    order: i,
    color: CATEGORY_COLOR_SWATCHES[i % CATEGORY_COLOR_SWATCHES.length],
    ...c,
  }));
  await saveCategories(categories);
  return categories;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function getTransactions(): Promise<FinanceTransaction[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.financeTransactions);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveTransactions(transactions: FinanceTransaction[]): Promise<void> {
  try { await AsyncStorage.setItem(KEYS.financeTransactions, JSON.stringify(transactions)); } catch {}
}

export async function addTransaction(transaction: FinanceTransaction): Promise<void> {
  const transactions = await getTransactions();
  transactions.push(transaction);
  await saveTransactions(transactions);
}

export async function updateTransaction(transaction: FinanceTransaction): Promise<void> {
  const transactions = await getTransactions();
  const idx = transactions.findIndex((t) => t.id === transaction.id);
  if (idx >= 0) transactions[idx] = transaction;
  await saveTransactions(transactions);
}

export async function deleteTransaction(id: string): Promise<void> {
  const transactions = await getTransactions();
  await saveTransactions(transactions.filter((t) => t.id !== id));
}

export async function getTransactionsForMonth(monthKey: string): Promise<FinanceTransaction[]> {
  const transactions = await getTransactions();
  return transactions.filter((t) => t.date.startsWith(monthKey));
}

export async function getTransactionsInRange(startDateKey: string, endDateKey: string): Promise<FinanceTransaction[]> {
  const transactions = await getTransactions();
  return transactions.filter((t) => t.date >= startDateKey && t.date <= endDateKey);
}

/**
 * Net money leaving a category envelope: expenses debit it directly,
 * transfers debit the source and credit the destination. Transfers never
 * touch total balance (see getTotalBalance) but do move budget "spend"
 * between envelopes, which is what this powers.
 */
function categoryNetOutflow(categoryId: string, transactions: FinanceTransaction[]): number {
  let total = 0;
  for (const t of transactions) {
    if (t.categoryId === categoryId && (t.type === 'expense' || t.type === 'transfer')) total += t.amount;
    if (t.type === 'transfer' && t.transferToCategoryId === categoryId) total -= t.amount;
  }
  return total;
}

export async function getCategorySpend(categoryId: string, monthKey: string): Promise<number> {
  const transactions = await getTransactionsForMonth(monthKey);
  return categoryNetOutflow(categoryId, transactions);
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

export async function getBudgets(): Promise<FinanceBudget[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.financeBudgets);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveBudgets(budgets: FinanceBudget[]): Promise<void> {
  try { await AsyncStorage.setItem(KEYS.financeBudgets, JSON.stringify(budgets)); } catch {}
}

export async function upsertBudget(budget: FinanceBudget): Promise<void> {
  const budgets = await getBudgets();
  const idx = budgets.findIndex((b) => b.id === budget.id);
  if (idx >= 0) budgets[idx] = budget;
  else budgets.push(budget);
  await saveBudgets(budgets);
}

export async function deleteBudget(id: string): Promise<void> {
  const budgets = await getBudgets();
  const budget = budgets.find((b) => b.id === id);
  if (budget) {
    // Not just linkedEventId — a due-date reminder moved via Planner's
    // moveOccurrence() spins off a separate one-off clone that still carries
    // this budget's financeRefId, so it needs cleaning up too or it's left
    // behind as an orphaned Planner event with no budget behind it.
    const events = await getEvents();
    const linked = events.filter((e) => e.financeRefId === id);
    for (const e of linked) await deleteEvent(e.id);
  }
  await saveBudgets(budgets.filter((b) => b.id !== id));
}

/** A month-specific override (non-recurring, exact monthKey match) wins over
 *  a recurring budget for the same category — lets a user bump one month's
 *  cap without changing the standing monthly amount. */
export async function getBudgetForCategory(categoryId: string, monthKey: string): Promise<FinanceBudget | null> {
  const budgets = await getBudgets();
  const override = budgets.find((b) => b.categoryId === categoryId && b.monthKey === monthKey && !b.recurring);
  if (override) return override;
  return budgets.find((b) => b.categoryId === categoryId && b.recurring) ?? null;
}

/**
 * Creates/updates/removes the Planner event backing a budget's due-date
 * reminder. Reminders "just work" once the event exists — syncReminders()
 * (services/reminders.ts) already schedules any CalendarEvent with a
 * `reminders` array; the caller just needs to call it after this resolves.
 */
export async function syncBudgetReminder(budget: FinanceBudget, categoryName: string, monthKey: string): Promise<FinanceBudget> {
  if (!budget.reminderEnabled || !budget.dueDay) {
    if (budget.linkedEventId) {
      const events = await getEvents();
      const linked = events.filter((e) => e.financeRefId === budget.id);
      for (const e of linked) await deleteEvent(e.id);
      return { ...budget, linkedEventId: undefined };
    }
    return budget;
  }
  const [y, m] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const day = Math.min(budget.dueDay, daysInMonth);
  const date = `${monthKey}-${String(day).padStart(2, '0')}`;
  const eventId = budget.linkedEventId ?? newEventId();
  const event: CalendarEvent = {
    id: eventId,
    title: `${categoryName} Due`,
    date,
    start: null,
    end: null,
    durationMinutes: 0,
    category: 'FINANCE',
    priority: 'medium',
    repeat: 'monthly',
    reminders: [1440],
    createdAt: Date.now(),
    financeRefId: budget.id,
  };
  await upsertEvent(event);
  return { ...budget, linkedEventId: eventId };
}

export interface UpcomingBill { event: CalendarEvent; dateKey: string; }

export async function getUpcomingBills(days = 14): Promise<UpcomingBill[]> {
  const [events, statusMap] = await Promise.all([getEvents(), getStatusMap()]);
  const billEvents = events.filter((e) => e.category === 'FINANCE' && e.financeRefId);
  if (billEvents.length === 0) return [];
  const bills: UpcomingBill[] = [];
  let key = getTodayKey();
  for (let i = 0; i < days; i++) {
    // Status-aware (not just occursOn) so a due date that's already been
    // paid/skipped — or moved to a different day via Planner's moveOccurrence,
    // which marks the original occurrence skipped — doesn't linger here.
    const occs = occurrencesForDateSync(billEvents, statusMap, key);
    for (const occ of occs) {
      if (occ.status === 'pending' && !bills.some((b) => b.event.id === occ.event.id)) {
        bills.push({ event: occ.event, dateKey: key });
      }
    }
    key = addDaysKey(key, 1);
  }
  bills.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return bills;
}

// ─── Goals ────────────────────────────────────────────────────────────────────

export async function getFinanceGoals(): Promise<FinanceGoal[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.financeGoals);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveFinanceGoals(goals: FinanceGoal[]): Promise<void> {
  try { await AsyncStorage.setItem(KEYS.financeGoals, JSON.stringify(goals)); } catch {}
}

export async function upsertFinanceGoal(goal: FinanceGoal): Promise<void> {
  const goals = await getFinanceGoals();
  const idx = goals.findIndex((g) => g.id === goal.id);
  if (idx >= 0) goals[idx] = goal;
  else goals.push(goal);
  await saveFinanceGoals(goals);
}

export async function deleteFinanceGoal(id: string): Promise<void> {
  const goals = await getFinanceGoals();
  await saveFinanceGoals(goals.filter((g) => g.id !== id));
}

export async function addGoalContribution(goalId: string, amount: number, date: string): Promise<void> {
  const goals = await getFinanceGoals();
  const goal = goals.find((g) => g.id === goalId);
  if (!goal) return;
  goal.contributions.push({ amount, date });
  await saveFinanceGoals(goals);
}

export function getGoalCurrentAmount(goal: FinanceGoal): number {
  return goal.contributions.reduce((sum, c) => sum + c.amount, 0);
}

/** Linear run-rate off the last 3 calendar months of contributions — the
 *  simplest honest estimate without inventing a fake monthly-budget input. */
export function estimateGoalCompletion(goal: FinanceGoal): { monthsRemaining: number | null; onTrack: boolean } {
  const current = getGoalCurrentAmount(goal);
  const remaining = goal.targetAmount - current;
  if (remaining <= 0) return { monthsRemaining: 0, onTrack: true };
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  const recent = goal.contributions.filter((c) => new Date(`${c.date}T12:00:00`) >= cutoff);
  if (recent.length === 0) return { monthsRemaining: null, onTrack: false };
  const avgMonthly = recent.reduce((sum, c) => sum + c.amount, 0) / 3;
  if (avgMonthly <= 0) return { monthsRemaining: null, onTrack: false };
  return { monthsRemaining: Math.ceil(remaining / avgMonthly), onTrack: true };
}

export async function getSavingsProgressPct(): Promise<number> {
  const goals = await getFinanceGoals();
  if (goals.length === 0) return 0;
  const pcts = goals.map((g) => (g.targetAmount > 0 ? Math.min(1, getGoalCurrentAmount(g) / g.targetAmount) : 0));
  return Math.round((pcts.reduce((sum, p) => sum + p, 0) / pcts.length) * 100);
}

// ─── Allocation calculator ────────────────────────────────────────────────────

export function computeAllocation(income: number, categories: FinanceCategory[]): AllocationResult[] {
  return categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      categoryId: c.id,
      name: c.name,
      color: c.color,
      percentage: c.percentage,
      amount: Math.round(income * (c.percentage / 100) * 100) / 100,
    }));
}

export async function getCalcHistory(): Promise<AllocationCalculation[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.financeCalcHistory);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveCalcHistory(history: AllocationCalculation[]): Promise<void> {
  try { await AsyncStorage.setItem(KEYS.financeCalcHistory, JSON.stringify(history)); } catch {}
}

export async function addCalcToHistory(calc: AllocationCalculation): Promise<void> {
  const history = await getCalcHistory();
  await saveCalcHistory([calc, ...history]);
}

export async function deleteCalcFromHistory(id: string): Promise<void> {
  const history = await getCalcHistory();
  await saveCalcHistory(history.filter((c) => c.id !== id));
}

export async function duplicateCalcInHistory(id: string): Promise<AllocationCalculation | null> {
  const history = await getCalcHistory();
  const original = history.find((c) => c.id === id);
  if (!original) return null;
  const copy: AllocationCalculation = {
    ...original,
    id: newFinanceId('calc'),
    createdAt: Date.now(),
    label: original.label ? `${original.label} (Copy)` : undefined,
  };
  await saveCalcHistory([copy, ...history]);
  return copy;
}

/** Bridges a saved calculation into concrete monthly budgets — overwrites
 *  any existing non-recurring override for that category/month, matching
 *  the "one tap, confirmed destructive" pattern used elsewhere in the app. */
export async function applyCalculationToBudgets(calc: AllocationCalculation, monthKey: string): Promise<void> {
  const budgets = await getBudgets();
  for (const result of calc.results) {
    const idx = budgets.findIndex((b) => b.categoryId === result.categoryId && b.monthKey === monthKey && !b.recurring);
    if (idx >= 0) budgets[idx] = { ...budgets[idx], amount: result.amount };
    else budgets.push({ id: newFinanceId('bud'), categoryId: result.categoryId, monthKey, amount: result.amount, recurring: false });
  }
  await saveBudgets(budgets);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  onboarded: false,
  templateId: 'personal',
  currencyCode: 'USD',
  lockMode: 'none',
  balanceAdjustment: 0,
};

export async function getFinanceSettings(): Promise<FinanceSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.financeSettings);
    return raw ? { ...DEFAULT_FINANCE_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_FINANCE_SETTINGS };
  } catch { return { ...DEFAULT_FINANCE_SETTINGS }; }
}

export async function saveFinanceSettings(settings: FinanceSettings): Promise<void> {
  try { await AsyncStorage.setItem(KEYS.financeSettings, JSON.stringify(settings)); } catch {}
}

export async function resetFinanceData(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const financeKeys = keys.filter((k) => k.startsWith('@vitalis/finance_'));
    await AsyncStorage.multiRemove(financeKeys);
  } catch {}
}

// ─── Currency ─────────────────────────────────────────────────────────────────

export const CURRENCIES = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'NGN', symbol: '₦' },
  { code: 'KES', symbol: 'KSh' },
  { code: 'GHS', symbol: 'GH₵' },
  { code: 'ZAR', symbol: 'R' },
  { code: 'INR', symbol: '₹' },
  { code: 'CAD', symbol: 'CA$' },
  { code: 'AUD', symbol: 'AU$' },
];

export function fmtCurrency(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

export function fmtCompactCurrency(amount: number, currencyCode: string): string {
  const symbol = CURRENCIES.find((c) => c.code === currencyCode)?.symbol ?? currencyCode;
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${symbol}${(amount / 1_000).toFixed(1)}K`;
  return `${symbol}${amount.toFixed(0)}`;
}

// ─── Aggregates ───────────────────────────────────────────────────────────────

export async function getTotalBalance(): Promise<number> {
  const [transactions, settings] = await Promise.all([getTransactions(), getFinanceSettings()]);
  let total = settings.balanceAdjustment;
  for (const t of transactions) {
    if (t.type === 'income') total += t.amount;
    else if (t.type === 'expense') total -= t.amount;
    // transfers move money between category envelopes only — net-zero on total balance
  }
  return total;
}

export async function getMonthSummary(monthKey: string): Promise<{ income: number; expense: number; net: number }> {
  const transactions = await getTransactionsForMonth(monthKey);
  const income = transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  return { income, expense, net: income - expense };
}

export interface ReportSummary {
  monthKey: string;
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  highestSpendingCategory: { name: string; amount: number } | null;
  highestIncomeSource: { label: string; amount: number } | null;
  goalProgress: { label: string; pct: number }[];
  budgetPerformance: { categoryName: string; budgeted: number; spent: number; pct: number }[];
}

export async function getReportSummary(monthKey: string): Promise<ReportSummary> {
  const [monthTx, categories, budgets, goals] = await Promise.all([
    getTransactionsForMonth(monthKey), getCategories(), getBudgets(), getFinanceGoals(),
  ]);

  const totalIncome = monthTx.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = monthTx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

  const spendByCategory = new Map<string, number>();
  for (const t of monthTx) {
    if (t.type === 'expense' && t.categoryId) {
      spendByCategory.set(t.categoryId, (spendByCategory.get(t.categoryId) ?? 0) + t.amount);
    }
  }
  let highestSpendingCategory: ReportSummary['highestSpendingCategory'] = null;
  for (const [catId, amount] of spendByCategory) {
    if (!highestSpendingCategory || amount > highestSpendingCategory.amount) {
      const cat = categories.find((c) => c.id === catId);
      highestSpendingCategory = { name: cat?.name ?? 'Uncategorized', amount };
    }
  }

  const incomeBySource = new Map<string, number>();
  for (const t of monthTx) {
    if (t.type === 'income') {
      const label = t.sourceLabel?.trim() || 'Unlabeled';
      incomeBySource.set(label, (incomeBySource.get(label) ?? 0) + t.amount);
    }
  }
  let highestIncomeSource: ReportSummary['highestIncomeSource'] = null;
  for (const [label, amount] of incomeBySource) {
    if (!highestIncomeSource || amount > highestIncomeSource.amount) highestIncomeSource = { label, amount };
  }

  const goalProgress = goals.map((g) => ({
    label: g.label,
    pct: g.targetAmount > 0 ? Math.min(100, Math.round((getGoalCurrentAmount(g) / g.targetAmount) * 100)) : 0,
  }));

  const budgetPerformance = budgets
    .filter((b) => b.recurring || b.monthKey === monthKey)
    .map((b) => {
      const cat = categories.find((c) => c.id === b.categoryId);
      const spent = categoryNetOutflow(b.categoryId, monthTx);
      return {
        categoryName: cat?.name ?? 'Uncategorized',
        budgeted: b.amount,
        spent,
        pct: b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0,
      };
    });

  return {
    monthKey, totalIncome, totalExpense, netSavings: totalIncome - totalExpense,
    highestSpendingCategory, highestIncomeSource, goalProgress, budgetPerformance,
  };
}
