import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { GlassCard } from '../../../components/GlassCard';
import { GlassSheet } from '../../../components/GlassSheet';
import { AppIcon } from '../../../components/icons';
import { ProgressRing } from '../../../components/finance/ProgressRing';
import { DateField } from '../../../components/finance/DateField';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../../theme';
import {
  getFinanceGoals, deleteFinanceGoal, addGoalContribution, getGoalCurrentAmount, estimateGoalCompletion,
  fmtCurrency, type FinanceSettings, type FinanceGoal,
} from '../../../services/finance';
import { getTodayKey } from '../../../services/storage';
import { GoalFormModal } from '../modals/GoalFormModal';

interface GoalsSectionProps {
  settings: FinanceSettings;
  onChanged: () => void;
}

function ContributionModal({ visible, goal, onClose, onSaved }: {
  visible: boolean; goal: FinanceGoal | null; onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getTodayKey());

  const handleOpen = useCallback(() => { setAmount(''); setDate(getTodayKey()); }, []);
  const amountNum = parseFloat(amount);
  const isValid = goal !== null && !isNaN(amountNum) && amountNum > 0;

  const handleSave = useCallback(async () => {
    if (!isValid || !goal) return;
    await addGoalContribution(goal.id, amountNum, date);
    onSaved();
    onClose();
  }, [isValid, goal, amountNum, date, onSaved, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={handleOpen}>
      <KeyboardAvoidingView style={contribStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <GlassSheet>
        <View style={contribStyles.sheet}>
          <View style={contribStyles.handle} />
          <Text style={contribStyles.title}>ADD TO {goal?.label.toUpperCase()}</Text>
          <View style={contribStyles.field}>
            <Text style={contribStyles.fieldLabel}>AMOUNT</Text>
            <TextInput
              style={contribStyles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>
          <View style={contribStyles.field}>
            <Text style={contribStyles.fieldLabel}>DATE</Text>
            <DateField value={date} onChange={setDate} />
          </View>
          <View style={contribStyles.actions}>
            <TouchableOpacity onPress={onClose} style={contribStyles.cancelBtn} activeOpacity={0.7}>
              <Text style={contribStyles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={[contribStyles.saveBtn, !isValid && { opacity: 0.4 }]} activeOpacity={0.7} disabled={!isValid}>
              <Text style={contribStyles.saveText}>ADD</Text>
            </TouchableOpacity>
          </View>
        </View>
        </GlassSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function GoalsSection({ settings, onChanged }: GoalsSectionProps) {
  const [goals, setGoals] = useState<FinanceGoal[]>([]);
  const [editing, setEditing] = useState<FinanceGoal | 'new' | null>(null);
  const [contributing, setContributing] = useState<FinanceGoal | null>(null);

  const load = useCallback(() => { getFinanceGoals().then(setGoals); }, []);
  useEffect(() => { load(); }, [load]);

  const handleSaved = useCallback(() => { load(); onChanged(); }, [load, onChanged]);

  const handleLongPress = useCallback((goal: FinanceGoal) => {
    Alert.alert(goal.label, undefined, [
      { text: 'Edit', onPress: () => setEditing(goal) },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteFinanceGoal(goal.id); handleSaved(); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [handleSaved]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {goals.length === 0 && (
        <Text style={styles.emptyText}>No goals yet — add one for a car, vacation, emergency fund, anything you're saving toward.</Text>
      )}
      {goals.map((g) => {
        const current = getGoalCurrentAmount(g);
        const pct = g.targetAmount > 0 ? Math.min(100, Math.round((current / g.targetAmount) * 100)) : 0;
        const { monthsRemaining } = estimateGoalCompletion(g);
        return (
          <TouchableOpacity key={g.id} onLongPress={() => handleLongPress(g)} activeOpacity={0.9}>
            <GlassCard>
              <View style={styles.row}>
                <View style={styles.iconBox}><AppIcon id={g.emoji} size={18} color={COLORS.textPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{g.label}</Text>
                  <Text style={styles.targetDate}>Target: {g.targetDate}</Text>
                </View>
                <ProgressRing pct={pct} size={44} strokeWidth={5} color={COLORS.textPrimary} />
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.currentAmount}>{fmtCurrency(current, settings.currencyCode)}</Text>
                <Text style={styles.targetAmount}> / {fmtCurrency(g.targetAmount, settings.currencyCode)}</Text>
              </View>
              <Text style={styles.completionText}>
                {pct >= 100
                  ? 'Goal reached'
                  : monthsRemaining !== null
                    ? `~${monthsRemaining} ${monthsRemaining === 1 ? 'month' : 'months'} to go at your current pace`
                    : 'Add contributions to estimate a completion date'}
              </Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => setContributing(g)} activeOpacity={0.7}>
                <Text style={styles.addBtnText}>ADD FUNDS</Text>
              </TouchableOpacity>
            </GlassCard>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity style={styles.addGoalBtn} onPress={() => setEditing('new')} activeOpacity={0.7}>
        <Text style={styles.addGoalText}>+ ADD GOAL</Text>
      </TouchableOpacity>
      <View style={{ height: 100 }} />

      <GoalFormModal
        visible={editing !== null}
        initial={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />
      <ContributionModal
        visible={contributing !== null}
        goal={contributing}
        onClose={() => setContributing(null)}
        onSaved={handleSaved}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.screenPad, gap: SPACING.md },
  emptyText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.body ?? undefined, textAlign: 'center', marginTop: SPACING.xl },

  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  iconBox: { width: 36, height: 36, borderRadius: RADII.sm, borderWidth: 1, borderColor: COLORS.borderNeon, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.bodySemi ?? undefined, fontWeight: '600' },
  targetDate: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, marginTop: 2 },

  amountRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: SPACING.xs },
  currentAmount: { fontSize: FONT_SIZE.xl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  targetAmount: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.body ?? undefined },
  completionText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.body ?? undefined, marginBottom: SPACING.sm },

  addBtn: { borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm, paddingVertical: SPACING.xs, alignItems: 'center' },
  addBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },

  addGoalBtn: { borderWidth: 1, borderColor: COLORS.borderNeon, borderStyle: 'dashed', borderRadius: RADII.md, paddingVertical: SPACING.sm, alignItems: 'center' },
  addGoalText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
});

const contribStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.overlay },
  sheet: { padding: SPACING.xl, gap: SPACING.md },
  handle: { width: 36, height: 3, borderRadius: 2, backgroundColor: COLORS.borderBright, alignSelf: 'center', marginBottom: SPACING.xs },
  title: { fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1 },
  field: { gap: SPACING.xs },
  fieldLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5 },
  input: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2,
    fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.body ?? undefined,
    backgroundColor: COLORS.surface,
  },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  cancelText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  saveBtn: { flex: 1, backgroundColor: COLORS.white, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  saveText: { fontSize: FONT_SIZE.sm, color: COLORS.textInverse, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
});
