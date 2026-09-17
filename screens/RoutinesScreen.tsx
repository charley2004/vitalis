import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Switch,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle } from 'react-native-svg';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../theme';
import { BoltIcon, FlameIcon } from '../components/icons';
import { GlassSheet } from '../components/GlassSheet';
import { fmtTime, fmtDuration } from '../services/calendar';
import {
  KEYS, getTodayKey, formatDateKey,
  RoutineDefinition, getRoutineConfig, saveRoutineConfig, setRoutineHit, setRoutineSkipped, getRoutineCompletionTimes,
  getRoutineTimeOverrides, effectivePreferredTime,
} from '../services/storage';
import { syncReminders } from '../services/reminders';

type HitState = 'hit' | 'miss' | 'pending' | 'skipped';
type TimeSlot = 'MORNING' | 'NOON' | 'NIGHT';

interface Routine extends RoutineDefinition {
  state: HitState;
  streak: number;
  /** Real clock time this was actually checked off today, if done */
  completedAt?: string;
}

const SLOT_CONFIG: Record<TimeSlot, { label: string; range: string; startHour: number }> = {
  MORNING: { label: 'MORNING', range: '05:00 — 11:00', startHour: 5 },
  NOON:    { label: 'NOON',    range: '11:00 — 17:00', startHour: 11 },
  NIGHT:   { label: 'NIGHT',   range: '17:00 — 23:00', startHour: 17 },
};

const TIME_SLOTS: TimeSlot[] = ['MORNING', 'NOON', 'NIGHT'];
const STREAK_LOOKBACK_DAYS = 90;

// ─── Routine form modal ───────────────────────────────────────────────────────

interface RoutineFormModalProps {
  visible: boolean;
  initial: RoutineDefinition | null;
  onClose: () => void;
  onSave: (def: RoutineDefinition) => void;
}

const DEFAULT_PREFERRED_TIME: Record<TimeSlot, number> = {
  MORNING: 7 * 60, NOON: 13 * 60, NIGHT: 20 * 60,
};

