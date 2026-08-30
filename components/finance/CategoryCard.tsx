import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { GlassCard } from '../GlassCard';
import { AppIcon } from '../icons';
import { ProgressRing } from './ProgressRing';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../theme';
import { fmtCurrency, type FinanceCategory } from '../../services/finance';

interface CategoryCardProps {
  category: FinanceCategory;
  currencyCode: string;
  /** Allocated amount (Calculator) or budgeted cap (Budgets) */
  amount?: number;
  /** Actual spend, paired with amount to render a used% ring */
  spentAmount?: number;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function CategoryCard({ category, currencyCode, amount, spentAmount, onPress, onLongPress }: CategoryCardProps) {
  const pct = amount && amount > 0 && spentAmount !== undefined
    ? Math.round((spentAmount / amount) * 100)
    : undefined;
  const ringColor = pct !== undefined && pct >= 100 ? COLORS.red : pct !== undefined && pct >= 90 ? COLORS.amber : category.color;

  return (
    <TouchableOpacity activeOpacity={onPress ? 0.7 : 1} onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress}>
      <GlassCard style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.iconBox, { borderColor: category.color }]}>
            <AppIcon id={category.emoji} size={18} color={category.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{category.name}</Text>
            <Text style={styles.pct}>{category.percentage}%</Text>
          </View>
          {pct !== undefined && <ProgressRing pct={pct} size={36} strokeWidth={4} color={ringColor} />}
        </View>
        {amount !== undefined && <Text style={styles.amount}>{fmtCurrency(amount, currencyCode)}</Text>}
        {spentAmount !== undefined && amount !== undefined && (
          <Text style={styles.spent}>{fmtCurrency(spentAmount, currencyCode)} spent</Text>
        )}
      </GlassCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { minWidth: 150, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  iconBox: {
    width: 34, height: 34, borderRadius: RADII.sm, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.bodySemi ?? undefined, fontWeight: '600' },
  pct: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, marginTop: 2 },
  amount: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  spent: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.body ?? undefined, marginTop: 2 },
});
