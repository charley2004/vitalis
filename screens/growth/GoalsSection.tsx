import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../theme';
import { AppIcon, SunriseIcon, DumbbellIcon, DropletIcon, LotusIcon } from '../../components/icons';
import { GlassSheet } from '../../components/GlassSheet';

const ICON_CHOICES = [
  'scale', 'dumbbell', 'droplet', 'moon', 'lotus', 'bolt',
  'flame', 'runner', 'brain', 'pen', 'coffee', 'bowl', 'signal', 'wallet',
];
import {
  KEYS, formatDateKey, getSettings,
  GrowthGoal, getGrowthGoals, saveGrowthGoals, DEFAULT_GROWTH_GOALS,
  type WorkoutSession,
} from '../../services/storage';
import { getSavingsProgressPct } from '../../services/finance';

const BUILT_IN_IDS = new Set(['g1', 'g2', 'g3', 'g4', 'g5', 'g6']);

// ─── Date / quarter helpers ───────────────────────────────────────────────────

const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function getQuarterBounds(date: Date) {
  const q = Math.floor(date.getMonth() / 3);
  const start = new Date(date.getFullYear(), q * 3, 1);
  const end = new Date(date.getFullYear(), q * 3 + 3, 0);
  return { start, end, label: `Q${q + 1} ${date.getFullYear()}` };
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function fmtShortDate(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function mostRecentMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0); // normalize so week-boundary comparisons aren't skewed by the current time-of-day
  return d;
}

// ─── Goal edit modal ──────────────────────────────────────────────────────────

