import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { GlassCard } from '../../../components/GlassCard';
import { CategoryCard } from '../../../components/finance/CategoryCard';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../../theme';
import {
  getCategories, computeAllocation, addCalcToHistory, applyCalculationToBudgets,
  newFinanceId, currentMonthKey, fmtCurrency, fmtCompactCurrency, validateAllocation,
  type FinanceSettings, type FinanceCategory, type AllocationResult, type AllocationCalculation,
} from '../../../services/finance';

interface CalculatorSectionProps {
  settings: FinanceSettings;
  onChanged: () => void;
  /** Set when History's "Reload" hands a past calculation back to the calculator */
  preload?: AllocationCalculation | null;
}

const QUICK_AMOUNTS = [50000, 100000, 250000, 500000, 1000000];

export function CalculatorSection({ settings, onChanged, preload }: CalculatorSectionProps) {
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [income, setIncome] = useState(preload ? String(preload.incomeAmount) : '');
  const [saved, setSaved] = useState(false);

  useEffect(() => { getCategories().then(setCategories); }, []);
  useEffect(() => { if (preload) setIncome(String(preload.incomeAmount)); }, [preload]);

  const incomeNum = parseFloat(income) || 0;
  const { valid } = validateAllocation(categories);
  const results: AllocationResult[] = incomeNum > 0 && valid ? computeAllocation(incomeNum, categories) : [];

  const handleSaveHistory = useCallback(async () => {
    if (results.length === 0) return;
    await addCalcToHistory({ id: newFinanceId('calc'), incomeAmount: incomeNum, results, createdAt: Date.now() });
    setSaved(true);
    onChanged();
    setTimeout(() => setSaved(false), 1500);
  }, [results, incomeNum, onChanged]);

  const handleApplyToBudgets = useCallback(() => {
    if (results.length === 0) return;
    Alert.alert(
      "Apply to This Month's Budgets",
      "This will overwrite any existing budget you've set for these categories this month.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply',
          onPress: async () => {
            await applyCalculationToBudgets(
              { id: newFinanceId('calc'), incomeAmount: incomeNum, results, createdAt: Date.now() },
              currentMonthKey(),
            );
            onChanged();
          },
        },
      ],
    );
  }, [results, incomeNum, onChanged]);

  const buildShareText = useCallback(() => {
    const lines = [`Income: ${fmtCurrency(incomeNum, settings.currencyCode)}`, ''];
    for (const r of results) lines.push(`${r.name} (${r.percentage}%): ${fmtCurrency(r.amount, settings.currencyCode)}`);
    return lines.join('\n');
  }, [results, incomeNum, settings.currencyCode]);

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(buildShareText());
  }, [buildShareText]);

  const handleShare = useCallback(async () => {
    await Share.share({ message: buildShareText() });
  }, [buildShareText]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <GlassCard>
        <Text style={styles.fieldLabel}>INCOME AMOUNT</Text>
        <TextInput
          style={styles.incomeInput}
          value={income}
          onChangeText={setIncome}
          placeholder="0.00"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="decimal-pad"
        />
        <View style={styles.quickRow}>
          {QUICK_AMOUNTS.map((a) => (
            <TouchableOpacity key={a} onPress={() => setIncome(String(a))} style={styles.quickChip} activeOpacity={0.7}>
              <Text style={styles.quickChipText}>{fmtCompactCurrency(a, settings.currencyCode)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </GlassCard>

      {!valid && (
        <GlassCard style={styles.warnCard}>
          <Text style={styles.warnText}>Your categories don't add up to 100% yet — fix this in Finance Settings before calculating.</Text>
        </GlassCard>
      )}

      {results.length > 0 && (
        <>
          <View style={styles.grid}>
            {results.map((r) => {
              const cat = categories.find((c) => c.id === r.categoryId);
              if (!cat) return null;
              return <CategoryCard key={r.categoryId} category={cat} currencyCode={settings.currencyCode} amount={r.amount} />;
            })}
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCopy} activeOpacity={0.7}>
              <Text style={styles.actionText}>COPY</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleShare} activeOpacity={0.7}>
              <Text style={styles.actionText}>SHARE</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveHistory} activeOpacity={0.7}>
            <Text style={styles.saveBtnText}>{saved ? 'SAVED ✓' : 'SAVE TO HISTORY'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.applyBtn} onPress={handleApplyToBudgets} activeOpacity={0.7}>
            <Text style={styles.applyBtnText}>APPLY TO THIS MONTH'S BUDGETS</Text>
          </TouchableOpacity>
        </>
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.screenPad, gap: SPACING.md },
  fieldLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginBottom: SPACING.xs },
  incomeInput: {
    fontSize: FONT_SIZE.xxl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700',
    borderBottomWidth: 1, borderBottomColor: COLORS.borderNeon, paddingVertical: SPACING.xs, marginBottom: SPACING.sm,
  },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  quickChip: { borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.full, paddingHorizontal: SPACING.sm, paddingVertical: 6, backgroundColor: COLORS.surface },
  quickChipText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, fontWeight: '600' },

  warnCard: { borderColor: COLORS.amber },
  warnText: { fontSize: FONT_SIZE.sm, color: COLORS.amber, fontFamily: FONTS.body ?? undefined },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },

  actionRow: { flexDirection: 'row', gap: SPACING.sm },
  actionBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  actionText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  saveBtn: { backgroundColor: COLORS.white, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  saveBtnText: { fontSize: FONT_SIZE.sm, color: COLORS.textInverse, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  applyBtn: { borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  applyBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
});