function RoutineFormModal({ visible, initial, onClose, onSave }: RoutineFormModalProps) {
  const [label,  setLabel]  = useState('');
  const [target, setTarget] = useState('');
  const [slot,   setSlot]   = useState<TimeSlot>('MORNING');
  const [preferredTime, setPreferredTime]   = useState(DEFAULT_PREFERRED_TIME.MORNING);
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [enabled, setEnabled] = useState(true);
  const [alarmEnabled, setAlarmEnabled] = useState(false);

  const handleOpen = useCallback(() => {
    if (initial) {
      setLabel(initial.label);
      setTarget(initial.target);
      setSlot(initial.slot);
      setPreferredTime(initial.preferredTime ?? DEFAULT_PREFERRED_TIME[initial.slot]);
      setDurationMinutes(initial.durationMinutes ?? 5);
      setEnabled(initial.enabled !== false);
      setAlarmEnabled(initial.alarmEnabled === true);
    } else {
      setLabel(''); setTarget(''); setSlot('MORNING');
      setPreferredTime(DEFAULT_PREFERRED_TIME.MORNING);
      setDurationMinutes(5);
      setEnabled(true);
      setAlarmEnabled(false);
    }
  }, [initial]);

  const handleSlotChange = useCallback((s: TimeSlot) => {
    setSlot(s);
    // Re-anchor the preferred time to the new slot's typical window
    setPreferredTime(DEFAULT_PREFERRED_TIME[s]);
  }, []);

  const handleSave = useCallback(() => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onSave({
      id: initial?.id ?? `r_${Date.now()}`,
      label: trimmed,
      emoji: initial?.emoji ?? 'bolt',
      slot,
      target: target.trim(),
      preferredTime,
      durationMinutes,
      enabled,
      alarmEnabled,
    });
    onClose();
  }, [label, target, slot, preferredTime, durationMinutes, enabled, alarmEnabled, initial, onSave, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={handleOpen}>
      <KeyboardAvoidingView style={formStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <GlassSheet style={formStyles.sheet}>
        <ScrollView
          contentContainerStyle={formStyles.sheetContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={formStyles.handle} />
          <Text style={formStyles.title}>{initial ? 'EDIT ROUTINE' : 'ADD ROUTINE'}</Text>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>NAME</Text>
            <TextInput
              style={formStyles.input}
              value={label}
              onChangeText={setLabel}
              placeholder="e.g. Cold Shower"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="words"
            />
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>TARGET</Text>
            <TextInput
              style={formStyles.input}
              value={target}
              onChangeText={setTarget}
              placeholder="e.g. 5 min, 500ml"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>TIME SLOT</Text>
            <View style={formStyles.slotRow}>
              {(TIME_SLOTS).map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => handleSlotChange(s)}
                  style={[formStyles.slotBtn, slot === s && formStyles.slotBtnActive]}
                  activeOpacity={0.7}
                >
                  <Text style={[formStyles.slotLabel, { color: slot === s ? COLORS.textPrimary : COLORS.textMuted }]}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>PREFERRED TIME</Text>
            <Text style={formStyles.fieldHint}>A hint for the AI scheduler — not a fixed appointment.</Text>
            <View style={formStyles.stepper}>
              <TouchableOpacity onPress={() => setPreferredTime((v) => Math.max(0, v - 60))} style={formStyles.stepBtn} activeOpacity={0.7}><Text style={formStyles.stepBtnText}>-1H</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setPreferredTime((v) => Math.max(0, v - 15))} style={formStyles.stepBtn} activeOpacity={0.7}><Text style={formStyles.stepBtnText}>-15</Text></TouchableOpacity>
              <Text style={formStyles.stepValue}>{fmtTime(preferredTime)}</Text>
              <TouchableOpacity onPress={() => setPreferredTime((v) => Math.min(23 * 60 + 45, v + 15))} style={formStyles.stepBtn} activeOpacity={0.7}><Text style={formStyles.stepBtnText}>+15</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setPreferredTime((v) => Math.min(23 * 60, v + 60))} style={formStyles.stepBtn} activeOpacity={0.7}><Text style={formStyles.stepBtnText}>+1H</Text></TouchableOpacity>
            </View>
          </View>

          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>ESTIMATED DURATION</Text>
            <View style={formStyles.stepper}>
              <TouchableOpacity onPress={() => setDurationMinutes((v) => Math.max(5, v - 5))} style={formStyles.stepBtn} activeOpacity={0.7}><Text style={formStyles.stepBtnText}>-5</Text></TouchableOpacity>
              <Text style={formStyles.stepValue}>{durationMinutes} MIN</Text>
              <TouchableOpacity onPress={() => setDurationMinutes((v) => Math.min(180, v + 5))} style={formStyles.stepBtn} activeOpacity={0.7}><Text style={formStyles.stepBtnText}>+5</Text></TouchableOpacity>
            </View>
          </View>

          <View style={[formStyles.field, formStyles.enabledRow]}>
            <View>
              <Text style={formStyles.fieldLabel}>ENABLED</Text>
              <Text style={formStyles.fieldHint}>Off habits are hidden from today's checklist and the AI agenda.</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ false: COLORS.borderNeon, true: COLORS.textPrimary }}
              thumbColor={COLORS.textInverse}
              ios_backgroundColor={COLORS.borderNeon}
            />
          </View>

          <View style={[formStyles.field, formStyles.enabledRow]}>
            <View style={{ flex: 1 }}>
              <Text style={formStyles.fieldLabel}>WAKE-UP ALARM</Text>
              <Text style={formStyles.fieldHint}>
                Rings loud at {fmtTime(preferredTime)} until you dismiss it — dismissing marks this routine done at that exact time. For things you need to actually be interrupted for, not just nudged.
              </Text>
            </View>
            <Switch
              value={alarmEnabled}
              onValueChange={setAlarmEnabled}
              trackColor={{ false: COLORS.borderNeon, true: COLORS.amber }}
              thumbColor={COLORS.textInverse}
              ios_backgroundColor={COLORS.borderNeon}
            />
          </View>

          <View style={formStyles.actions}>
            <TouchableOpacity onPress={onClose} style={formStyles.cancelBtn} activeOpacity={0.7}>
              <Text style={formStyles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={[formStyles.saveBtn, !label.trim() && { opacity: 0.4 }]} activeOpacity={0.7} disabled={!label.trim()}>
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
  sheetContent: {
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  handle: { width: 36, height: 3, borderRadius: 2, backgroundColor: COLORS.borderBright, alignSelf: 'center', marginBottom: SPACING.xs },
  title: { fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 2 },
  field: { gap: SPACING.xs },
  fieldLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.borderNeon,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
    fontSize: FONT_SIZE.base,
    color: COLORS.textPrimary,
    fontFamily: FONTS.body ?? undefined,
    backgroundColor: COLORS.surface,
  },
  slotRow: { flexDirection: 'row', gap: SPACING.xs },
  slotBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.borderNeon,
    borderRadius: RADII.sm,
    paddingVertical: SPACING.xs,
    alignItems: 'center',
  },
  slotBtnActive: { borderColor: COLORS.borderBright, backgroundColor: COLORS.surfaceElevated },
  slotLabel: { fontSize: FONT_SIZE.xxs, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  fieldHint: { fontSize: 9, color: COLORS.textMuted, lineHeight: 13, marginTop: -2 },
  stepper: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm,
    paddingHorizontal: SPACING.xs, paddingVertical: SPACING.xs,
  },
  stepBtn: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.xs,
    paddingHorizontal: SPACING.sm, paddingVertical: 6,
  },
  stepBtnText: { fontSize: FONT_SIZE.xxs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, fontWeight: '700' },
  stepValue: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  enabledRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  cancelText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  saveBtn: { flex: 1, backgroundColor: COLORS.white, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  saveText: { fontSize: FONT_SIZE.sm, color: COLORS.textInverse, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
});

// ─── Completion ring ──────────────────────────────────────────────────────────

function CompletionRing({ pct, size = 76 }: { pct: number; size?: number }) {
  const strokeWidth = 7;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
      <Circle
        cx={cx} cy={cy} r={radius} fill="none" stroke={COLORS.textPrimary} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct / 100)}
        strokeLinecap="round" transform={`rotate(-90, ${cx}, ${cy})`}
      />
    </Svg>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function RoutineRow({ routine, isFirst, isLast, onToggle, onLongPress, onReorder, onToggleEnabled }: {
  routine: Routine;
  isFirst: boolean;
  isLast: boolean;
  onToggle: (id: string, hit: boolean) => void;
  onLongPress: (routine: Routine) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
}) {
  const done = routine.state === 'hit';
  const skipped = routine.state === 'skipped';
  const enabled = routine.enabled !== false;
  const scheduledSubtitle = [
    routine.preferredTime !== undefined ? fmtTime(routine.preferredTime) : null,
    routine.durationMinutes ? `${routine.durationMinutes} MIN` : null,
    routine.target || null,
  ].filter(Boolean).join(' · ');

  // Once done, show when it actually happened rather than when it was
  // scheduled — that's the whole point of recording a real completion time.
  const completedSubtitle = (() => {
    if (!done || !routine.completedAt) return null;
    const d = new Date(routine.completedAt);
    const mins = d.getHours() * 60 + d.getMinutes();
    const base = `Done ${fmtTime(mins)}`;
    if (routine.preferredTime === undefined) return base;
    const delta = mins - routine.preferredTime;
    if (delta > 15) return `${base} · ${fmtDuration(delta)} late`;
    if (delta < -15) return `${base} · ${fmtDuration(Math.abs(delta))} early`;
    return `${base} · on time`;
  })();

  const subtitle = skipped ? 'Skipped today' : (completedSubtitle ?? scheduledSubtitle);

  return (
    <View style={[rowStyles.row, !enabled && { opacity: 0.45 }]}>
      <View style={rowStyles.reorderCol}>
        <TouchableOpacity
          onPress={() => onReorder(routine.id, -1)}
          disabled={isFirst}
          hitSlop={6}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Move ${routine.label} up`}
        >
          <Text style={[rowStyles.reorderArrow, isFirst && { opacity: 0.25 }]}>▲</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onReorder(routine.id, 1)}
          disabled={isLast}
          hitSlop={6}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Move ${routine.label} down`}
        >
          <Text style={[rowStyles.reorderArrow, isLast && { opacity: 0.25 }]}>▼</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={() => enabled && onToggle(routine.id, !done)}
        onLongPress={() => onLongPress(routine)}
        delayLongPress={500}
        activeOpacity={0.7}
        style={rowStyles.rowMain}
        disabled={!enabled}
        accessibilityRole="checkbox"
        accessibilityLabel={routine.label}
        accessibilityState={{ checked: done, disabled: !enabled }}
      >
        <View style={[rowStyles.checkbox, done && rowStyles.checkboxOn, skipped && rowStyles.checkboxSkipped]}>
          {done && <Text style={rowStyles.checkmark}>✓</Text>}
          {skipped && <Text style={rowStyles.skipMark}>–</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[rowStyles.label, (done || skipped) && rowStyles.labelDone]}>{routine.label}</Text>
          {subtitle ? <Text style={rowStyles.target}>{subtitle}</Text> : null}
        </View>
        {routine.streak > 0 && (
          <View style={rowStyles.streakPill}>
            <FlameIcon size={11} color={COLORS.textSecondary} />
            <Text style={rowStyles.streakText}>{routine.streak}D</Text>
          </View>
        )}
      </TouchableOpacity>
      <Switch
        value={enabled}
        onValueChange={(v) => onToggleEnabled(routine.id, v)}
        trackColor={{ false: COLORS.borderNeon, true: COLORS.textPrimary }}
        thumbColor={COLORS.textInverse}
        ios_backgroundColor={COLORS.borderNeon}
        style={rowStyles.enableSwitch}
      />
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.md, padding: SPACING.sm + 2, marginBottom: SPACING.xs,
  },
  reorderCol: { alignItems: 'center', gap: 2, width: 14 },
  reorderArrow: { fontSize: 9, color: COLORS.textMuted },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  checkbox: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 1,
    borderColor: COLORS.borderNeon, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkboxOn: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  checkboxSkipped: { backgroundColor: 'transparent', borderColor: COLORS.textMuted, borderStyle: 'dashed' },
  checkmark: { fontSize: 12, color: COLORS.textInverse, fontWeight: '700' },
  skipMark: { fontSize: 14, color: COLORS.textMuted, fontWeight: '700', lineHeight: 14 },
  label: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.bodyMedium ?? undefined },
  labelDone: { color: COLORS.textMuted, textDecorationLine: 'line-through' },
  target: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5, marginTop: 2 },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3, backgroundColor: COLORS.surfaceElevated,
  },
  streakText: { fontSize: 9, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, fontWeight: '700' },
  enableSwitch: { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] },
});

