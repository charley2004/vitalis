import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import { GlassCard } from '../../../components/GlassCard';
import { AppIcon } from '../../../components/icons';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../../theme';
import {
  getTransactions, getCategories, deleteTransaction, fmtCurrency,
  type FinanceSettings, type FinanceTransaction, type FinanceCategory, type TransactionType,
} from '../../../services/finance';
import { TransactionFormModal } from '../modals/TransactionFormModal';

interface TransactionsSectionProps {
  settings: FinanceSettings;
  onChanged: () => void;
}

type FilterType = 'all' | TransactionType;
const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'income', label: 'INCOME' },
  { id: 'expense', label: 'EXPENSE' },
  { id: 'transfer', label: 'TRANSFER' },
];

export function TransactionsSection({ settings, onChanged }: TransactionsSectionProps) {
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<FinanceTransaction | null>(null);

  const load = useCallback(() => {
    Promise.all([getTransactions(), getCategories()]).then(([tx, cats]) => {
      setTransactions([...tx].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt));
      setCategories(cats);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const filtered = transactions.filter((t) => {
    if (filter !== 'all' && t.type !== filter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const cat = t.categoryId ? categoryMap.get(t.categoryId) : undefined;
      const hay = `${cat?.name ?? ''} ${t.notes ?? ''} ${t.sourceLabel ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const grouped: Record<string, FinanceTransaction[]> = {};
  for (const t of filtered) {
    if (!grouped[t.date]) grouped[t.date] = [];
    grouped[t.date].push(t);
  }
  const dateKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const handleSaved = useCallback(() => { load(); onChanged(); }, [load, onChanged]);
  const handleDeleted = useCallback(() => { load(); onChanged(); }, [load, onChanged]);

  const handleLongPress = useCallback((t: FinanceTransaction) => {
    Alert.alert('Transaction', undefined, [
      { text: 'Edit', onPress: () => setEditing(t) },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => { await deleteTransaction(t.id); handleDeleted(); },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [handleDeleted]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.id}
            onPress={() => setFilter(f.id)}
            style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, filter === f.id && styles.filterChipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search transactions"
          placeholderTextColor={COLORS.textMuted}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {dateKeys.length === 0 ? (
          <Text style={styles.emptyText}>No transactions found.</Text>
        ) : dateKeys.map((dateKey) => (
          <View key={dateKey} style={styles.dateGroup}>
            <Text style={styles.dateLabel}>{dateKey}</Text>
            <GlassCard>
              {grouped[dateKey].map((t) => {
                const cat = t.categoryId ? categoryMap.get(t.categoryId) : undefined;
                const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
                const color = t.type === 'income' ? COLORS.textPrimary : t.type === 'expense' ? COLORS.textSecondary : COLORS.amber;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.txRow}
                    onPress={() => setEditing(t)}
                    onLongPress={() => handleLongPress(t)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.txIconBox, { borderColor: cat?.color ?? COLORS.borderNeon }]}>
                      <AppIcon id={cat?.emoji ?? (t.type === 'transfer' ? 'transfer' : 'tag')} size={16} color={cat?.color ?? COLORS.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txName} numberOfLines={1}>{cat?.name ?? (t.type === 'transfer' ? 'Transfer' : 'Uncategorized')}</Text>
                      {!!t.notes && <Text style={styles.txNotes} numberOfLines={1}>{t.notes}</Text>}
                    </View>
                    <Text style={[styles.txAmount, { color }]}>{sign}{fmtCurrency(t.amount, settings.currencyCode)}</Text>
                  </TouchableOpacity>
                );
              })}
            </GlassCard>
          </View>
        ))}
        <View style={{ height: 100 }} />
      </ScrollView>

      <TransactionFormModal
        visible={editing !== null}
        initial={editing}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: 'row', gap: SPACING.xs, paddingHorizontal: SPACING.screenPad, paddingBottom: SPACING.sm },
  filterChip: { borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.full, paddingHorizontal: SPACING.md, paddingVertical: 6, backgroundColor: COLORS.surface },
  filterChipActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  filterChipText: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },
  filterChipTextActive: { color: COLORS.textInverse },

  searchWrap: { paddingHorizontal: SPACING.screenPad, marginBottom: SPACING.sm },
  searchInput: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2,
    fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.body ?? undefined,
    backgroundColor: COLORS.surface,
  },

  content: { paddingHorizontal: SPACING.screenPad, gap: SPACING.md },
  emptyText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.body ?? undefined, textAlign: 'center', marginTop: SPACING.xl },

  dateGroup: { gap: SPACING.xs },
  dateLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5 },

  txRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs, borderBottomWidth: 1, borderBottomColor: COLORS.borderDim },
  txIconBox: { width: 32, height: 32, borderRadius: RADII.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  txName: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.bodyMedium ?? undefined },
  txNotes: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.body ?? undefined, marginTop: 2 },
  txAmount: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.mono ?? undefined, fontWeight: '700' },
});
