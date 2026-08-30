import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import { GlassCard } from '../../../components/GlassCard';
import { COLORS, FONTS, FONT_SIZE, SPACING } from '../../../theme';
import {
  getCalcHistory, deleteCalcFromHistory, duplicateCalcInHistory, fmtCurrency,
  type FinanceSettings, type AllocationCalculation,
} from '../../../services/finance';

interface HistorySectionProps {
  settings: FinanceSettings;
  onReload: (calc: AllocationCalculation) => void;
  onChanged: () => void;
}

function fmtWhen(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function HistorySection({ settings, onReload, onChanged }: HistorySectionProps) {
  const [history, setHistory] = useState<AllocationCalculation[]>([]);
  const [search, setSearch] = useState('');

  const load = useCallback(() => { getCalcHistory().then(setHistory); }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = history.filter((c) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (c.label ?? '').toLowerCase().includes(q) || String(c.incomeAmount).includes(q);
  });

  const handleLongPress = useCallback((calc: AllocationCalculation) => {
    Alert.alert('Calculation', undefined, [
      { text: 'Reload', onPress: () => onReload(calc) },
      { text: 'Duplicate', onPress: async () => { await duplicateCalcInHistory(calc.id); load(); onChanged(); } },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteCalcFromHistory(calc.id); load(); onChanged(); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [onReload, load, onChanged]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search history"
          placeholderTextColor={COLORS.textMuted}
        />
      </View>
      {filtered.length === 0 ? (
        <Text style={styles.emptyText}>No saved calculations yet — save one from the Calculator.</Text>
      ) : filtered.map((calc) => (
        <TouchableOpacity key={calc.id} onPress={() => onReload(calc)} onLongPress={() => handleLongPress(calc)} activeOpacity={0.7}>
          <GlassCard>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.income}>{fmtCurrency(calc.incomeAmount, settings.currencyCode)}</Text>
                <Text style={styles.when}>{fmtWhen(calc.createdAt)} · {calc.results.length} categories</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
          </GlassCard>
        </TouchableOpacity>
      ))}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.screenPad, gap: SPACING.sm },
  searchWrap: { marginBottom: SPACING.xs },
  searchInput: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: 8,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2,
    fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.body ?? undefined,
    backgroundColor: COLORS.surface,
  },
  emptyText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.body ?? undefined, textAlign: 'center', marginTop: SPACING.xl },
  row: { flexDirection: 'row', alignItems: 'center' },
  income: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  when: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, marginTop: 2 },
  chevron: { fontSize: FONT_SIZE.lg, color: COLORS.textMuted },
});