// ─── Slot header ──────────────────────────────────────────────────────────────

function SlotHeader({ slot, count, hit, upcoming }: { slot: TimeSlot; count: number; hit: number; upcoming: boolean }) {
  const cfg = SLOT_CONFIG[slot];
  const pct = count > 0 ? (hit / count) * 100 : 0;
  return (
    <View style={sectionStyles.container}>
      <View style={sectionStyles.topRow}>
        <Text style={[sectionStyles.label, upcoming && { color: COLORS.textMuted }]}>{cfg.label}</Text>
        <Text style={sectionStyles.range}>{cfg.range}</Text>
      </View>
      <View style={sectionStyles.track}>
        <View style={[sectionStyles.fill, { width: `${pct}%` as any, backgroundColor: upcoming ? COLORS.borderBright : COLORS.textPrimary }]} />
      </View>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: { paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  topRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: SPACING.xs },
  label: {
    fontSize: FONT_SIZE.md, color: COLORS.textPrimary,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1,
  },
  range: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5 },
  track: { height: 2, backgroundColor: COLORS.borderDim, borderRadius: RADII.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: RADII.full },
});

// ─── RoutinesScreen ───────────────────────────────────────────────────────────

const QUALITY_LABEL = (pct: number): string =>
  pct >= 90 ? 'Elite Consistency' :
  pct >= 70 ? 'Strong Momentum' :
  pct >= 40 ? 'Building Habits' : 'Getting Started';