function GoalEditModal({ visible, goal, onClose, onSave }: {
  visible: boolean;
  goal: GrowthGoal | null;
  onClose: () => void;
  onSave: (updated: GrowthGoal) => void;
}) {
  const [label,    setLabel]    = useState('');
  const [icon,     setIcon]     = useState('bolt');
  const [target,   setTarget]   = useState('');
  const [unit,     setUnit]     = useState('');
  const [deadline, setDeadline] = useState('');
  const [current,  setCurrent]  = useState('');

  const isCustom = !goal || !BUILT_IN_IDS.has(goal.id);

  const handleShow = useCallback(() => {
    if (goal) {
      setLabel(goal.label);
      setIcon(ICON_CHOICES.includes(goal.emoji) ? goal.emoji : 'bolt');
      setTarget(String(goal.target));
      setUnit(goal.unit);
      setDeadline(goal.deadline);
      setCurrent(goal.manualCurrent !== undefined ? String(goal.manualCurrent) : '0');
    } else {
      setLabel(''); setIcon('bolt'); setTarget(''); setUnit(''); setDeadline(''); setCurrent('0');
    }
  }, [goal]);

  const handleSave = useCallback(() => {
    const targetNum = parseFloat(target);
    if (isNaN(targetNum) || targetNum <= 0) return;
    const trimmedLabel = label.trim();
    if (!trimmedLabel) return;
    onSave({
      id: goal?.id ?? `g_${Date.now()}`,
      label: trimmedLabel,
      emoji: icon,
      target: targetNum,
      unit: unit.trim() || 'units',
      deadline: deadline.trim() || 'ONGOING',
      manualCurrent: isCustom ? (parseFloat(current) || 0) : goal?.manualCurrent,
    });
    onClose();
  }, [goal, label, icon, target, unit, deadline, current, isCustom, onSave, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={handleShow}>
      <KeyboardAvoidingView style={editStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <GlassSheet style={editStyles.sheet}>
        <ScrollView contentContainerStyle={editStyles.sheetContent} keyboardShouldPersistTaps="handled">
          <View style={editStyles.handle} />
          <Text style={editStyles.title}>{goal ? 'EDIT GOAL' : 'NEW HORIZON GOAL'}</Text>
          <View style={editStyles.field}>
            <Text style={editStyles.fieldLabel}>LABEL</Text>
            <TextInput style={editStyles.input} value={label} onChangeText={setLabel} placeholder="e.g. Read 12 Books" placeholderTextColor={COLORS.textMuted} />
          </View>
          <View style={editStyles.field}>
            <Text style={editStyles.fieldLabel}>ICON</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={editStyles.iconRow}>
              {ICON_CHOICES.map((id) => (
                <TouchableOpacity
                  key={id}
                  onPress={() => setIcon(id)}
                  activeOpacity={0.7}
                  style={[editStyles.iconChip, icon === id && editStyles.iconChipActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`${id} icon`}
                  accessibilityState={{ selected: icon === id }}
                >
                  <AppIcon id={id} size={16} color={icon === id ? COLORS.textInverse : COLORS.textSecondary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <View style={editStyles.row}>
            <View style={[editStyles.field, { flex: 1 }]}>
              <Text style={editStyles.fieldLabel}>TARGET</Text>
              <TextInput style={editStyles.input} value={target} onChangeText={setTarget} keyboardType="numeric" placeholder="12" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={[editStyles.field, { flex: 1 }]}>
              <Text style={editStyles.fieldLabel}>UNIT</Text>
              <TextInput style={editStyles.input} value={unit} onChangeText={setUnit} placeholder="books" placeholderTextColor={COLORS.textMuted} />
            </View>
          </View>
          {isCustom && (
            <View style={editStyles.field}>
              <Text style={editStyles.fieldLabel}>CURRENT PROGRESS</Text>
              <TextInput style={editStyles.input} value={current} onChangeText={setCurrent} keyboardType="numeric" placeholder="0" placeholderTextColor={COLORS.textMuted} />
            </View>
          )}
          <View style={editStyles.field}>
            <Text style={editStyles.fieldLabel}>DEADLINE (e.g. DEC 2026)</Text>
            <TextInput style={editStyles.input} value={deadline} onChangeText={setDeadline} autoCapitalize="characters" placeholder="ONGOING" placeholderTextColor={COLORS.textMuted} />
          </View>
          <View style={editStyles.actions}>
            <TouchableOpacity onPress={onClose} style={editStyles.cancelBtn} activeOpacity={0.7}>
              <Text style={editStyles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={editStyles.saveBtn} activeOpacity={0.7}>
              <Text style={editStyles.saveText}>{goal ? 'SAVE' : 'CREATE'}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
        </GlassSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const editStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.overlay },
  sheet: { maxHeight: '85%' },
  sheetContent: { padding: SPACING.xl },
  handle: { width: 36, height: 3, borderRadius: 2, backgroundColor: COLORS.borderBright, alignSelf: 'center', marginBottom: SPACING.md },
  title: { fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 2, marginBottom: SPACING.md },
  row: { flexDirection: 'row', gap: SPACING.sm },
  iconRow: { gap: SPACING.xs },
  iconChip: {
    width: 36, height: 36, borderRadius: RADII.sm,
    borderWidth: 1, borderColor: COLORS.borderNeon, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  iconChipActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  field: { gap: SPACING.xs, marginBottom: SPACING.md },
  fieldLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5 },
  input: { borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2, fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.body ?? undefined, backgroundColor: COLORS.surface },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  cancelText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  saveBtn: { flex: 1, backgroundColor: COLORS.white, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  saveText: { fontSize: FONT_SIZE.sm, color: COLORS.textInverse, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
});

// ─── Horizon goal card ────────────────────────────────────────────────────────

function HorizonBar({ goal, current, onPress, weightValue, onAdjustWeight }: {
  goal: GrowthGoal; current: number; onPress: () => void;
  weightValue?: number; onAdjustWeight?: (delta: number) => void;
}) {
  const pct = goal.target > 0 ? Math.min(current / goal.target, 1) : 0;
  const displayPct = Math.round(pct * 100);
  const displayCurrent = current >= 1000 ? current.toLocaleString() : current % 1 !== 0 ? current.toFixed(1) : String(current);
  const displayTarget  = goal.target >= 1000 ? goal.target.toLocaleString() : goal.target % 1 !== 0 ? goal.target.toFixed(1) : String(goal.target);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={horizonStyles.card}>
      <View style={horizonStyles.topRow}>
        <View style={horizonStyles.iconBox}><AppIcon id={goal.emoji} size={16} color={COLORS.textSecondary} /></View>
        <View style={horizonStyles.labelGroup}>
          <Text style={horizonStyles.label}>{goal.label}</Text>
          <Text style={horizonStyles.deadline}>BY {goal.deadline}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={horizonStyles.currentVal}>{displayCurrent}<Text style={horizonStyles.unitText}> {goal.unit}</Text></Text>
          <Text style={horizonStyles.targetVal}>/ {displayTarget}</Text>
        </View>
      </View>
      <View style={horizonStyles.track}>
        <View style={[horizonStyles.fill, { width: `${displayPct}%` as any }]} />
      </View>
      {onAdjustWeight && (
        <View style={horizonStyles.weightRow}>
          <TouchableOpacity onPress={() => onAdjustWeight(-0.5)} style={horizonStyles.weightBtn} activeOpacity={0.7}>
            <Text style={horizonStyles.weightBtnText}>−0.5</Text>
          </TouchableOpacity>
          <Text style={horizonStyles.weightLabel}>
            CURRENT: {weightValue && weightValue > 0 ? `${weightValue.toFixed(1)} KG` : '— KG'}
          </Text>
          <TouchableOpacity onPress={() => onAdjustWeight(0.5)} style={[horizonStyles.weightBtn, { borderColor: COLORS.borderBright }]} activeOpacity={0.7}>
            <Text style={[horizonStyles.weightBtnText, { color: COLORS.textPrimary }]}>+0.5</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

const horizonStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.lg, padding: SPACING.md, marginBottom: SPACING.sm,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  iconBox: {
    width: 34, height: 34, borderRadius: RADII.sm,
    borderWidth: 1, borderColor: COLORS.borderDim, backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  labelGroup: { flex: 1, gap: 2 },
  label: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.bodySemi ?? undefined, fontWeight: '600' },
  deadline: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },
  currentVal: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  unitText: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, fontWeight: '400' },
  targetVal: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5 },
  track: { height: 5, backgroundColor: COLORS.borderNeon, borderRadius: RADII.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: RADII.full, backgroundColor: COLORS.textPrimary },
  weightRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.divider,
  },
  weightBtn: { borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
  weightBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  weightLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },
});

// ─── Weekly growth score chart (line) ─────────────────────────────────────────

const CHART_W = 340;
const CHART_H = 130;
const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Smooth curve through points via quadratic beziers anchored at midpoints */
function buildSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y} `;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    d += `Q ${p0.x} ${p0.y} ${midX} ${midY} `;
  }
  const last = pts[pts.length - 1];
  d += `T ${last.x} ${last.y}`;
  return d;
}

/** Step-after path: flat at each value, vertical jump at the next x — for
 * discrete weekly totals rather than a continuous trend. */
function buildStepPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y} `;
  for (let i = 1; i < pts.length; i++) {
    d += `L ${pts[i].x} ${pts[i - 1].y} L ${pts[i].x} ${pts[i].y} `;
  }
  return d.trim();
}

function WeeklyScoreChart({ scores }: { scores: number[] }) {
  const padL = 24, padB = 18, padT = 8;
  const plotW = CHART_W - padL - 8;
  const plotH = CHART_H - padB - padT;
  const stepX = plotW / (scores.length - 1);

  const pts = scores.map((sc, i) => ({
    x: padL + i * stepX,
    y: padT + plotH * (1 - Math.min(sc, 100) / 100),
  }));
  const hasData = scores.some((sc) => sc > 0);

  return (
    <View style={chartStyles.card}>
      <Text style={chartStyles.title}>WEEKLY GROWTH SCORE</Text>
      <Svg width={CHART_W} height={CHART_H}>
        {[0, 25, 50, 75, 100].map((v) => {
          const y = padT + plotH * (1 - v / 100);
          return <Line key={v} x1={padL} y1={y} x2={CHART_W - 8} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />;
        })}
        {hasData && (
          <Path d={buildSmoothPath(pts)} fill="none" stroke={COLORS.textPrimary} strokeWidth={2} strokeLinecap="round" />
        )}
        {hasData && scores.map((sc, i) => (
          sc > 0 ? <Circle key={i} cx={pts[i].x} cy={pts[i].y} r={3} fill={COLORS.textPrimary} /> : null
        ))}
      </Svg>
      <View style={chartStyles.xLabels}>
        {DAY_ABBR.map((d) => <Text key={d} style={chartStyles.xLabel}>{d}</Text>)}
      </View>
    </View>
  );
}

// ─── Monthly training volume chart (weekly totals, step style) ───────────────

function TrainingVolumeChart({ weeks }: { weeks: number[] }) {
  const padL = 8, padB = 18, padT = 8;
  const plotW = CHART_W - padL - 8;
  const plotH = CHART_H - padB - padT;
  const max = Math.max(...weeks, 1);
  const stepX = plotW / (weeks.length - 1);

  const pts = weeks.map((m, i) => ({
    x: padL + i * stepX,
    y: padT + plotH * (1 - m / max),
  }));

  return (
    <View style={chartStyles.card}>
      <Text style={chartStyles.title}>MONTHLY TRAINING VOLUME</Text>
      <Svg width={CHART_W} height={CHART_H}>
        <Path d={buildStepPath(pts)} fill="none" stroke={COLORS.textSecondary} strokeWidth={2} strokeLinejoin="round" />
      </Svg>
      <View style={chartStyles.xLabels}>
        {weeks.map((_, i) => <Text key={i} style={chartStyles.xLabel}>W{i + 1}</Text>)}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.lg, padding: SPACING.md, marginBottom: SPACING.md, alignItems: 'center',
  },
  title: { alignSelf: 'flex-start', fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700', marginBottom: SPACING.sm },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', width: CHART_W - 16, marginTop: 2 },
  xLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined },
});

// ─── Milestones ───────────────────────────────────────────────────────────────

interface MilestoneResult {
  label: string;
  sub: string;
  achieved: boolean;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
}

function computeMilestone(
  name: string, value: number, thresholds: number[], unit: string,
  Icon: React.ComponentType<{ size?: number; color?: string }>,
): MilestoneResult {
  const achievedThreshold = thresholds.find((t) => value >= t);
  if (achievedThreshold) {
    return { label: name, sub: `${achievedThreshold}${unit}`, achieved: true, Icon };
  }
  const next = [...thresholds].sort((a, b) => a - b).find((t) => t > value) ?? thresholds[0];
  return { label: name, sub: `${Math.floor(value)}/${next}${unit}`, achieved: false, Icon };
}

function MilestoneCard({ milestone }: { milestone: MilestoneResult }) {
  const { Icon } = milestone;
  return (
    <View style={[milestoneStyles.card, !milestone.achieved && { opacity: 0.5 }]}>
      <View style={[milestoneStyles.iconCircle, milestone.achieved && milestoneStyles.iconCircleOn]}>
        <Icon size={16} color={milestone.achieved ? COLORS.textInverse : COLORS.textMuted} />
      </View>
      <Text style={milestoneStyles.label}>{milestone.label}</Text>
      <Text style={milestoneStyles.sub}>{milestone.sub}</Text>
    </View>
  );
}

const milestoneStyles = StyleSheet.create({
  card: {
    width: '47.5%', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.lg, paddingVertical: SPACING.md,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.borderDim, backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  iconCircleOn: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  label: { fontSize: FONT_SIZE.xs, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1 },
  sub: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5 },
});

// ─── GoalsSection ─────────────────────────────────────────────────────────────

type CurrentValues = Record<string, number>;

export function GoalsSection() {
  const [goals,         setGoals]         = useState<GrowthGoal[]>(DEFAULT_GROWTH_GOALS);
  const [currentValues, setCurrentValues] = useState<CurrentValues>({});
  const [editingGoal,   setEditingGoal]   = useState<GrowthGoal | null>(null);
  const [creatingGoal,  setCreatingGoal]  = useState(false);
  const [currentWeight, setCurrentWeight] = useState(0);

  const [quarterPct, setQuarterPct]       = useState(0);
  const [quarterLabel, setQuarterLabel]   = useState('');
  const [daysLeft, setDaysLeft]           = useState(0);
  const [deadlineLabel, setDeadlineLabel] = useState('');
  const [daysActive, setDaysActive]       = useState(0);
  const [totalDays, setTotalDays]         = useState(0);
  const [avgScore, setAvgScore]           = useState(0);
  const [weeklyScores, setWeeklyScores]   = useState<number[]>(new Array(7).fill(0));
  const [wowChange, setWowChange]         = useState<number | null>(null);
  const [trainingWeeks, setTrainingWeeks] = useState<number[]>([0, 0, 0, 0]);
  const [streakMilestone, setStreakMilestone]     = useState<MilestoneResult | null>(null);
  const [trainingMilestone, setTrainingMilestone] = useState<MilestoneResult | null>(null);
  const [hydrationMilestone, setHydrationMilestone] = useState<MilestoneResult | null>(null);
  const [zenMilestone, setZenMilestone]           = useState<MilestoneResult | null>(null);
  const [milestonesExpanded, setMilestonesExpanded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        try {
          const now = new Date();
          const [loadedGoals, settings, allKeys, weightPairs, streakRaw] = await Promise.all([
            getGrowthGoals(),
            getSettings(),
            AsyncStorage.getAllKeys(),
            AsyncStorage.multiGet([KEYS.weightStart, KEYS.weight]),
            AsyncStorage.getItem(KEYS.streak),
          ]);

          if (!active) return;
          setGoals(loadedGoals);

          // ── Hydration streak (consecutive days >= waterGoal) ──────────────
          const last90 = Array.from({ length: 90 }, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() - i);
            return `@vitalis/water_${formatDateKey(d)}`;
          });
          const [waterPairs, sleepPairs] = await Promise.all([
            AsyncStorage.multiGet(last90),
            AsyncStorage.multiGet(last90.map((k) => k.replace('/water_', '/sleep_'))),
          ]);

          let hydStreak = 0;
          // Today's entry hasn't necessarily been completed yet — don't let an
          // in-progress day break a real streak. Skip index 0 (today) unless
          // it already meets the goal, matching the habit-streak logic used
          // elsewhere (RoutinesScreen).
          const todayMetGoal = !!waterPairs[0]?.[1] && parseInt(waterPairs[0][1]!, 10) >= settings.waterGoal;
          for (let i = todayMetGoal ? 0 : 1; i < waterPairs.length; i++) {
            const v = waterPairs[i][1];
            if (v && parseInt(v, 10) >= settings.waterGoal) hydStreak++;
            else break;
          }

          const sleepWithData = sleepPairs.filter(([, v]) => v && parseFloat(v) > 0);
          const goodSleep     = sleepWithData.filter(([, v]) => parseFloat(v!) >= 7);
          const sleepPct      = sleepWithData.length > 0
            ? Math.round((goodSleep.length / sleepWithData.length) * 100)
            : 0;

          const year = now.getFullYear().toString();
          const workoutKeys = allKeys.filter((k) => k.startsWith(`@vitalis/workout_${year}`));
          let trainingDays = 0;
          if (workoutKeys.length > 0) {
            const wPairs = await AsyncStorage.multiGet(workoutKeys);
            trainingDays = wPairs.filter(([, v]) => v && v !== 'rest').length;
          }

          const logKeys = allKeys.filter((k) => k.startsWith('@vitalis/log_'));
          let mindfulMinutes = 0;
          if (logKeys.length > 0) {
            const lPairs = await AsyncStorage.multiGet(logKeys);
            for (const [, v] of lPairs) {
              if (!v) continue;
              try {
                const events = JSON.parse(v) as Array<{ id: string }>;
                mindfulMinutes += events.filter((e) => e.id?.startsWith('meditate')).length * 10;
              } catch {}
            }
          }

          const startWeight   = weightPairs[0][1] ? parseFloat(weightPairs[0][1]) : 0;
          const curWeightVal  = weightPairs[1][1] ? parseFloat(weightPairs[1][1]) : 0;
          const kgLost = startWeight > 0 && curWeightVal > 0
            ? Math.max(0, parseFloat((startWeight - curWeightVal).toFixed(1)))
            : 0;
          setCurrentWeight(curWeightVal);

          // ── Quarter stats ──────────────────────────────────────────────────
          const { start: qStart, end: qEnd, label: qLabel } = getQuarterBounds(now);
          const scoreKeys = allKeys.filter((k) => k.startsWith('@vitalis/score_'));
          const scorePairs = await AsyncStorage.multiGet(scoreKeys);
          const scoreByDate = new Map<string, number>();
          scorePairs.forEach(([k, v]) => {
            if (!v) return;
            const dateStr = k.replace('@vitalis/score_', '');
            scoreByDate.set(dateStr, parseInt(v, 10));
          });

          const quarterScores: number[] = [];
          let cursor = new Date(qStart);
          while (cursor <= qEnd && cursor <= now) {
            const key = formatDateKey(cursor);
            const val = scoreByDate.get(key);
            if (val !== undefined) quarterScores.push(val);
            cursor.setDate(cursor.getDate() + 1);
          }
          const totalQuarterDays = daysBetween(qStart, qEnd) + 1;

          if (!active) return;
          setQuarterLabel(qLabel);
          setDaysActive(quarterScores.length);
          setTotalDays(totalQuarterDays);
          setAvgScore(quarterScores.length > 0
            ? Math.round((quarterScores.reduce((a, b) => a + b, 0) / quarterScores.length) * 10) / 10
            : 0);
          setDaysLeft(Math.max(0, daysBetween(now, qEnd)));
          setDeadlineLabel(fmtShortDate(qEnd));

          // ── Weekly score chart (Mon–Sun of current week) ──────────────────
          const monday = mostRecentMonday(now);
          const week = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday); d.setDate(d.getDate() + i);
            return scoreByDate.get(formatDateKey(d)) ?? 0;
          });
          setWeeklyScores(week);

          const prevMonday = new Date(monday); prevMonday.setDate(prevMonday.getDate() - 7);
          const prevWeek = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(prevMonday); d.setDate(d.getDate() + i);
            return scoreByDate.get(formatDateKey(d)) ?? 0;
          }).filter((v) => v > 0);
          const thisWeekValid = week.filter((v) => v > 0);
          if (prevWeek.length > 0 && thisWeekValid.length > 0) {
            const prevAvg = prevWeek.reduce((a, b) => a + b, 0) / prevWeek.length;
            const curAvg = thisWeekValid.reduce((a, b) => a + b, 0) / thisWeekValid.length;
            setWowChange(prevAvg > 0 ? Math.round(((curAvg - prevAvg) / prevAvg) * 100) : null);
          } else {
            setWowChange(null);
          }

          // ── Training volume: sessions summed per week, last 4 weeks ───────
          const sessionKeys = allKeys.filter((k) => k.startsWith('@vitalis/workout_session_'));
          const sessionPairs = await AsyncStorage.multiGet(sessionKeys);
          const sessions: WorkoutSession[] = sessionPairs
            .map(([, v]) => { try { return v ? (JSON.parse(v) as WorkoutSession) : null; } catch { return null; } })
            .filter((s): s is WorkoutSession => s !== null);

          const weekBuckets = [0, 0, 0, 0]; // oldest → newest
          const weekStarts = Array.from({ length: 4 }, (_, i) => {
            const d = new Date(monday); d.setDate(d.getDate() - (3 - i) * 7);
            return d;
          });
          sessions.forEach((sess) => {
            const sessDate = new Date(sess.date + 'T12:00:00');
            for (let i = 0; i < 4; i++) {
              const wStart = weekStarts[i];
              const wEnd = new Date(wStart); wEnd.setDate(wEnd.getDate() + 7);
              if (sessDate >= wStart && sessDate < wEnd) {
                weekBuckets[i] += sess.durationMinutes;
                break;
              }
            }
          });
          setTrainingWeeks(weekBuckets);

          // ── Milestones (genuine, computed from real data) ─────────────────
          const totalTrainingHours = sessions.reduce((sum, s) => sum + s.durationMinutes, 0) / 60;
          const streakVal = streakRaw ? parseInt(streakRaw, 10) : 0;
          setStreakMilestone(computeMilestone('EARLY RISER', streakVal, [30, 14, 7], ' DAY STREAK', SunriseIcon));
          setTrainingMilestone(computeMilestone('IRON WILL', totalTrainingHours, [150, 75, 25], 'H TRAINING', DumbbellIcon));
          setHydrationMilestone(computeMilestone('HYDRATION HERO', hydStreak, [30, 14, 7], ' DAY STREAK', DropletIcon));
          setZenMilestone(computeMilestone('ZEN MASTER', mindfulMinutes, [500, 180, 60], ' MIN', LotusIcon));

          // ── Savings progress (Finance module) ──────────────────────────────
          const savingsPct = await getSavingsProgressPct();

          // Map goal IDs to computed values (built-in goals only)
          const cv: CurrentValues = {};
          loadedGoals.forEach((g) => {
            if      (g.id === 'g1') cv[g.id] = kgLost;
            else if (g.id === 'g2') cv[g.id] = trainingDays;
            else if (g.id === 'g3') cv[g.id] = hydStreak;
            else if (g.id === 'g4') cv[g.id] = sleepPct;
            else if (g.id === 'g5') cv[g.id] = mindfulMinutes;
            else if (g.id === 'g6') cv[g.id] = savingsPct;
            else                    cv[g.id] = g.manualCurrent ?? 0;
          });
          setCurrentValues(cv);

          const overallAvg = loadedGoals.length > 0
            ? Math.round(loadedGoals.reduce((sum, g) => sum + Math.min((cv[g.id] ?? 0) / Math.max(g.target, 1), 1), 0) / loadedGoals.length * 100)
            : 0;
          setQuarterPct(overallAvg);
        } catch (_) {}
      };
      load();
      return () => { active = false; };
    }, [])
  );

  const handleSaveGoal = useCallback(async (updated: GrowthGoal) => {
    try {
      const exists = goals.some((g) => g.id === updated.id);
      const newGoals = exists ? goals.map((g) => (g.id === updated.id ? updated : g)) : [...goals, updated];
      setGoals(newGoals);
      await saveGrowthGoals(newGoals);
      if (!exists) {
        setCurrentValues((prev) => ({ ...prev, [updated.id]: updated.manualCurrent ?? 0 }));
      }
    } catch {}
  }, [goals]);

  const handleAdjustWeight = useCallback(async (delta: number) => {
    const base = currentWeight > 0 ? currentWeight : 70;
    const next = Math.max(0, Math.round((base + delta) * 10) / 10);
    setCurrentWeight(next);
    try {
      await AsyncStorage.setItem(KEYS.weight, String(next));
      const existing = await AsyncStorage.getItem(KEYS.weightStart);
      if (!existing) await AsyncStorage.setItem(KEYS.weightStart, String(next));
      const startRaw = await AsyncStorage.getItem(KEYS.weightStart);
      const start = startRaw ? parseFloat(startRaw) : next;
      const kgLost = Math.max(0, parseFloat((start - next).toFixed(1)));
      setCurrentValues((prev) => ({ ...prev, g1: kgLost }));
    } catch {}
  }, [currentWeight]);

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <Text style={s.quarterLabel}>CURRENT QUARTER: {quarterLabel}</Text>

      {/* Quarter completion card */}
      <View style={s.quarterCard}>
        <View style={s.quarterTopRow}>
          <View>
            <Text style={s.quarterPct}>{quarterPct}%</Text>
            <Text style={s.quarterPctSub}>Target Completion</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.quarterDaysLeft}>{daysLeft} DAYS LEFT</Text>
            <Text style={s.quarterDeadline}>DEADLINE: {deadlineLabel}</Text>
          </View>
        </View>
        <View style={s.quarterTrack}>
          <View style={[s.quarterFill, { width: `${quarterPct}%` as any }]} />
        </View>
        <View style={s.quarterStatsRow}>
          <View>
            <Text style={s.quarterStatLabel}>DAYS ACTIVE</Text>
            <Text style={s.quarterStatValue}>{daysActive}/{totalDays}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.quarterStatLabel}>AVG. SCORE</Text>
            <Text style={s.quarterStatValue}>{avgScore}</Text>
          </View>
        </View>
      </View>

      {/* Horizon goals */}
      <View style={s.sectionRow}>
        <Text style={s.sectionTitle}>Horizon Goals</Text>
        <Text style={s.trendIcon}>↗</Text>
      </View>
      {goals.map((g) => (
        <HorizonBar
          key={g.id} goal={g} current={currentValues[g.id] ?? 0} onPress={() => setEditingGoal(g)}
          weightValue={g.id === 'g1' ? currentWeight : undefined}
          onAdjustWeight={g.id === 'g1' ? handleAdjustWeight : undefined}
        />
      ))}

      {/* Trend analysis */}
      <View style={s.sectionRow}>
        <Text style={s.sectionTitle}>Trend Analysis</Text>
        {wowChange !== null && (
          <Text style={[s.wowText, wowChange < 0 && { color: COLORS.red }]}>
            {wowChange >= 0 ? '↗' : '↘'} {wowChange >= 0 ? '+' : ''}{wowChange}% VS LW
          </Text>
        )}
      </View>
      <WeeklyScoreChart scores={weeklyScores} />
      <TrainingVolumeChart weeks={trainingWeeks} />

      {/* Milestones */}
      <View style={s.sectionRow}>
        <Text style={s.sectionTitle}>Milestones</Text>
        <TouchableOpacity onPress={() => setMilestonesExpanded((v) => !v)} activeOpacity={0.7}>
          <Text style={s.viewAllLink}>{milestonesExpanded ? 'SHOW LESS' : 'View All'}</Text>
        </TouchableOpacity>
      </View>
      <View style={s.milestoneGrid}>
        {streakMilestone && <MilestoneCard milestone={streakMilestone} />}
        {trainingMilestone && <MilestoneCard milestone={trainingMilestone} />}
        {milestonesExpanded && hydrationMilestone && <MilestoneCard milestone={hydrationMilestone} />}
        {milestonesExpanded && zenMilestone && <MilestoneCard milestone={zenMilestone} />}
      </View>

      {/* New goal CTA */}
      <View style={s.newGoalCard}>
        <View style={s.newGoalIcon}><Text style={s.newGoalIconText}>+</Text></View>
        <Text style={s.newGoalTitle}>New Horizon Goal?</Text>
        <Text style={s.newGoalSub}>Define a new target for the next quarter to maintain momentum.</Text>
        <TouchableOpacity
          onPress={() => setCreatingGoal(true)}
          style={s.configureBtn}
          activeOpacity={0.7}
        >
          <Text style={s.configureBtnText}>Configure Goal</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: SPACING.xxl }} />

      <GoalEditModal
        visible={editingGoal !== null || creatingGoal}
        goal={editingGoal}
        onClose={() => { setEditingGoal(null); setCreatingGoal(false); }}
        onSave={handleSaveGoal}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.sm },

  quarterLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginBottom: SPACING.sm },

  quarterCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.lg, padding: SPACING.md, marginBottom: SPACING.lg,
  },
  quarterTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  quarterPct: { fontSize: FONT_SIZE.xxxl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: -1 },
  quarterPctSub: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, marginTop: 2 },
  quarterDaysLeft: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },
  quarterDeadline: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5, marginTop: 2 },
  quarterTrack: { height: 5, backgroundColor: COLORS.borderNeon, borderRadius: RADII.full, overflow: 'hidden', marginVertical: SPACING.md },
  quarterFill: { height: '100%', backgroundColor: COLORS.textPrimary, borderRadius: RADII.full },
  quarterStatsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.borderDim,
  },
  quarterStatLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginBottom: 3 },
  quarterStatValue: { fontSize: FONT_SIZE.md, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.sm, marginBottom: SPACING.sm },
  sectionTitle: { fontSize: FONT_SIZE.md, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  trendIcon: { fontSize: FONT_SIZE.md, color: COLORS.textMuted },
  wowText: { fontSize: 9, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5, fontWeight: '700' },
  viewAllLink: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5 },

  milestoneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.lg },

  newGoalCard: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderStyle: 'dashed', borderRadius: RADII.lg,
    padding: SPACING.lg, alignItems: 'center', gap: 4,
  },
  newGoalIcon: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.borderBright, backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xs,
  },
  newGoalIconText: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontWeight: '700' },
  newGoalTitle: { fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  newGoalSub: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, textAlign: 'center', marginBottom: SPACING.sm },
  configureBtn: { borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: RADII.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  configureBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
});
