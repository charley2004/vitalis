import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { GlassCard } from '../../../components/GlassCard';
import { AppIcon } from '../../../components/icons';
import { ProgressRing } from '../../../components/finance/ProgressRing';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../../theme';
import {
  getCategories, getBudgets, getCategorySpend, currentMonthKey, fmtCurrency,
  type FinanceSettings, type FinanceCategory, type FinanceBudget,
} from '../../../services/finance';
import { BudgetFormModal } from '../modals/BudgetFormModal';

interface BudgetsSectionProps {
  settings: FinanceSettings;
  onChanged: () => void;
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function resolveBudget(budgets: FinanceBudget[], categoryId: string, monthKey: string): FinanceBudget | null {
  const override = budgets.find((b) => b.categoryId === categoryId && b.monthKey === monthKey && !b.recurring);
  if (override) return override;
  return budgets.find((b) => b.categoryId === categoryId && b.recurring) ?? null;
}

export function BudgetsSection({ settings, onChanged }: BudgetsSectionProps) {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [budgets, setBudgets] = useState<FinanceBudget[]>([]);
  const [spendByCategory, setSpendByCategory] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<{ category: FinanceCategory; budget: FinanceBudget | null } | null>(null);

  const load = useCallback(async () => {
    const [cats, buds] = await Promise.all([getCategories(), getBudgets()]);
    setCategories(cats);
    setBudgets(buds);
    const spends = await Promise.all(cats.map((c) => getCategorySpend(c.id, monthKey)));
    const spendMap: Record<string, number> = {};
    cats.forEach((c, i) => { spendMap[c.id] = spends[i]; });
    setSpendByCategory(spendMap);
  }, [monthKey]);

  useEffect(() => { load(); }, [load]);

  const handleSaved = useCallback(() => { load(); onChanged(); }, [load, onChanged]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.monthRow}>
        <TouchableOpacity onPress={() => setMonthKey((k) => shiftMonth(k, -1))} hitSlop={8}>
          <Text style={styles.monthArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel(monthKey).toUpperCase()}</Text>
        <TouchableOpacity onPress={() => setMonthKey((k) => shiftMonth(k, 1))} hitSlop={8}>
          <Text style={styles.monthArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {categories.length === 0 && (
        <Text style={styles.emptyText}>Set up categories in Finance Settings first.</Text>
      )}

      {categories.map((c) => {
        const budget = resolveBudget(budgets, c.id, monthKey);
        const spent = spendByCategory[c.id] ?? 0;
        const pct = budget && budget.amount > 0 ? Math.round((spent / budget.amount) * 100) : undefined;
        const warnColor = pct !== undefined && pct >= 100 ? COLORS.red : pct !== undefined && pct >= 90 ? COLORS.amber : c.color;
        return (
          <TouchableOpacity key={c.id} onPress={() => setEditing({ category: c, budget })} activeOpacity={0.7}>
            <GlassCard>
              <View style={styles.row}>
                <View style={[styles.iconBox, { borderColor: c.color }]}>
                  <AppIcon id={c.emoji} size={16} color={c.color} />
                </View>
                <Text style={styles.name}>{c.name}</Text>
                <View style={{ flex: 1 }} />
                {pct !== undefined && <ProgressRing pct={Math.min(pct, 100)} size={32} strokeWidth={4} color={warnColor} />}
              </View>
              {budget ? (
                <>
                  <View style={styles.amountRow}>
                    <Text style={[styles.spentText, { color: warnColor }]}>{fmtCurrency(spent, settings.currencyCode)}</Text>
                    <Text style={styles.ofText}> of {fmtCurrency(budget.amount, settings.currencyCode)}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.min(100, pct ?? 0)}%`, backgroundColor: warnColor }]} />
                  </View>
                  {pct !== undefined && pct >= 90 && (
                    <Text style={[styles.warnLabel, { color: warnColor }]}>{pct >= 100 ? 'OVER BUDGET' : 'APPROACHING LIMIT'}</Text>
                  )}
                </>
              ) : (
                <Text style={styles.noBudget}>No budget set — tap to add one.</Text>
              )}
            </GlassCard>
          </TouchableOpacity>
        );
      })}
      <View style={{ height: 100 }} />

      <BudgetFormModal
        visible={editing !== null}
        category={editing?.category ?? null}
        initial={editing?.budget ?? null}
        monthKey={monthKey}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.screenPad, gap: SPACING.sm },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, marginBottom: SPACING.sm },
  monthArrow: { fontSize: 24, color: COLORS.textPrimary, lineHeight: 24 },
  monthLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },
  emptyText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.body ?? undefined, textAlign: 'center', marginTop: SPACING.xl },

  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  iconBox: { width: 30, height: 30, borderRadius: RADII.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.bodySemi ?? undefined, fontWeight: '600' },

  amountRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: SPACING.xs },
  spentText: { fontSize: FONT_SIZE.lg, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  ofText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.body ?? undefined },
  barTrack: { height: 4, backgroundColor: COLORS.borderNeon, borderRadius: RADII.full, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: RADII.full },
  warnLabel: { fontSize: FONT_SIZE.xxs, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700', marginTop: SPACING.xs },
  noBudget: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.body ?? undefined },
});
