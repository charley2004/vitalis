import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { GlassCard } from '../../../components/GlassCard';
import { GlassSheet } from '../../../components/GlassSheet';
import { AppIcon } from '../../../components/icons';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../../theme';
import {
  getCategories, saveCategories, validateAllocation, applyTemplate, saveFinanceSettings,
  resetFinanceData, CURRENCIES, FINANCE_TEMPLATES,
  type FinanceSettings, type FinanceCategory, type FinanceTemplateId, type LockMode,
} from '../../../services/finance';
import { hasPinSet, setPin, clearPin, isBiometricAvailable } from '../../../services/financeLock';
import { exportFinanceBackup, restoreFinanceBackup } from '../../../services/financeExport';
import { CategoryFormModal } from '../modals/CategoryFormModal';

interface SettingsSectionProps {
  settings: FinanceSettings;
  onChanged: () => void;
}

const LOCK_MODES: { id: LockMode; label: string }[] = [
  { id: 'none', label: 'NONE' },
  { id: 'pin', label: 'PIN' },
  { id: 'biometric', label: 'BIOMETRIC' },
  { id: 'both', label: 'BOTH' },
];

function SetPinModal({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: (pin: string) => void }) {
  const [pin, setPinValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleOpen = useCallback(() => { setPinValue(''); setConfirm(''); setError(null); }, []);

  const handleSave = useCallback(() => {
    if (pin.length < 4) { setError('PIN must be at least 4 digits'); return; }
    if (pin !== confirm) { setError("PINs don't match"); return; }
    onSaved(pin);
  }, [pin, confirm, onSaved]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={handleOpen}>
      <KeyboardAvoidingView style={pinStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <GlassSheet>
        <View style={pinStyles.sheet}>
          <View style={pinStyles.handle} />
          <Text style={pinStyles.title}>SET PIN</Text>
          <TextInput
            style={pinStyles.input}
            value={pin}
            onChangeText={(v) => { setPinValue(v); setError(null); }}
            placeholder="Enter PIN"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
          />
          <TextInput
            style={pinStyles.input}
            value={confirm}
            onChangeText={(v) => { setConfirm(v); setError(null); }}
            placeholder="Confirm PIN"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
          />
          {error && <Text style={pinStyles.error}>{error}</Text>}
          <View style={pinStyles.actions}>
            <TouchableOpacity onPress={onClose} style={pinStyles.cancelBtn} activeOpacity={0.7}>
              <Text style={pinStyles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={pinStyles.saveBtn} activeOpacity={0.7}>
              <Text style={pinStyles.saveText}>SAVE</Text>
            </TouchableOpacity>
          </View>
        </View>
        </GlassSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SettingsSection({ settings, onChanged }: SettingsSectionProps) {
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [editingCategory, setEditingCategory] = useState<FinanceCategory | 'new' | null>(null);
  const [pinIsSet, setPinIsSet] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [pendingLockMode, setPendingLockMode] = useState<LockMode | null>(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadCategories = useCallback(() => { getCategories().then(setCategories); }, []);
  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => {
    hasPinSet().then(setPinIsSet);
    isBiometricAvailable().then(setBiometricAvailable);
  }, []);

  const { valid, total } = validateAllocation(categories);

  const handleSaveCategory = useCallback(async (category: FinanceCategory) => {
    const idx = categories.findIndex((c) => c.id === category.id);
    const next = idx >= 0 ? categories.map((c) => (c.id === category.id ? category : c)) : [...categories, category];
    setCategories(next);
    await saveCategories(next);
    onChanged();
  }, [categories, onChanged]);

  const handleDeleteCategory = useCallback(async (id: string) => {
    const next = categories.filter((c) => c.id !== id);
    setCategories(next);
    await saveCategories(next);
    setEditingCategory(null);
    onChanged();
  }, [categories, onChanged]);

  const handleReorder = useCallback(async (id: string, direction: -1 | 1) => {
    const sorted = [...categories].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((c) => c.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx], b = sorted[swapIdx];
    const next = categories.map((c) => (c.id === a.id ? { ...c, order: b.order } : c.id === b.id ? { ...c, order: a.order } : c));
    setCategories(next);
    await saveCategories(next);
  }, [categories]);

  const handleResetToDefault = useCallback(() => {
    Alert.alert('Reset to Default', 'Replace your current categories with the template defaults?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset', style: 'destructive',
        onPress: async () => { const next = await applyTemplate(settings.templateId); setCategories(next); onChanged(); },
      },
    ]);
  }, [settings.templateId, onChanged]);

  const handleChangeTemplate = useCallback((templateId: FinanceTemplateId) => {
    Alert.alert('Change Template', `Replace your categories with the ${FINANCE_TEMPLATES[templateId].label} template? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Replace', style: 'destructive',
        onPress: async () => {
          const next = await applyTemplate(templateId);
          setCategories(next);
          await saveFinanceSettings({ ...settings, templateId });
          onChanged();
        },
      },
    ]);
  }, [settings, onChanged]);

  const handleCurrencyChange = useCallback(async (code: string) => {
    await saveFinanceSettings({ ...settings, currencyCode: code });
    onChanged();
  }, [settings, onChanged]);

  const handleLockModeChange = useCallback((mode: LockMode) => {
    if (mode === settings.lockMode) return;
    if ((mode === 'biometric') && !biometricAvailable) {
      Alert.alert('Biometrics unavailable', 'This device has no biometric authentication set up.');
      return;
    }
    if ((mode === 'pin' || mode === 'both') && !pinIsSet) {
      setPendingLockMode(mode);
      return;
    }
    saveFinanceSettings({ ...settings, lockMode: mode }).then(onChanged);
  }, [settings, biometricAvailable, pinIsSet, onChanged]);

  const handlePinSaved = useCallback(async (pin: string) => {
    await setPin(pin);
    setPinIsSet(true);
    if (pendingLockMode) {
      await saveFinanceSettings({ ...settings, lockMode: pendingLockMode });
      onChanged();
    }
    setPendingLockMode(null);
  }, [pendingLockMode, settings, onChanged]);

  const handleRemovePin = useCallback(() => {
    Alert.alert('Remove PIN', 'Finance will fall back to no lock (or biometric only).', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await clearPin();
          setPinIsSet(false);
          const fallback: LockMode = settings.lockMode === 'both' ? 'biometric' : 'none';
          await saveFinanceSettings({ ...settings, lockMode: fallback });
          onChanged();
        },
      },
    ]);
  }, [settings, onChanged]);

  const handleExportBackup = useCallback(async () => {
    setExporting(true);
    const ok = await exportFinanceBackup();
    setExporting(false);
    if (!ok) Alert.alert('Export failed', 'Could not export your backup.');
  }, []);

  const handleRestoreBackup = useCallback(() => {
    Alert.alert('Restore Backup', "This will overwrite your current Finance data with the backup file's contents.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore', style: 'destructive',
        onPress: async () => {
          setRestoring(true);
          const ok = await restoreFinanceBackup();
          setRestoring(false);
          if (ok) { loadCategories(); onChanged(); Alert.alert('Restored', 'Your backup has been restored.'); }
          else Alert.alert('Restore failed', 'Could not read that backup file.');
        },
      },
    ]);
  }, [loadCategories, onChanged]);

  const handleResetAll = useCallback(() => {
    Alert.alert('Reset Finance Data', 'This permanently deletes all transactions, budgets, goals, categories, and settings for Finance. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'RESET', style: 'destructive',
        onPress: async () => { await clearPin(); await resetFinanceData(); onChanged(); },
      },
    ]);
  }, [onChanged]);

  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionLabel}>CATEGORIES</Text>
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
          <TouchableOpacity style={styles.catBody} onPress={() => setEditingCategory(c)} activeOpacity={0.7}>
            <View style={[styles.catIconBox, { borderColor: c.color }]}><AppIcon id={c.emoji} size={16} color={c.color} /></View>
            <Text style={styles.catName} numberOfLines={1}>{c.name}</Text>
            <Text style={styles.catPct}>{c.percentage}%</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={styles.addCatBtn} onPress={() => setEditingCategory('new')} activeOpacity={0.7}>
        <Text style={styles.addCatText}>+ ADD CATEGORY</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.linkBtn} onPress={handleResetToDefault} activeOpacity={0.7}>
        <Text style={styles.linkText}>RESET TO DEFAULT</Text>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>CHANGE TEMPLATE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {(Object.keys(FINANCE_TEMPLATES) as FinanceTemplateId[]).map((id) => (
          <TouchableOpacity key={id} style={styles.templateChip} onPress={() => handleChangeTemplate(id)} activeOpacity={0.7}>
            <Text style={styles.templateChipText}>{FINANCE_TEMPLATES[id].label.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.sectionLabel}>CURRENCY</Text>
      <View style={styles.chipGrid}>
        {CURRENCIES.map((c) => (
          <TouchableOpacity
            key={c.code}
            style={[styles.currencyChip, settings.currencyCode === c.code && styles.currencyChipActive]}
            onPress={() => handleCurrencyChange(c.code)}
            activeOpacity={0.7}
          >
            <Text style={[styles.currencyChipText, settings.currencyCode === c.code && styles.currencyChipTextActive]}>{c.symbol} {c.code}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>APP LOCK</Text>
      <View style={styles.chipRow}>
        {LOCK_MODES.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.lockChip, settings.lockMode === m.id && styles.lockChipActive]}
            onPress={() => handleLockModeChange(m.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.lockChipText, settings.lockMode === m.id && styles.lockChipTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {(settings.lockMode === 'pin' || settings.lockMode === 'both') && pinIsSet && (
        <TouchableOpacity style={styles.linkBtn} onPress={handleRemovePin} activeOpacity={0.7}>
          <Text style={[styles.linkText, { color: COLORS.red }]}>REMOVE PIN</Text>
        </TouchableOpacity>
      )}
      {(settings.lockMode === 'pin' || settings.lockMode === 'both') && !pinIsSet && (
        <TouchableOpacity style={styles.linkBtn} onPress={() => setPendingLockMode(settings.lockMode)} activeOpacity={0.7}>
          <Text style={styles.linkText}>SET PIN</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionLabel}>BACKUP</Text>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleExportBackup} disabled={exporting} activeOpacity={0.7}>
          <Text style={styles.actionText}>{exporting ? '…' : 'EXPORT'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleRestoreBackup} disabled={restoring} activeOpacity={0.7}>
          <Text style={styles.actionText}>{restoring ? '…' : 'RESTORE'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>DANGER ZONE</Text>
      <TouchableOpacity style={styles.resetBtn} onPress={handleResetAll} activeOpacity={0.7}>
        <Text style={styles.resetBtnText}>RESET FINANCE DATA</Text>
      </TouchableOpacity>

      <View style={{ height: 100 }} />

      <CategoryFormModal
        visible={editingCategory !== null}
        initial={editingCategory === 'new' ? null : editingCategory}
        existingCount={categories.length}
        onClose={() => setEditingCategory(null)}
        onSave={handleSaveCategory}
        onDelete={editingCategory && editingCategory !== 'new' ? () => handleDeleteCategory(editingCategory.id) : undefined}
      />
      <SetPinModal
        visible={pendingLockMode !== null}
        onClose={() => setPendingLockMode(null)}
        onSaved={handlePinSaved}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.screenPad, gap: SPACING.sm },
  sectionLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700', marginTop: SPACING.md, marginBottom: SPACING.xs },

  totalBadge: { borderWidth: 1, borderRadius: RADII.sm, paddingVertical: SPACING.xs, alignItems: 'center', marginBottom: SPACING.xs },
  totalBadgeOk: { borderColor: COLORS.borderNeon, backgroundColor: COLORS.surface },
  totalBadgeBad: { borderColor: COLORS.red },
  totalBadgeText: { fontSize: FONT_SIZE.xs, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1.5 },

  catRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.xs },
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

  linkBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
  linkText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },

  chipRow: { flexDirection: 'row', gap: SPACING.xs },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  templateChip: { borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, backgroundColor: COLORS.surface },
  templateChipText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, fontWeight: '600' },

  currencyChip: { borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, backgroundColor: COLORS.surface },
  currencyChipActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  currencyChipText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, fontWeight: '600' },
  currencyChipTextActive: { color: COLORS.textInverse },

  lockChip: { flex: 1, borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center', backgroundColor: COLORS.surface },
  lockChipActive: { borderColor: COLORS.borderBright, backgroundColor: COLORS.surfaceElevated },
  lockChipText: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  lockChipTextActive: { color: COLORS.textPrimary },

  actionRow: { flexDirection: 'row', gap: SPACING.sm },
  actionBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  actionText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },

  resetBtn: { borderWidth: 1, borderColor: COLORS.red, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  resetBtnText: { fontSize: FONT_SIZE.sm, color: COLORS.red, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1.5 },
});

const pinStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.overlay },
  sheet: { padding: SPACING.xl, gap: SPACING.md },
  handle: { width: 36, height: 3, borderRadius: 2, backgroundColor: COLORS.borderBright, alignSelf: 'center', marginBottom: SPACING.xs },
  title: { fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1 },
  input: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2,
    fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.body ?? undefined,
    backgroundColor: COLORS.surface,
  },
  error: { fontSize: FONT_SIZE.xs, color: COLORS.red, fontFamily: FONTS.body ?? undefined },
  actions: { flexDirection: 'row', gap: SPACING.sm },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  cancelText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  saveBtn: { flex: 1, backgroundColor: COLORS.white, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  saveText: { fontSize: FONT_SIZE.sm, color: COLORS.textInverse, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
});
