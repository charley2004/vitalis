import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { GlassCard } from '../../../components/GlassCard';
import { DonutChart } from '../../../components/finance/DonutChart';
import { BarChart } from '../../../components/finance/BarChart';
import { TrendLineChart } from '../../../components/finance/TrendLineChart';
import { FinanceSectionTabs } from '../../../components/finance/FinanceSectionTabs';
import { DateField } from '../../../components/finance/DateField';
import { COLORS, FONTS, FONT_SIZE, SPACING } from '../../../theme';
import {
  getTransactionsInRange, getCategories, fmtCompactCurrency,
  type FinanceSettings, type FinanceTransaction, type FinanceCategory,
} from '../../../services/finance';
import { getTodayKey } from '../../../services/storage';
import { addDaysKey } from '../../../services/calendar';

type RangeFilter = 'week' | 'month' | 'year' | 'custom';

const RANGE_FILTERS = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'custom', label: 'Custom' },
];

const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function computeRange(filter: RangeFilter, customStart: string, customEnd: string): { start: string; end: string } {
  const today = getTodayKey();
  if (filter === 'week') return { start: addDaysKey(today, -6), end: today };
  if (filter === 'month') {
    const [y, m] = today.split('-').map(Number);
    return { start: `${y}-${String(m).padStart(2, '0')}-01`, end: today };
  }
  if (filter === 'year') {
    const y = today.split('-')[0];
    return { start: `${y}-01-01`, end: today };
  }
  return { start: customStart, end: customEnd };
}

function monthKeysInRange(start: string, end: string): string[] {
  const keys: string[] = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 60) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
    guard++;
  }
  return keys;
}

interface AnalyticsSectionProps {
  settings: FinanceSettings;
}

export function AnalyticsSection({ settings }: AnalyticsSectionProps) {
  const [filter, setFilter] = useState<RangeFilter>('month');
  const [customStart, setCustomStart] = useState(addDaysKey(getTodayKey(), -30));
  const [customEnd, setCustomEnd] = useState(getTodayKey());
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);

  const { start, end } = computeRange(filter, customStart, customEnd);

  useEffect(() => {
    Promise.all([getTransactionsInRange(start, end), getCategories()]).then(([tx, cats]) => {
      setTransactions(tx);
      setCategories(cats);
    });
  }, [start, end]);

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const income = transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

  const spendByCategory = new Map<string, number>();
  for (const t of transactions) {
    if (t.type === 'expense' && t.categoryId) {
      spendByCategory.set(t.categoryId, (spendByCategory.get(t.categoryId) ?? 0) + t.amount);
    }
  }
  const breakdownData = [...spendByCategory.entries()].map(([catId, amount]) => {
    const cat = categoryMap.get(catId);
    return { label: cat?.name ?? 'Uncategorized', value: amount, color: cat?.color ?? COLORS.textMuted };
  });

  const monthKeys = monthKeysInRange(start, end);
  const monthLabels = monthKeys.map((k) => MONTHS_SHORT[parseInt(k.split('-')[1], 10) - 1]);
  const expenseByMonth = monthKeys.map((mk) => transactions.filter((t) => t.type === 'expense' && t.date.startsWith(mk)).reduce((sum, t) => sum + t.amount, 0));
  const incomeByMonth = monthKeys.map((mk) => transactions.filter((t) => t.type === 'income' && t.date.startsWith(mk)).reduce((sum, t) => sum + t.amount, 0));
  let running = 0;
  const savingsGrowth = monthKeys.map((_, i) => { running += incomeByMonth[i] - expenseByMonth[i]; return running; });

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <FinanceSectionTabs sections={RANGE_FILTERS} active={filter} onChange={(id) => setFilter(id as RangeFilter)} />

      {filter === 'custom' && (
        <View style={styles.customRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>FROM</Text>
            <DateField value={customStart} onChange={setCustomStart} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>TO</Text>
            <DateField value={customEnd} onChange={setCustomEnd} />
          </View>
        </View>
      )}

      <GlassCard>
        <Text style={styles.cardTitle}>INCOME VS EXPENSES</Text>
        <BarChart
          data={[
            { label: 'INCOME', value: income, color: '#199e70' },
            { label: 'EXPENSE', value: expense, color: '#e66767' },
          ]}
          valueFormatter={(v) => fmtCompactCurrency(v, settings.currencyCode)}
        />
      </GlassCard>

      {breakdownData.length > 0 && (
        <GlassCard>
          <Text style={styles.cardTitle}>CATEGORY BREAKDOWN</Text>
          <DonutChart data={breakdownData} />
        </GlassCard>
      )}

      {monthKeys.length > 1 && (
        <>
          <GlassCard>
            <Text style={styles.cardTitle}>MONTHLY SPENDING TREND</Text>
            <TrendLineChart points={expenseByMonth} labels={monthLabels} smooth={false} color={COLORS.textSecondary} />
          </GlassCard>
          <GlassCard>
            <Text style={styles.cardTitle}>MONTHLY INCOME TREND</Text>
            <TrendLineChart points={incomeByMonth} labels={monthLabels} smooth={false} color={COLORS.textPrimary} />
          </GlassCard>
          <GlassCard>
            <Text style={styles.cardTitle}>SAVINGS GROWTH</Text>
            <TrendLineChart points={savingsGrowth} labels={monthLabels} smooth color={COLORS.textPrimary} />
          </GlassCard>
        </>
      )}

      {categories.length > 0 && (
        <GlassCard>
          <Text style={styles.cardTitle}>CATEGORY ALLOCATION</Text>
          <DonutChart data={categories.map((c) => ({ label: c.name, value: c.percentage, color: c.color }))} />
        </GlassCard>
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.screenPad, gap: SPACING.md },
  customRow: { flexDirection: 'row', gap: SPACING.sm },
  fieldLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginBottom: SPACING.xs },
  cardTitle: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700', marginBottom: SPACING.sm },
});
