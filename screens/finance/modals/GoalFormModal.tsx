import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../../theme';
import { AppIcon } from '../../../components/icons';
import { DateField } from '../../../components/finance/DateField';
import { GlassSheet } from '../../../components/GlassSheet';
import { getTodayKey } from '../../../services/storage';
import { upsertFinanceGoal, newFinanceId, type FinanceGoal } from '../../../services/finance';

interface GoalFormModalProps {
  visible: boolean;
  initial: FinanceGoal | null;
  onClose: () => void;
  onSaved: () => void;
}

const ICON_CHOICES = ['target', 'piggy-bank', 'wallet', 'shield', 'runner', 'bolt', 'cash', 'tag'];

export function GoalFormModal({ visible, initial, onClose, onSaved }: GoalFormModalProps) {
  const [label, setLabel] = useState('');
  const [emoji, setEmoji] = useState('target');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState(getTodayKey());
  const [startingAmount, setStartingAmount] = useState('');

  const handleOpen = useCallback(() => {
    if (initial) {
      setLabel(initial.label);
      setEmoji(initial.emoji);
      setTargetAmount(String(initial.targetAmount));
      setTargetDate(initial.targetDate);
      setStartingAmount('');
    } else {
      setLabel('');
      setEmoji('target');
      setTargetAmount('');
      setTargetDate(getTodayKey());
      setStartingAmount('');
    }
  }, [initial]);

  const targetNum = parseFloat(targetAmount);
  const isValid = label.trim().length > 0 && !isNaN(targetNum) && targetNum > 0;

  const handleSave = useCallback(async () => {
    if (!isValid) return;
    const startNum = parseFloat(startingAmount);
    const contributions = initial
      ? initial.contributions
      : (!isNaN(startNum) && startNum > 0 ? [{ amount: startNum, date: getTodayKey() }] : []);
    await upsertFinanceGoal({
      id: initial?.id ?? newFinanceId('goal'),
      label: label.trim(),
      emoji,
      targetAmount: targetNum,
      targetDate,
      contributions,
      createdAt: initial?.createdAt ?? Date.now(),
    });
    onSaved();
    onClose();
  }, [isValid, initial, label, emoji, targetNum, targetDate, startingAmount, onSaved, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={handleOpen}>
      <KeyboardAvoidingView style={formStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <GlassSheet style={formStyles.sheet}>
        <ScrollView contentContainerStyle={formStyles.sheetContent} keyboardShouldPersistTaps="handled">
          <View style={formStyles.handle} />
          <Text style={formStyles.title}>{initial ? 'EDIT GOAL' : 'NEW GOAL'}</Text>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>NAME</Text>
            <TextInput
              style={formStyles.input}
              value={label}
              onChangeText={setLabel}
              placeholder="e.g. Emergency Fund"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="words"
            />
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>ICON</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={formStyles.iconRow}>
              {ICON_CHOICES.map((id) => (
                <TouchableOpacity
                  key={id}
                  onPress={() => setEmoji(id)}
                  activeOpacity={0.7}
                  style={[formStyles.iconChip, emoji === id && formStyles.iconChipActive]}
                >
                  <AppIcon id={id} size={18} color={emoji === id ? COLORS.textPrimary : COLORS.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>TARGET AMOUNT</Text>
            <TextInput
              style={formStyles.input}
              value={targetAmount}
              onChangeText={setTargetAmount}
              placeholder="0.00"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>TARGET DATE</Text>
            <DateField value={targetDate} onChange={setTargetDate} />
          </View>

          {!initial && (
            <View style={formStyles.field}>
              <Text style={formStyles.fieldLabel}>STARTING AMOUNT (OPTIONAL)</Text>
              <TextInput
                style={formStyles.input}
                value={startingAmount}
                onChangeText={setStartingAmount}
                placeholder="0.00"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="decimal-pad"
              />
            </View>
          )}

          <View style={formStyles.actions}>
            <TouchableOpacity onPress={onClose} style={formStyles.cancelBtn} activeOpacity={0.7}>
              <Text style={formStyles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={[formStyles.saveBtn, !isValid && { opacity: 0.4 }]} activeOpacity={0.7} disabled={!isValid}>
              <Text style={formStyles.saveText}>{initial ? 'SAVE' : 'ADD'}</Text>
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
  sheet: { maxHeight: '88%' },
  sheetContent: { padding: SPACING.xl, gap: SPACING.md },
  handle: { width: 36, height: 3, borderRadius: 2, backgroundColor: COLORS.borderBright, alignSelf: 'center', marginBottom: SPACING.xs },
  title: { fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 2 },
  field: { gap: SPACING.xs },
  fieldLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5 },
  input: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2,
    fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.body ?? undefined,
    backgroundColor: COLORS.surface,
  },
  iconRow: { flexDirection: 'row', gap: SPACING.xs },
  iconChip: {
    width: 38, height: 38, borderRadius: RADII.sm, borderWidth: 1, borderColor: COLORS.borderNeon,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface,
  },
  iconChipActive: { borderColor: COLORS.borderBright, backgroundColor: COLORS.surfaceElevated },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  cancelText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  saveBtn: { flex: 1, backgroundColor: COLORS.white, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  saveText: { fontSize: FONT_SIZE.sm, color: COLORS.textInverse, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
});