export function RoutinesScreen() {
  const navigation = useNavigation();
  const dateKey = getTodayKey();

  const [routines, setRoutines]         = useState<Routine[]>([]);
  const [globalStreak, setGlobalStreak] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDef, setEditingDef]     = useState<RoutineDefinition | null>(null);

  const loadRoutines = useCallback(async (active: { value: boolean }) => {
    try {
      const [config, streakRaw, completionTimes, overrides] = await Promise.all([
        getRoutineConfig(),
        AsyncStorage.getItem(KEYS.streak),
        getRoutineCompletionTimes(dateKey),
        getRoutineTimeOverrides(dateKey),
      ]);

      // Fetch the last N days of routine state in one batch, then derive
      // per-routine streaks and today's state entirely in-memory.
      const dayKeys = Array.from({ length: STREAK_LOOKBACK_DAYS }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i);
        return formatDateKey(d);
      });
      const pairs = await AsyncStorage.multiGet(dayKeys.map((k) => KEYS.routines(k)));
      const dayStates: Record<string, HitState>[] = pairs.map(([, v]) => {
        try { return v ? JSON.parse(v) : {}; } catch { return {}; }
      });

      if (!active.value) return;

      const todayStates = dayStates[0] ?? {};
      const enriched = config.map((def) => {
        const state = todayStates[def.id] ?? 'pending';
        let streak = 0;
        let i = state === 'hit' ? 0 : 1; // if not hit today, streak counts from yesterday
        for (; i < dayStates.length; i++) {
          const dayState = dayStates[i][def.id];
          if (dayState === 'hit') streak++;
          else if (dayState === 'skipped') continue; // excused day — doesn't break the chain, doesn't extend it either
          else break;
        }
        return {
          ...def,
          preferredTime: effectivePreferredTime(def, overrides),
          state, streak,
          completedAt: state === 'hit' ? completionTimes[def.id] : undefined,
        };
      });

      setRoutines(enriched);
      setGlobalStreak(streakRaw ? parseInt(streakRaw, 10) : 0);
    } catch (_) {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      const active = { value: true };
      loadRoutines(active);
      return () => { active.value = false; };
    }, [loadRoutines])
  );

  // React Navigation's "focus" only fires on an actual tab/screen change —
  // resuming the app from background while Routines was already the visible
  // tab (e.g. reopened via a "Mark Done" notification tap) never fires it,
  // so a write that happened while backgrounded (setRoutineHit from
  // App.tsx's handleMarkDoneAction) was silently invisible until the user
  // navigated away and back, or re-tapped the checkbox themselves. AppState
  // catches that case directly.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const active = { value: true };
        loadRoutines(active);
      }
    });
    return () => sub.remove();
  }, [loadRoutines]);

  const handleToggle = useCallback(
    async (id: string, hit: boolean) => {
      const next: HitState = hit ? 'hit' : 'pending';
      setRoutines((prev) => prev.map((r) => (r.id === id ? { ...r, state: next } : r)));
      if (hit) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      try {
        await setRoutineHit(dateKey, id, hit);
      } catch (_) {}
      // Re-derive streak/state locally rather than trusting the optimistic update
      const active = { value: true };
      loadRoutines(active);
    },
    [dateKey, loadRoutines]
  );

  const handleLongPress = useCallback((routine: Routine) => {
    const def = routine;
    const isSkipped = routine.state === 'skipped';
    Alert.alert(def.label, 'What would you like to do?', [
      { text: 'Edit', onPress: () => { setEditingDef(def); setModalVisible(true); } },
      {
        text: isSkipped ? 'Un-skip' : 'Skip Today',
        onPress: async () => {
          try {
            await setRoutineSkipped(dateKey, def.id, !isSkipped);
          } catch (_) {}
          const active = { value: true };
          await loadRoutines(active);
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const config = await getRoutineConfig();
            const updated = config.filter((r) => r.id !== def.id);
            await saveRoutineConfig(updated);
            const statesRaw = await AsyncStorage.getItem(KEYS.routines(dateKey));
            if (statesRaw) {
              const states = JSON.parse(statesRaw);
              delete states[def.id];
              await AsyncStorage.setItem(KEYS.routines(dateKey), JSON.stringify(states));
            }
            await syncReminders();
            const active = { value: true };
            await loadRoutines(active);
          } catch (_) {}
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [dateKey, loadRoutines]);

  const handleAdd = useCallback(() => {
    setEditingDef(null);
    setModalVisible(true);
  }, []);

  const handleSaveRoutine = useCallback(async (def: RoutineDefinition) => {
    try {
      const config = await getRoutineConfig();
      const exists = config.find((r) => r.id === def.id);
      const updated = exists
        ? config.map((r) => (r.id === def.id ? def : r))
        : [...config, def];
      await saveRoutineConfig(updated);
      await syncReminders();
      const active = { value: true };
      await loadRoutines(active);
    } catch (_) {}
  }, [loadRoutines]);

  const handleReorder = useCallback(async (id: string, direction: -1 | 1) => {
    const config = await getRoutineConfig();
    const routine = config.find((r) => r.id === id);
    if (!routine) return;

    // Reorder within the same slot group only, splicing the new order back
    // into the same absolute positions so other slots are untouched.
    const positions = config.map((r, i) => (r.slot === routine.slot ? i : -1)).filter((i) => i >= 0);
    const slotIds = positions.map((i) => config[i].id);
    const idx = slotIds.indexOf(id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= slotIds.length) return;
    [slotIds[idx], slotIds[swapIdx]] = [slotIds[swapIdx], slotIds[idx]];

    const newConfig = [...config];
    positions.forEach((pos, i) => {
      newConfig[pos] = config.find((r) => r.id === slotIds[i])!;
    });
    await saveRoutineConfig(newConfig);
    const active = { value: true };
    await loadRoutines(active);
  }, [loadRoutines]);

  const handleToggleEnabled = useCallback(async (id: string, enabled: boolean) => {
    const config = await getRoutineConfig();
    const updated = config.map((r) => (r.id === id ? { ...r, enabled } : r));
    await saveRoutineConfig(updated);
    await syncReminders();
    const active = { value: true };
    await loadRoutines(active);
  }, [loadRoutines]);

  const enabledRoutines = routines.filter((r) => r.enabled !== false);
  const totalHit = enabledRoutines.filter((r) => r.state === 'hit').length;
  const totalSkipped = enabledRoutines.filter((r) => r.state === 'skipped').length;
  const totalCount = enabledRoutines.length - totalSkipped;
  const completionPct = totalCount > 0 ? Math.round((totalHit / totalCount) * 100) : 0;

  const currentHour = new Date().getHours();

  // Which slot currently has the strongest completion rate (for the insight card)
  // — skipped routines are excluded from both the hit count and the slot's
  // total, the same way they're kept out of the daily score.
  const bestSlot = TIME_SLOTS
    .map((slot) => {
      const slotRoutines = enabledRoutines.filter((r) => r.slot === slot && r.state !== 'skipped');
      const hit = slotRoutines.filter((r) => r.state === 'hit').length;
      return { slot, pct: slotRoutines.length > 0 ? (hit / slotRoutines.length) * 100 : 0, count: slotRoutines.length };
    })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.pct - a.pct)[0];

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <BoltIcon size={20} color={COLORS.textPrimary} />
          <TouchableOpacity onPress={() => navigation.navigate('Settings' as never)} activeOpacity={0.7} hitSlop={10}>
            <Text style={s.menuDots}>⋮</Text>
          </TouchableOpacity>
        </View>

        {/* Completion summary */}
        <View style={s.summaryCard}>
          <CompletionRing pct={completionPct} />
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text style={s.summaryLabel}>TOTAL COMPLETION</Text>
            <Text style={s.summaryHeadline}>{QUALITY_LABEL(completionPct)}</Text>
            <Text style={s.summarySub}>{totalHit} of {totalCount} habits secured today</Text>
          </View>
        </View>

        {routines.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyText}>No routines yet.</Text>
            <Text style={s.emptySub}>Tap the button below to add your first routine.</Text>
          </View>
        ) : (
          TIME_SLOTS.map((slot) => {
            const slotRoutines = routines.filter((r) => r.slot === slot);
            if (slotRoutines.length === 0) return null;
            const enabledSlotRoutines = slotRoutines.filter((r) => r.enabled !== false);
            const skippedSlotCount = enabledSlotRoutines.filter((r) => r.state === 'skipped').length;
            const hitCount = enabledSlotRoutines.filter((r) => r.state === 'hit').length;
            const upcoming = currentHour < SLOT_CONFIG[slot].startHour;
            return (
              <View key={slot}>
                <SlotHeader slot={slot} count={enabledSlotRoutines.length - skippedSlotCount} hit={hitCount} upcoming={upcoming} />
                {slotRoutines.map((r, i) => (
                  <RoutineRow
                    key={r.id}
                    routine={r}
                    isFirst={i === 0}
                    isLast={i === slotRoutines.length - 1}
                    onToggle={handleToggle}
                    onLongPress={handleLongPress}
                    onReorder={handleReorder}
                    onToggleEnabled={handleToggleEnabled}
                  />
                ))}
              </View>
            );
          })
        )}

        {/* Daily momentum insight */}
        {totalCount > 0 && (
          <View style={s.momentumCard}>
            <View style={s.momentumIcon}><BoltIcon size={16} color={COLORS.textSecondary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.momentumLabel}>DAILY MOMENTUM</Text>
              <Text style={s.momentumText}>
                {globalStreak > 0
                  ? `You've maintained your streak for ${globalStreak} consecutive day${globalStreak !== 1 ? 's' : ''}. `
                  : 'Complete a habit today to start a new streak. '}
                {bestSlot
                  ? `${bestSlot.slot === 'NOON' ? 'Midday' : bestSlot.slot.charAt(0) + bestSlot.slot.slice(1).toLowerCase()} completion is strongest today at ${Math.round(bestSlot.pct)}%.`
                  : ''}
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 96 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity onPress={handleAdd} style={s.fab} activeOpacity={0.85}>
        <Text style={s.fabText}>✓</Text>
      </TouchableOpacity>

      <RoutineFormModal
        visible={modalVisible}
        initial={editingDef}
        onClose={() => setModalVisible(false)}
        onSave={handleSaveRoutine}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.sm },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  menuDots: { fontSize: FONT_SIZE.xl, color: COLORS.textMuted },

  summaryCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.lg, padding: SPACING.md, marginBottom: SPACING.md,
  },
  summaryLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },
  summaryHeadline: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', marginTop: 2 },
  summarySub: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, marginTop: 3, fontStyle: 'italic' },

  emptyState: { alignItems: 'center', paddingTop: SPACING.xl, gap: SPACING.sm },
  emptyText: { fontSize: FONT_SIZE.base, color: COLORS.textSecondary, fontFamily: FONTS.bodyMedium ?? undefined },
  emptySub: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, textAlign: 'center' },

  momentumCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.borderBright,
    borderRadius: RADII.lg, padding: SPACING.md, marginTop: SPACING.lg,
  },
  momentumIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.surfaceSolid, borderWidth: 1, borderColor: COLORS.borderDim,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  momentumLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700', marginBottom: 4 },
  momentumText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, lineHeight: 18 },

  fab: {
    position: 'absolute', bottom: SPACING.md, right: SPACING.screenPad,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: COLORS.textPrimary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 6,
  },
  fabText: { fontSize: 22, color: COLORS.textInverse, fontWeight: '700' },
});
