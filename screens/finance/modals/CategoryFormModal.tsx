import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../../theme';
import { AppIcon } from '../../../components/icons';
import { GlassSheet } from '../../../components/GlassSheet';
import { newFinanceId, CATEGORY_COLOR_SWATCHES, type FinanceCategory } from '../../../services/finance';

const ICON_CHOICES = [
  'tag', 'bowl', 'runner', 'piggy-bank', 'receipt', 'signal', 'pen', 'shield',
  'bolt', 'trending-up', 'wallet', 'cash', 'target', 'bell', 'droplet', 'moon',
  'dumbbell', 'coffee',
];

interface CategoryFormModalProps {
  visible: boolean;
  initial: FinanceCategory | null;
  existingCount: number;
  onClose: () => void;
  onSave: (category: FinanceCategory) => void;
  onDelete?: () => void;
}

export function CategoryFormModal({ visible, initial, existingCount, onClose, onSave, onDelete }: CategoryFormModalProps) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('tag');
  const [color, setColor] = useState(CATEGORY_COLOR_SWATCHES[0]);
  const [percentage, setPercentage] = useState(10);

  const handleOpen = useCallback(() => {
    if (initial) {
      setName(initial.name);
      setEmoji(initial.emoji);
      setColor(initial.color);
      setPercentage(initial.percentage);
    } else {
      setName('');
      setEmoji('tag');
      setColor(CATEGORY_COLOR_SWATCHES[existingCount % CATEGORY_COLOR_SWATCHES.length]);
      setPercentage(10);
    }
  }, [initial, existingCount]);

  const handleSave = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      id: initial?.id ?? newFinanceId('cat'),
      name: trimmed,
      emoji,
      color,
      percentage,
      order: initial?.order ?? existingCount,
    });
    onClose();
  }, [name, emoji, color, percentage, initial, existingCount, onSave, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={handleOpen}>
      <KeyboardAvoidingView style={formStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <GlassSheet style={formStyles.sheet}>
        <ScrollView contentContainerStyle={formStyles.sheetContent} keyboardShouldPersistTaps="handled">
          <View style={formStyles.handle} />
          <Text style={formStyles.title}>{initial ? 'EDIT CATEGORY' : 'ADD CATEGORY'}</Text>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>NAME</Text>
            <TextInput
              style={formStyles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Groceries"
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
            <Text style={formStyles.fieldLabel}>COLOR</Text>
            <View style={formStyles.colorRow}>
              {CATEGORY_COLOR_SWATCHES.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setColor(c)}
                  activeOpacity={0.7}
                  style={[formStyles.swatch, { backgroundColor: c }, color === c && formStyles.swatchActive]}
                />
              ))}
            </View>
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>PERCENTAGE OF INCOME</Text>
            <View style={formStyles.stepper}>
              <TouchableOpacity onPress={() => setPercentage((v) => Math.max(0, v - 5))} style={formStyles.stepBtn} activeOpacity={0.7}>
                <Text style={formStyles.stepBtnText}>-5</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPercentage((v) => Math.max(0, v - 1))} style={formStyles.stepBtn} activeOpacity={0.7}>
                <Text style={formStyles.stepBtnText}>-1</Text>
              </TouchableOpacity>
              <Text style={formStyles.stepValue}>{percentage}%</Text>
              <TouchableOpacity onPress={() => setPercentage((v) => Math.min(100, v + 1))} style={formStyles.stepBtn} activeOpacity={0.7}>
                <Text style={formStyles.stepBtnText}>+1</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPercentage((v) => Math.min(100, v + 5))} style={formStyles.stepBtn} activeOpacity={0.7}>
                <Text style={formStyles.stepBtnText}>+5</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={formStyles.actions}>
            {onDelete && (
              <TouchableOpacity onPress={onDelete} style={formStyles.deleteBtn} activeOpacity={0.7}>
                <Text style={formStyles.deleteText}>DELETE</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={formStyles.cancelBtn} activeOpacity={0.7}>
              <Text style={formStyles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={[formStyles.saveBtn, !name.trim() && { opacity: 0.4 }]} activeOpacity={0.7} disabled={!name.trim()}>
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
  sheet: { maxHeight: '85%' },
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
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  swatch: { width: 30, height: 30, borderRadius: RADII.full, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: COLORS.textPrimary },
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
