import React from 'react';
import { Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONTS, SPACING, RADII } from '../../theme';

export interface FinanceSection { id: string; label: string; }

interface FinanceSectionTabsProps {
  sections: FinanceSection[];
  active: string;
  onChange: (id: string) => void;
}

/** Scrollable pill strip — visual clone of PlannerScreen's Segmented control,
 *  widened to a horizontal ScrollView since Finance has 9 sections instead
 *  of 3, which won't fit a fixed-width row. */
export function FinanceSectionTabs({ sections, active, onChange }: FinanceSectionTabsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.wrap} contentContainerStyle={styles.content}>
      {sections.map((s) => (
        <TouchableOpacity
          key={s.id}
          style={[styles.seg, active === s.id && styles.segActive]}
          onPress={() => onChange(s.id)}
          activeOpacity={0.8}
        >
          <Text style={[styles.segText, active === s.id && styles.segTextActive]}>{s.label.toUpperCase()}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 0, marginBottom: SPACING.md },
  content: { flexDirection: 'row', gap: SPACING.xs, paddingRight: SPACING.md },
  seg: {
    paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADII.full,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
  },
  segActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  segText: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },
  segTextActive: { color: COLORS.textInverse },
});
