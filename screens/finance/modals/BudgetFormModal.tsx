import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../../theme';
import { GlassSheet } from '../../../components/GlassSheet';
import {
  upsertBudget, deleteBudget, syncBudgetReminder, newFinanceId,
  type FinanceCategory, type FinanceBudget,
} from '../../../services/finance';

interface BudgetFormModalProps {
  visible: boolean;
  category: FinanceCategory | null;
  initial: FinanceBudget | null;
  monthKey: string;
  onClose: () => void;
  onSaved: () => void;
}

export function BudgetFormModal({ visible, category, initial, monthKey, onClose, onSaved }: BudgetFormModalProps) {
  const [amount, setAmount] = useState('');
  const [recurring, setRecurring] = useState(true);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [dueDay, setDueDay] = useState(1);

  const handleOpen = useCallback(() => {
    if (initial) {
      setAmount(String(initial.amount));
      setRecurring(initial.recurring !== false);
      setReminderEnabled(initial.reminderEnabled === true);
      setDueDay(initial.dueDay ?? 1);
    } else {
      setAmount('');
      setRecurring(true);
      setReminderEnabled(false);
      setDueDay(1);
    }
  }, [initial]);

  const amountNum = parseFloat(amount);
  const isValid = category !== null && !isNaN(amountNum) && amountNum > 0;

  const handleSave = useCallback(async () => {
    if (!isValid || !category) return;
    let budget: FinanceBudget = {
      id: initial?.id ?? newFinanceId('bud'),
      categoryId: category.id,
      monthKey,
      amount: amountNum,
      recurring,
      dueDay: reminderEnabled ? dueDay : undefined,
      reminderEnabled,
      linkedEventId: initial?.linkedEventId,
    };
    budget = await syncBudgetReminder(budget, category.name, monthKey);
    await upsertBudget(budget);
    onSaved();
    onClose();
  }, [isValid, category, initial, monthKey, amountNum, recurring, reminderEnabled, dueDay, onSaved, onClose]);

  const handleDelete = useCallback(async () => {
    if (!initial) return;
    await deleteBudget(initial.id);
    onSaved();
    onClose();
  }, [initial, onSaved, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={handleOpen}>
      <KeyboardAvoidingView style={formStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <GlassSheet style={formStyles.sheet}>
        <ScrollView contentContainerStyle={formStyles.sheetContent} keyboardShouldPersistTaps="handled">
          <View style={formStyles.handle} />
          <Text style={formStyles.title}>{initial ? 'EDIT' : 'SET'} BUDGET{category ? ` — ${category.name.toUpperCase()}` : ''}</Text>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>MONTHLY CAP</Text>
            <TextInput
              style={formStyles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={[formStyles.field, formStyles.switchRow]}>
            <View style={{ flex: 1 }}>
              <Text style={formStyles.fieldLabel}>RECURS EVERY MONTH</Text>
              <Text style={formStyles.fieldHint}>Off applies this cap to this month only.</Text>
            </View>
            <Switch
              value={recurring}
              onValueChange={setRecurring}
              trackColor={{ false: COLORS.borderNeon, true: COLORS.textPrimary }}
              thumbColor={COLORS.textInverse}
              ios_backgroundColor={COLORS.borderNeon}
            />
          </View>

          <View style={[formStyles.field, formStyles.switchRow]}>
            <View style={{ flex: 1 }}>
              <Text style={formStyles.fieldLabel}>DUE-DATE REMINDER</Text>
              <Text style={formStyles.fieldHint}>Adds a Planner event and a reminder the day before it's due.</Text>
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={setReminderEnabled}
              trackColor={{ false: COLORS.borderNeon, true: COLORS.amber }}
              thumbColor={COLORS.textInverse}
              ios_backgroundColor={COLORS.borderNeon}
            />
          </View>

          {reminderEnabled && (
            <View style={formStyles.field}>
              <Text style={formStyles.fieldLabel}>DUE DAY OF MONTH</Text>
              <View style={formStyles.stepper}>
                <TouchableOpacity onPress={() => setDueDay((v) => Math.max(1, v - 1))} style={formStyles.stepBtn} activeOpacity={0.7}>
                  <Text style={formStyles.stepBtnText}>-1</Text>
                </TouchableOpacity>
                <Text style={formStyles.stepValue}>{dueDay}</Text>
                <TouchableOpacity onPress={() => setDueDay((v) => Math.min(28, v + 1))} style={formStyles.stepBtn} activeOpacity={0.7}>
                  <Text style={formStyles.stepBtnText}>+1</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={formStyles.actions}>
            {initial && (
              <TouchableOpacity onPress={handleDelete} style={formStyles.deleteBtn} activeOpacity={0.7}>
                <Text style={formStyles.deleteText}>DELETE</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={formStyles.cancelBtn} activeOpacity={0.7}>
              <Text style={formStyles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={[formStyles.saveBtn, !isValid && { opacity: 0.4 }]} activeOpacity={0.7} disabled={!isValid}>
              <Text style={formStyles.saveText}>{initial ? 'SAVE' : 'SET'}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
        </GlassSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const formStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.overlay },
  sheet: { maxHeight: '85%' },
  sheetContent: { padding: SPACING.xl, gap: SPACING.md },
  handle: { width: 36, height: 3, borderRadius: 2, backgroundColor: COLORS.borderBright, alignSelf: 'center', marginBottom: SPACING.xs },
  title: { fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1 },
  field: { gap: SPACING.xs },
  fieldLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5 },
  fieldHint: { fontSize: 9, color: COLORS.textMuted, lineHeight: 13, marginTop: -2 },
  input: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2,
    fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.body ?? undefined,
    backgroundColor: COLORS.surface,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm,
    paddingHorizontal: SPACING.xs, paddingVertical: SPACING.xs,
  },
  stepBtn: { borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.xs, paddingHorizontal: SPACING.sm, paddingVertical: 6 },
  stepBtnText: { fontSize: FONT_SIZE.xxs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, fontWeight: '700' },
  stepValue: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  deleteBtn: { borderWidth: 1, borderColor: COLORS.red, borderRadius: RADII.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: FONT_SIZE.sm, color: COLORS.red, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  cancelText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  saveBtn: { flex: 1, backgroundColor: COLORS.white, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  saveText: { fontSize: FONT_SIZE.sm, color: COLORS.textInverse, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
});
