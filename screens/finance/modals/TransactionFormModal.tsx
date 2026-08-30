import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform, Image, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../../theme';
import { AppIcon, CameraIcon } from '../../../components/icons';
import { DateField } from '../../../components/finance/DateField';
import { GlassSheet } from '../../../components/GlassSheet';
import { getTodayKey } from '../../../services/storage';
import {
  getCategories, addTransaction, updateTransaction, deleteTransaction, newFinanceId,
  type FinanceCategory, type FinanceTransaction, type TransactionType,
} from '../../../services/finance';

interface TransactionFormModalProps {
  visible: boolean;
  initial: FinanceTransaction | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

const TYPES: TransactionType[] = ['expense', 'income', 'transfer'];

export function TransactionFormModal({ visible, initial, onClose, onSaved, onDeleted }: TransactionFormModalProps) {
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [transferToCategoryId, setTransferToCategoryId] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [date, setDate] = useState(getTodayKey());
  const [notes, setNotes] = useState('');
  const [receiptUri, setReceiptUri] = useState<string | undefined>(undefined);

  const handleOpen = useCallback(() => {
    getCategories().then(setCategories);
    if (initial) {
      setType(initial.type);
      setAmount(String(initial.amount));
      setCategoryId(initial.categoryId);
      setTransferToCategoryId(initial.transferToCategoryId ?? null);
      setSourceLabel(initial.sourceLabel ?? '');
      setDate(initial.date);
      setNotes(initial.notes ?? '');
      setReceiptUri(initial.receiptUri);
    } else {
      setType('expense');
      setAmount('');
      setCategoryId(null);
      setTransferToCategoryId(null);
      setSourceLabel('');
      setDate(getTodayKey());
      setNotes('');
      setReceiptUri(undefined);
    }
  }, [initial]);

  const handlePickReceipt = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to attach a receipt.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsEditing: true });
    if (!result.canceled && result.assets?.[0]?.uri) setReceiptUri(result.assets[0].uri);
  }, []);

  const amountNum = parseFloat(amount);
  const isValid = !isNaN(amountNum) && amountNum > 0
    && (type === 'transfer' ? categoryId && transferToCategoryId && categoryId !== transferToCategoryId : !!categoryId);

  const handleSave = useCallback(async () => {
    if (!isValid) return;
    const transaction: FinanceTransaction = {
      id: initial?.id ?? newFinanceId('tx'),
      type,
      amount: amountNum,
      categoryId,
      transferToCategoryId: type === 'transfer' ? transferToCategoryId ?? undefined : undefined,
      sourceLabel: type === 'income' && sourceLabel.trim() ? sourceLabel.trim() : undefined,
      date,
      notes: notes.trim() || undefined,
      receiptUri,
      createdAt: initial?.createdAt ?? Date.now(),
    };
    if (initial) await updateTransaction(transaction);
    else await addTransaction(transaction);
    onSaved();
    onClose();
  }, [isValid, initial, type, amountNum, categoryId, transferToCategoryId, sourceLabel, date, notes, receiptUri, onSaved, onClose]);

  const handleDelete = useCallback(async () => {
    if (!initial) return;
    await deleteTransaction(initial.id);
    onDeleted?.();
    onClose();
  }, [initial, onDeleted, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={handleOpen}>
      <KeyboardAvoidingView style={formStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <GlassSheet style={formStyles.sheet}>
        <ScrollView contentContainerStyle={formStyles.sheetContent} keyboardShouldPersistTaps="handled">
          <View style={formStyles.handle} />
          <Text style={formStyles.title}>{initial ? 'EDIT TRANSACTION' : 'ADD TRANSACTION'}</Text>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>TYPE</Text>
            <View style={formStyles.slotRow}>
              {TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setType(t)}
                  style={[formStyles.slotBtn, type === t && formStyles.slotBtnActive]}
                  activeOpacity={0.7}
                >
                  <Text style={[formStyles.slotLabel, { color: type === t ? COLORS.textPrimary : COLORS.textMuted }]}>{t.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>AMOUNT</Text>
            <TextInput
              style={formStyles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>{type === 'transfer' ? 'FROM CATEGORY' : 'CATEGORY'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={formStyles.chipRow}>
              {categories.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setCategoryId(c.id)}
                  activeOpacity={0.7}
                  style={[formStyles.catChip, categoryId === c.id && { borderColor: c.color, backgroundColor: COLORS.surfaceElevated }]}
                >
                  <AppIcon id={c.emoji} size={14} color={categoryId === c.id ? c.color : COLORS.textMuted} />
                  <Text style={[formStyles.catChipText, categoryId === c.id && { color: COLORS.textPrimary }]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {type === 'transfer' && (
            <View style={formStyles.field}>
              <Text style={formStyles.fieldLabel}>TO CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={formStyles.chipRow}>
                {categories.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setTransferToCategoryId(c.id)}
                    activeOpacity={0.7}
                    style={[formStyles.catChip, transferToCategoryId === c.id && { borderColor: c.color, backgroundColor: COLORS.surfaceElevated }]}
                  >
                    <AppIcon id={c.emoji} size={14} color={transferToCategoryId === c.id ? c.color : COLORS.textMuted} />
                    <Text style={[formStyles.catChipText, transferToCategoryId === c.id && { color: COLORS.textPrimary }]}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={formStyles.fieldHint}>Transfers move money between envelopes — they don't change your total balance.</Text>
            </View>
          )}

          {type === 'income' && (
            <View style={formStyles.field}>
              <Text style={formStyles.fieldLabel}>SOURCE (OPTIONAL)</Text>
              <TextInput
                style={formStyles.input}
                value={sourceLabel}
                onChangeText={setSourceLabel}
                placeholder="e.g. Client, Employer"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
          )}

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>DATE</Text>
            <DateField value={date} onChange={setDate} />
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>NOTES</Text>
            <TextInput
              style={formStyles.input}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>RECEIPT</Text>
            {receiptUri ? (
              <View style={formStyles.receiptRow}>
                <Image source={{ uri: receiptUri }} style={formStyles.receiptThumb} />
                <TouchableOpacity onPress={() => setReceiptUri(undefined)} style={formStyles.receiptRemove} activeOpacity={0.7}>
                  <Text style={formStyles.receiptRemoveText}>REMOVE</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={handlePickReceipt} style={formStyles.receiptBtn} activeOpacity={0.7}>
                <CameraIcon size={16} color={COLORS.textSecondary} />
                <Text style={formStyles.receiptBtnText}>ADD PHOTO</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={formStyles.actions}>
            {initial && onDeleted && (
              <TouchableOpacity onPress={handleDelete} style={formStyles.deleteBtn} activeOpacity={0.7}>
                <Text style={formStyles.deleteText}>DELETE</Text>
              </TouchableOpacity>
            )}
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
  fieldHint: { fontSize: 9, color: COLORS.textMuted, lineHeight: 13, marginTop: -2 },
  input: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2,
    fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.body ?? undefined,
    backgroundColor: COLORS.surface,
  },
  slotRow: { flexDirection: 'row', gap: SPACING.xs },
  slotBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm, paddingVertical: SPACING.xs, alignItems: 'center' },
  slotBtnActive: { borderColor: COLORS.borderBright, backgroundColor: COLORS.surfaceElevated },
  slotLabel: { fontSize: FONT_SIZE.xxs, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  chipRow: { flexDirection: 'row', gap: SPACING.xs },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xxs,
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, backgroundColor: COLORS.surface,
  },
  catChipText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontFamily: FONTS.bodyMedium ?? undefined },
  receiptBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: COLORS.borderNeon, borderStyle: 'dashed', borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  receiptBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  receiptThumb: { width: 56, height: 56, borderRadius: RADII.sm },
  receiptRemove: { borderWidth: 1, borderColor: COLORS.red, borderRadius: RADII.sm, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  receiptRemoveText: { fontSize: FONT_SIZE.xxs, color: COLORS.red, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  deleteBtn: { borderWidth: 1, borderColor: COLORS.red, borderRadius: RADII.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: FONT_SIZE.sm, color: COLORS.red, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  cancelText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  saveBtn: { flex: 1, backgroundColor: COLORS.white, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  saveText: { fontSize: FONT_SIZE.sm, color: COLORS.textInverse, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
});
