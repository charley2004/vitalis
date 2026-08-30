import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../theme';
import { AppIcon, WalletIcon } from '../../components/icons';
import {
  FINANCE_TEMPLATES, CATEGORY_COLOR_SWATCHES, CURRENCIES,
  validateAllocation, saveCategories, saveFinanceSettings, DEFAULT_FINANCE_SETTINGS, newFinanceId,
  type FinanceTemplateId, type FinanceCategory,
} from '../../services/finance';
import { CategoryFormModal } from './modals/CategoryFormModal';

type Step = 'template' | 'review' | 'confirm';

interface FinanceOnboardingProps {
  onComplete: () => void;
}

export function FinanceOnboarding({ onComplete }: FinanceOnboardingProps) {
  const [step, setStep] = useState<Step>('template');
  const [templateId, setTemplateId] = useState<FinanceTemplateId>('personal');
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [editing, setEditing] = useState<FinanceCategory | null | 'new'>(null);
  const [saving, setSaving] = useState(false);

  const applyTemplateLocally = useCallback((id: FinanceTemplateId) => {
    const template = FINANCE_TEMPLATES[id];
    setCategories(template.categories.map((c, i) => ({
      id: newFinanceId('cat'),
      order: i,
      color: CATEGORY_COLOR_SWATCHES[i % CATEGORY_COLOR_SWATCHES.length],
      ...c,
    })));
  }, []);

  const handlePickTemplate = useCallback((id: FinanceTemplateId) => {
    setTemplateId(id);
    applyTemplateLocally(id);
    setStep('review');
  }, [applyTemplateLocally]);

  const { valid, total } = validateAllocation(categories);

  const handleSaveCategory = useCallback((category: FinanceCategory) => {
    setCategories((prev) => {
      const idx = prev.findIndex((c) => c.id === category.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = category; return next; }
      return [...prev, category];
    });
  }, []);

  const handleDeleteCategory = useCallback((id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    setEditing(null);
  }, []);

  const handleReorder = useCallback((id: string, direction: -1 | 1) => {
    setCategories((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((c) => c.id === id);
      const swapIdx = idx + direction;
      if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return prev;
      const a = sorted[idx], b = sorted[swapIdx];
      const aOrder = a.order, bOrder = b.order;
      return prev.map((c) => {
        if (c.id === a.id) return { ...c, order: bOrder };
        if (c.id === b.id) return { ...c, order: aOrder };
        return c;
      });
    });
  }, []);

  const handleFinish = useCallback(async () => {
    setSaving(true);
    await saveCategories(categories);
    await saveFinanceSettings({ ...DEFAULT_FINANCE_SETTINGS, onboarded: true, templateId, currencyCode });
    setSaving(false);
    onComplete();
  }, [categories, templateId, currencyCode, onComplete]);

  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {step === 'template' && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroBox}><WalletIcon size={34} color={COLORS.textPrimary} /></View>
          <Text style={styles.heroTitle}>SET UP FINANCE</Text>
          <Text style={styles.heroSub}>Pick a starting template — you can rename, add, or remove categories after.</Text>
          {(Object.keys(FINANCE_TEMPLATES) as FinanceTemplateId[]).map((id) => {
            const t = FINANCE_TEMPLATES[id];
            return (
              <TouchableOpacity key={id} style={styles.templateCard} onPress={() => handlePickTemplate(id)} activeOpacity={0.8}>
                <View style={styles.templateTop}>
                  <Text style={styles.templateLabel}>{t.label.toUpperCase()}</Text>
                  <Text style={styles.templateArrow}>→</Text>
                </View>
                <Text style={styles.templateDesc}>{t.description}</Text>
                {t.categories.length > 0 && (
                  <Text style={styles.templateCats} numberOfLines={1}>
                    {t.categories.map((c) => c.name).join(' · ')}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {step === 'review' && (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <StepHeader title="CATEGORIES" onBack={() => setStep('template')} />
            <Text style={styles.heroSub}>Adjust names, colors, and percentages — the total must equal exactly 100%.</Text>

            <View style={[styles.totalBadge, valid ? styles.totalBadgeOk : styles.totalBadgeBad]}>
              <Text style={[styles.totalBadgeText, { color: valid ? COLORS.textPrimary : COLORS.red }]}>
                TOTAL: {total}%{valid ? '' : ' — MUST EQUAL 100%'}
              </Text>
            </View>

            {sortedCategories.map((c, i) => (
              <View key={c.id} style={styles.catRow}>
                <View style={styles.reorderCol}>
                  <TouchableOpacity disabled={i === 0} onPress={() => handleReorder(c.id, -1)} hitSlop={8}>
                    <Text style={[styles.reorderArrow, i === 0 && styles.reorderArrowDisabled]}>▲</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={i === sortedCategories.length - 1} onPress={() => handleReorder(c.id, 1)} hitSlop={8}>
                    <Text style={[styles.reorderArrow, i === sortedCategories.length - 1 && styles.reorderArrowDisabled]}>▼</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.catBody} onPress={() => setEditing(c)} activeOpacity={0.7}>
                  <View style={[styles.catIconBox, { borderColor: c.color }]}>
                    <AppIcon id={c.emoji} size={16} color={c.color} />
                  </View>
                  <Text style={styles.catName} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.catPct}>{c.percentage}%</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addCatBtn} onPress={() => setEditing('new')} activeOpacity={0.7}>
              <Text style={styles.addCatText}>+ ADD CATEGORY</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.resetBtn} onPress={() => applyTemplateLocally(templateId)} activeOpacity={0.7}>
              <Text style={styles.resetText}>RESET TO DEFAULT</Text>
            </TouchableOpacity>
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.continueBtn, !valid && styles.continueBtnDisabled]}
              disabled={!valid}
              onPress={() => setStep('confirm')}
              activeOpacity={0.8}
            >
              <Text style={styles.continueText}>CONTINUE</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {step === 'confirm' && (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <StepHeader title="CURRENCY" onBack={() => setStep('review')} />
            <Text style={styles.heroSub}>Choose the currency Finance should display everywhere.</Text>
            <View style={styles.currencyGrid}>
              {CURRENCIES.map((c) => (
                <TouchableOpacity
                  key={c.code}
                  style={[styles.currencyChip, currencyCode === c.code && styles.currencyChipActive]}
                  onPress={() => setCurrencyCode(c.code)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.currencyChipText, currencyCode === c.code && styles.currencyChipTextActive]}>
                    {c.symbol} {c.code}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.heroSub, { marginTop: SPACING.lg }]}>Summary</Text>
            <View style={styles.summaryCard}>
              {sortedCategories.map((c) => (
                <View key={c.id} style={styles.summaryRow}>
                  <View style={[styles.summaryDot, { backgroundColor: c.color }]} />
                  <Text style={styles.summaryName}>{c.name}</Text>
                  <Text style={styles.summaryPct}>{c.percentage}%</Text>
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity style={styles.continueBtn} onPress={handleFinish} disabled={saving} activeOpacity={0.8}>
              <Text style={styles.continueText}>{saving ? 'SETTING UP…' : 'GET STARTED'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <CategoryFormModal
        visible={editing !== null}
        initial={editing === 'new' ? null : editing}
        existingCount={categories.length}
        onClose={() => setEditing(null)}
        onSave={handleSaveCategory}
        onDelete={editing && editing !== 'new' ? () => handleDeleteCategory(editing.id) : undefined}
      />
    </SafeAreaView>
  );
}

function StepHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.stepHeader}>
      <TouchableOpacity onPress={onBack} hitSlop={10} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Back">
        <Text style={styles.backArrow}>‹</Text>
      </TouchableOpacity>
      <Text style={styles.stepHeaderTitle}>{title}</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.screenPad, paddingBottom: SPACING.xxxl, gap: SPACING.sm },
  heroBox: {
    width: 56, height: 56, borderRadius: RADII.lg, borderWidth: 1, borderColor: COLORS.borderNeon,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, marginBottom: SPACING.sm,
  },
  heroTitle: { fontSize: FONT_SIZE.xl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1 },
  heroSub: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.body ?? undefined, lineHeight: FONT_SIZE.sm * 1.5, marginBottom: SPACING.sm },

  stepHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xs },
  backArrow: { fontSize: 28, color: COLORS.textPrimary, lineHeight: 28 },
  stepHeaderTitle: { fontSize: FONT_SIZE.md, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1 },

  templateCard: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.lg,
    backgroundColor: COLORS.surfaceSolid, padding: SPACING.md, gap: SPACING.xxs,
  },
  templateTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  templateLabel: { fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.headingSemi ?? undefined, fontWeight: '700', letterSpacing: 1 },
  templateArrow: { fontSize: FONT_SIZE.lg, color: COLORS.textMuted },
  templateDesc: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.body ?? undefined },
  templateCats: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5, marginTop: 2 },

  totalBadge: { borderWidth: 1, borderRadius: RADII.sm, paddingVertical: SPACING.xs, alignItems: 'center', marginBottom: SPACING.xs },
  totalBadgeOk: { borderColor: COLORS.borderNeon, backgroundColor: COLORS.surface },
  totalBadgeBad: { borderColor: COLORS.red },
  totalBadgeText: { fontSize: FONT_SIZE.xs, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1.5 },

  catRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  reorderCol: { gap: 2 },
  reorderArrow: { fontSize: 10, color: COLORS.textMuted },
  reorderArrowDisabled: { opacity: 0.25 },
  catBody: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.md,
    backgroundColor: COLORS.surface, padding: SPACING.sm,
  },
  catIconBox: { width: 30, height: 30, borderRadius: RADII.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  catName: { flex: 1, fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.bodyMedium ?? undefined },
  catPct: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, fontWeight: '600' },

  addCatBtn: { borderWidth: 1, borderColor: COLORS.borderNeon, borderStyle: 'dashed', borderRadius: RADII.md, paddingVertical: SPACING.sm, alignItems: 'center', marginTop: SPACING.xs },
  addCatText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  resetBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
  resetText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },

  currencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  currencyChip: { borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, backgroundColor: COLORS.surface },
  currencyChipActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  currencyChipText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, fontWeight: '600' },
  currencyChipTextActive: { color: COLORS.textInverse },

  summaryCard: { borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.md, backgroundColor: COLORS.surfaceSolid, padding: SPACING.md, gap: SPACING.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  summaryDot: { width: 8, height: 8, borderRadius: RADII.full },
  summaryName: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.body ?? undefined },
  summaryPct: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined, fontWeight: '600' },

  footer: { padding: SPACING.screenPad, paddingTop: SPACING.sm },
  continueBtn: { backgroundColor: COLORS.white, borderRadius: RADII.md, paddingVertical: SPACING.md, alignItems: 'center' },
  continueBtnDisabled: { opacity: 0.35 },
  continueText: { fontSize: FONT_SIZE.sm, color: COLORS.textInverse, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1.5 },
});
