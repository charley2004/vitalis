import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScoreRing } from '../components/ScoreRing';
import { GlassCard } from '../components/GlassCard';
import { AppIcon, BoltIcon, DumbbellIcon, CheckCircleIcon } from '../components/icons';
import {
  COLORS, FONTS, FONT_SIZE, SPACING, RADII, getScoreColor,
} from '../theme';
import {
  getTodayKey, getYesterdayKey, getLast7DayKeys, getDayAbbr,
  KEYS, calcScore, countRoutineHitsAndSkips, getSettings, getRoutineConfig, AppSettings, DEFAULT_SETTINGS,
  getWorkoutSession, WorkoutSession,
} from '../services/storage';
import { fmtTime, fmtDuration } from '../services/calendar';
import { loadUnifiedAgenda, UnifiedAgenda, AgendaItem } from '../services/planner';
import { QuickCaptureBar, DEFAULT_ACTIONS, QuickAction } from '../components/QuickCaptureBar';
import { getFinanceSettings, getTotalBalance, getSavingsProgressPct, getUpcomingBills, fmtCurrency } from '../services/finance';

interface LogEvent {
  id: string;
  timestamp: string;
  label: string;
  emoji: string;
  status: 'OK' | 'WARN' | 'MISS';
  detail?: string;
}

// Meal/Meditate/Journal/Coffee are lightweight captures — a log entry, not a
// dedicated tracking screen. Hydrate/Steps/Sleep/Train already have their
// own real UI on this screen, so they're excluded here rather than duplicated.
const MORE_ACTIONS = DEFAULT_ACTIONS.filter((a) => ['meal', 'meditate', 'journal', 'caffeine'].includes(a.id));
const QUICK_CAPTURE_COPY: Record<string, { label: string; detail: string }> = {
  meal:     { label: 'Meal',     detail: 'Logged a meal' },
  meditate: { label: 'Meditate', detail: '10 min mindfulness session' },
  journal:  { label: 'Journal',  detail: 'Logged a journal entry' },
  caffeine: { label: 'Coffee',   detail: 'Logged a coffee' },
};

// Per-metric accent colors (design system: dark mono base + functional accents)
const ACCENT = {
  hydration: { main: '#22D3EE', dim: 'rgba(34,211,238,0.10)' },
  activity:  { main: '#F97316', dim: 'rgba(249,115,22,0.10)' },
  recovery:  { main: '#A78BFA', dim: 'rgba(167,139,250,0.10)' },
  metabolic: { main: '#F87171', dim: 'rgba(248,113,113,0.10)' },
  streak:    { main: '#818CF8', dim: 'rgba(129,140,248,0.14)' },
} as const;

const SLEEP_CHOICES = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5];

// ─── Header ───────────────────────────────────────────────────────────────────

function Header() {
  const dateStr = new Date()
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase();
  return (
    <View style={hs.row}>
      <View style={hs.brandRow}>
        <View style={hs.logoBox}>
          <BoltIcon size={16} color={COLORS.textPrimary} />
        </View>
        <Text style={hs.brand}>VITALIS</Text>
      </View>
      <View style={hs.right}>
        <Text style={hs.focusLabel}>TODAY'S FOCUS</Text>
        <Text style={hs.date}>{dateStr}</Text>
      </View>
    </View>
  );
}

const hs = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenPad, paddingVertical: SPACING.md,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  logoBox: {
    width: 30, height: 30, borderRadius: RADII.sm,
    borderWidth: 1, borderColor: COLORS.borderBright,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  brand: {
    fontSize: FONT_SIZE.lg, color: COLORS.textPrimary,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 3,
  },
  right:      { alignItems: 'flex-end' },
  focusLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2 },
  date:       { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700', marginTop: 2 },
});

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricTile({
  label, icon, accent, value, unit, goalLabel, pct,
}: {
  label: string;
  icon: string;
  accent: { main: string; dim: string };
  value: string;
  unit: string;
  goalLabel: string;
  pct: number;
}) {
  return (
    <View style={ms.tile}>
      <View style={ms.topRow}>
        <Text style={ms.label}>{label}</Text>
        <View style={[ms.iconBox, { backgroundColor: accent.dim }]}>
          <AppIcon id={icon} size={13} color={accent.main} />
        </View>
      </View>
      <View style={ms.valueRow}>
        <Text style={ms.value}>{value}</Text>
        <Text style={ms.unit}> {unit}</Text>
      </View>
      <Text style={ms.goal}>{goalLabel}</Text>
      <View style={ms.track}>
        <View style={[ms.fill, { width: `${Math.min(pct, 100)}%` as any, backgroundColor: accent.main }]} />
      </View>
    </View>
  );
}

const ms = StyleSheet.create({
  tile: {
    width: '48.4%',
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.md, padding: SPACING.md,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label:  { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },
  iconBox: {
    width: 24, height: 24, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: SPACING.sm },
  value: {
    fontSize: FONT_SIZE.xxl, color: COLORS.textPrimary,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: -0.5,
  },
  unit:  { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5 },
  goal:  { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, marginTop: 6 },
  track: { height: 3, backgroundColor: COLORS.borderNeon, borderRadius: RADII.full, overflow: 'hidden', marginTop: 6 },
  fill:  { height: '100%', borderRadius: RADII.full },
});

// ─── Week Summary (kept from previous design, slimmed) ──────────────────────

function WeekSummary({ scores }: { scores: { day: string; score: number }[] }) {
  const valid = scores.filter((s) => s.score > 0);
  const avg = valid.length ? Math.round(valid.reduce((a, b) => a + b.score, 0) / valid.length) : 0;
  const best = valid.length ? Math.max(...valid.map((s) => s.score)) : 0;

  return (
    <GlassCard noShadow>
      <View style={ws.row}>
        <View style={ws.stat}>
          <Text style={ws.statLabel}>7D AVG</Text>
          <Text style={ws.statVal}>{avg > 0 ? avg : '—'}</Text>
        </View>
        <View style={ws.barsContainer}>
          {scores.map((s, i) => (
            <View key={i} style={ws.barWrap}>
              <View style={ws.barTrack}>
                <View
                  style={[
                    ws.barFill,
                    {
                      height: s.score > 0 ? `${s.score}%` as any : '4%' as any,
                      backgroundColor: s.score > 0 ? getScoreColor(s.score) : COLORS.borderNeon,
                    },
                  ]}
                />
              </View>
              <Text style={ws.dayLabel}>{s.day.slice(0, 1)}</Text>
            </View>
          ))}
        </View>
        <View style={[ws.stat, { alignItems: 'flex-end' }]}>
          <Text style={ws.statLabel}>BEST</Text>
          <Text style={ws.statVal}>{best > 0 ? best : '—'}</Text>
        </View>
      </View>
    </GlassCard>
  );
}

const ws = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  stat: { alignItems: 'center', gap: 2, width: 40 },
  statLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },
  statVal: { fontSize: FONT_SIZE.xl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  barsContainer: { flex: 1, flexDirection: 'row', gap: 4, height: 48 },
  barWrap: { flex: 1, alignItems: 'center', gap: 3 },
  barTrack: {
    flex: 1, width: '100%', backgroundColor: COLORS.borderDim,
    borderRadius: RADII.xs, justifyContent: 'flex-end', overflow: 'hidden',
  },
  barFill: { width: '100%', borderRadius: RADII.xs },
  dayLabel: { fontSize: 7, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined },
});

// ─── TodayScreen ──────────────────────────────────────────────────────────────

export function TodayScreen() {
  const navigation = useNavigation();
  const dateKey = getTodayKey();

  const [score, setScore]               = useState(0);
  const [streak, setStreak]             = useState(0);
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [steps, setSteps]               = useState(0);
  const [sleepHours, setSleepHours]     = useState(0);
  const [workout, setWorkout]           = useState<WorkoutSession | null>(null);
  const [agenda, setAgenda]             = useState<UnifiedAgenda | null>(null);
  const [financeSummary, setFinanceSummary] = useState<{
    onboarded: boolean; balance: number; savingsPct: number; billsCount: number; currencyCode: string;
  } | null>(null);
  const [sleepPickerOpen, setSleepPickerOpen] = useState(false);
  const [nowMinutes, setNowMinutes]     = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  const [weekScores, setWeekScores]     = useState<{ day: string; score: number }[]>(
    getLast7DayKeys().map((k) => ({ day: getDayAbbr(k), score: 0 }))
  );
  const settingsRef = useRef<AppSettings>({ ...DEFAULT_SETTINGS });
  const totalRoutinesRef = useRef(10);

  // Countdown tick for UP NEXT
  useEffect(() => {
    const id = setInterval(() => {
      setNowMinutes(new Date().getHours() * 60 + new Date().getMinutes());
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const recomputeScore = useCallback(
    async (routineStates: Record<string, string>, glasses: number, stepCount: number, sleep: number) => {
      const s = settingsRef.current;
      const { hits, skipped } = countRoutineHitsAndSkips(routineStates);
      const computed = calcScore(hits, totalRoutinesRef.current - skipped, glasses, s.waterGoal, stepCount, s.stepGoal, sleep, s.sleepGoalHours);
      setScore(computed);
      await AsyncStorage.setItem(KEYS.score(dateKey), String(computed)).catch(() => {});
      return computed;
    },
    [dateKey]
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        try {
          const [settings, routineConfig, session, dayAgenda, finSettings, balance, savingsPct, bills] = await Promise.all([
            getSettings(),
            getRoutineConfig(),
            getWorkoutSession(dateKey),
            loadUnifiedAgenda(dateKey),
            getFinanceSettings(),
            getTotalBalance(),
            getSavingsProgressPct(),
            getUpcomingBills(7),
          ]);
          settingsRef.current = settings;
          totalRoutinesRef.current = routineConfig.filter((r) => r.enabled !== false).length;
          if (active) {
            setFinanceSummary({ onboarded: finSettings.onboarded, balance, savingsPct, billsCount: bills.length, currencyCode: finSettings.currencyCode });
          }

          const dayKeys = getLast7DayKeys();

          const [routinesRaw, waterRaw, stepsRaw, sleepRaw, streakRaw, streakLastDateRaw] = await Promise.all([
            AsyncStorage.getItem(KEYS.routines(dateKey)),
            AsyncStorage.getItem(KEYS.water(dateKey)),
            AsyncStorage.getItem(KEYS.steps(dateKey)),
            AsyncStorage.getItem(KEYS.sleep(dateKey)),
            AsyncStorage.getItem(KEYS.streak),
            AsyncStorage.getItem(KEYS.streakLastDate),
          ]);

          if (!active) return;

          const routineStates: Record<string, string> = routinesRaw ? JSON.parse(routinesRaw) : {};
          const glasses = waterRaw ? parseInt(waterRaw, 10) : 0;
          const stepCount = stepsRaw ? parseInt(stepsRaw, 10) : 0;
          const sleep = sleepRaw ? parseFloat(sleepRaw) : 0;

          let streakCount = streakRaw ? parseInt(streakRaw, 10) : 0;
          if (streakLastDateRaw && streakLastDateRaw !== getTodayKey()) {
            if (streakLastDateRaw !== getYesterdayKey()) {
              streakCount = 0;
              await AsyncStorage.setItem(KEYS.streak, '0');
            }
          }

          setWaterGlasses(glasses);
          setSteps(stepCount);
          setSleepHours(sleep);
          setStreak(streakCount);
          setWorkout(session);
          setAgenda(dayAgenda);

          const s = settings;
          const { hits, skipped } = countRoutineHitsAndSkips(routineStates);
          const computed = calcScore(hits, totalRoutinesRef.current - skipped, glasses, s.waterGoal, stepCount, s.stepGoal, sleep, s.sleepGoalHours);
          setScore(computed);
          await AsyncStorage.setItem(KEYS.score(dateKey), String(computed)).catch(() => {});

          const weekScorePairs = await AsyncStorage.multiGet(dayKeys.map((k) => KEYS.score(k)));
          if (active) {
            setWeekScores(dayKeys.map((k, i) => ({
              day: getDayAbbr(k),
              score: weekScorePairs[i][1] ? parseInt(weekScorePairs[i][1]!, 10) : 0,
            })));
          }
        } catch (_) {}
      };
      load();
      return () => { active = false; };
    }, [dateKey])
  );

  const appendLog = useCallback(async (label: string, emoji: string, detail: string) => {
    const entry: LogEvent = {
      // Lowercased on purpose — GrowthScreen matches log entries by id prefix
      // (e.g. "meditate") to compute Mindful Minutes, and a mismatched case
      // would make that goal permanently uncomputable.
      id: `${label.toLowerCase()}_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      label, emoji, status: 'OK', detail,
    };
    try {
      const raw = await AsyncStorage.getItem(KEYS.log(dateKey));
      const logEvents: LogEvent[] = raw ? JSON.parse(raw) : [];
      await AsyncStorage.setItem(KEYS.log(dateKey), JSON.stringify([entry, ...logEvents]));
    } catch {}
  }, [dateKey]);

  const handleQuickCapture = useCallback((action: QuickAction) => {
    const c = QUICK_CAPTURE_COPY[action.id];
    if (c) appendLog(c.label, action.emoji, c.detail);
  }, [appendLog]);

  const readRoutines = useCallback(async (): Promise<Record<string, string>> => {
    const raw = await AsyncStorage.getItem(KEYS.routines(dateKey));
    return raw ? JSON.parse(raw) : {};
  }, [dateKey]);

  const handleAddWater = useCallback(async () => {
    const updated = waterGlasses + 1;
    setWaterGlasses(updated);
    await AsyncStorage.setItem(KEYS.water(dateKey), String(updated));
    await appendLog('Hydrate', 'droplet', `+1 glass → ${updated} / ${settingsRef.current.waterGoal} today`);
    await recomputeScore(await readRoutines(), updated, steps, sleepHours);
  }, [waterGlasses, steps, sleepHours, dateKey, appendLog, readRoutines, recomputeScore]);

  const handleAddSteps = useCallback(async () => {
    const updated = steps + 1000;
    setSteps(updated);
    await AsyncStorage.setItem(KEYS.steps(dateKey), String(updated));
    await appendLog('Steps', 'runner', `+1,000 steps → ${updated.toLocaleString()} today`);
    await recomputeScore(await readRoutines(), waterGlasses, updated, sleepHours);
  }, [steps, waterGlasses, sleepHours, dateKey, appendLog, readRoutines, recomputeScore]);

  const handleLogSleep = useCallback(async (hours: number) => {
    setSleepHours(hours);
    setSleepPickerOpen(false);
    await AsyncStorage.setItem(KEYS.sleep(dateKey), String(hours));
    await appendLog('Sleep', 'moon', `${hours} hours logged`);
    await recomputeScore(await readRoutines(), waterGlasses, steps, hours);
  }, [waterGlasses, steps, dateKey, appendLog, readRoutines, recomputeScore]);

  const s = settingsRef.current;
  const kcal = Math.round(steps * 0.04);
  const kcalGoal = Math.round(s.stepGoal * 0.04);

  const agendaLines = (agenda?.timeline.filter(
    (t): t is { type: 'item'; item: AgendaItem } => t.type === 'item'
  ) ?? []).slice(0, 5);

  const nextItem = agenda?.nextItem ?? null;
  const nextActivityText = (() => {
    if (!nextItem) return "Nothing left on today's agenda.";
    const label = nextItem.kind === 'planner' ? nextItem.occ.event.title : nextItem.routine.label;
    const start = nextItem.kind === 'planner' ? (nextItem.occ.start ?? 0) : nextItem.start;
    if (start > nowMinutes) return `${label} starts in ${fmtDuration(start - nowMinutes)}.`;
    return `${label} is in progress.`;
  })();

  return (
    <SafeAreaView style={st.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        <Header />

        {/* Readiness ring */}
        <View style={st.ringWrap}>
          <ScoreRing score={score} size={190} label="READINESS" />
        </View>

        {/* Streak pill */}
        <View style={st.streakRow}>
          <View style={[st.streakPill, { backgroundColor: ACCENT.streak.dim, borderColor: ACCENT.streak.main }]}>
            <BoltIcon size={12} color={ACCENT.streak.main} />
            <Text style={[st.streakText, { color: ACCENT.streak.main }]}>
              {streak} DAY STREAK
            </Text>
          </View>
        </View>

        {/* TODAY'S AGENDA — AI-merged Routine + Planner summary (see below for helpers) */}
        <View style={st.agendaCard}>
          <View style={st.agendaHeaderRow}>
            <Text style={st.agendaTitle}>TODAY'S AGENDA</Text>
            <View style={st.aiPill}><Text style={st.aiPillText}>AI GENERATED</Text></View>
          </View>

          {agendaLines.length === 0 ? (
            <Text style={st.agendaEmptyText}>
              Nothing scheduled yet — add a routine or a planner event to build today's agenda.
            </Text>
          ) : (
            agendaLines.map((entry, i) => {
              const item = entry.item;
              const label = item.kind === 'planner' ? item.occ.event.title : item.routine.label;
              const start = item.kind === 'planner' ? (item.occ.start ?? 0) : item.start;
              return (
                <View key={i} style={st.agendaLineRow}>
                  <Text style={st.agendaLineTime}>{fmtTime(start)}</Text>
                  <Text style={st.agendaLineDash}>—</Text>
                  <Text style={st.agendaLineLabel} numberOfLines={1}>{label}</Text>
                </View>
              );
            })
          )}

          <View style={st.agendaNextBlock}>
            <Text style={st.agendaNextLabel}>NEXT ACTIVITY</Text>
            <Text style={st.agendaNextText}>{nextActivityText}</Text>
          </View>

          <View style={st.agendaBtnRow}>
            <TouchableOpacity
              style={st.agendaBtnPrimary}
              onPress={() => navigation.navigate('Planner' as never)}
              activeOpacity={0.8}
            >
              <Text style={st.agendaBtnPrimaryText}>Open Planner</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={st.agendaBtnSecondary}
              onPress={() => navigation.navigate('Planner' as never)}
              activeOpacity={0.7}
            >
              <Text style={st.agendaBtnSecondaryText}>View Full Agenda</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Metric grid */}
        <View style={st.grid}>
          <MetricTile
            label="HYDRATION" icon="droplet" accent={ACCENT.hydration}
            value={String(waterGlasses)} unit="GLASSES"
            goalLabel={`GOAL: ${s.waterGoal}`}
            pct={(waterGlasses / s.waterGoal) * 100}
          />
          <MetricTile
            label="ACTIVITY" icon="runner" accent={ACCENT.activity}
            value={steps.toLocaleString()} unit="STEPS"
            goalLabel={`GOAL: ${s.stepGoal >= 1000 ? `${Math.round(s.stepGoal / 1000)}K` : s.stepGoal}`}
            pct={(steps / s.stepGoal) * 100}
          />
          <MetricTile
            label="RECOVERY" icon="moon" accent={ACCENT.recovery}
            value={sleepHours > 0 ? String(sleepHours) : '—'} unit="HOURS"
            goalLabel={`GOAL: ${s.sleepGoalHours}`}
            pct={(sleepHours / s.sleepGoalHours) * 100}
          />
          <MetricTile
            label="METABOLIC" icon="flame" accent={ACCENT.metabolic}
            value={String(kcal)} unit="KCAL"
            goalLabel={`GOAL: ${kcalGoal}`}
            pct={kcalGoal > 0 ? (kcal / kcalGoal) * 100 : 0}
          />
        </View>

        {/* Workout status */}
        <TouchableOpacity
          style={st.workoutCard}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Fitness' as never)}
        >
          <View style={[st.workoutIcon, workout && { borderColor: COLORS.borderBright }]}>
            {workout
              ? <CheckCircleIcon size={18} color={COLORS.textPrimary} />
              : <DumbbellIcon size={18} color={COLORS.textMuted} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.workoutLabel}>WORKOUT STATUS</Text>
            <Text style={st.workoutValue}>
              {workout
                ? `Complete & Recorded · ${workout.durationMinutes} min`
                : 'Not started — tap to train'}
            </Text>
          </View>
          <Text style={st.workoutArrow}>›</Text>
        </TouchableOpacity>

        {/* Finance summary */}
        {financeSummary && (
          <TouchableOpacity
            style={st.workoutCard}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Finance' as never)}
          >
            <View style={st.workoutIcon}>
              <AppIcon id="wallet" size={18} color={financeSummary.onboarded ? COLORS.textPrimary : COLORS.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.workoutLabel}>FINANCE</Text>
              <Text style={st.workoutValue}>
                {financeSummary.onboarded
                  ? `${fmtCurrency(financeSummary.balance, financeSummary.currencyCode)} · ${financeSummary.savingsPct}% saved${financeSummary.billsCount > 0 ? ` · ${financeSummary.billsCount} bill${financeSummary.billsCount === 1 ? '' : 's'} due soon` : ''}`
                  : 'Not set up — tap to get started'}
              </Text>
            </View>
            <Text style={st.workoutArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* Quick log */}
        <View style={st.quickRow}>
          <TouchableOpacity style={st.quickChip} onPress={handleAddWater} activeOpacity={0.7}>
            <AppIcon id="droplet" size={13} color={COLORS.textSecondary} />
            <Text style={st.quickChipText}>+ WATER</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.quickChip} onPress={handleAddSteps} activeOpacity={0.7}>
            <AppIcon id="runner" size={13} color={COLORS.textSecondary} />
            <Text style={st.quickChipText}>+ STEPS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.quickChip, sleepPickerOpen && { borderColor: COLORS.borderBright }]}
            onPress={() => setSleepPickerOpen((v) => !v)}
            activeOpacity={0.7}
          >
            <AppIcon id="moon" size={13} color={COLORS.textSecondary} />
            <Text style={st.quickChipText}>LOG SLEEP</Text>
          </TouchableOpacity>
        </View>

        {/* Sleep hour picker */}
        {sleepPickerOpen && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.sleepRow}>
            {SLEEP_CHOICES.map((h) => (
              <TouchableOpacity
                key={h}
                style={[st.sleepChip, sleepHours === h && st.sleepChipActive]}
                onPress={() => handleLogSleep(h)}
                activeOpacity={0.7}
              >
                <Text style={[st.sleepChipText, sleepHours === h && { color: COLORS.textInverse }]}>
                  {h}H
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* More quick capture — feeds Growth's Mindful Minutes / Zen Master */}
        <Text style={st.sectionLabel}>MORE</Text>
        <QuickCaptureBar actions={MORE_ACTIONS} onAction={handleQuickCapture} />

        {/* Week at a glance */}
        <Text style={st.sectionLabel}>WEEK AT A GLANCE</Text>
        <View style={st.weekPad}><WeekSummary scores={weekScores} /></View>

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingBottom: SPACING.xl },

  ringWrap:  { alignItems: 'center', marginTop: SPACING.xs },
  streakRow: { alignItems: 'center', marginTop: SPACING.md },
  streakPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: RADII.full,
    paddingHorizontal: SPACING.md, paddingVertical: 6,
  },
  streakText: { fontSize: 10, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },

  agendaCard: {
    marginHorizontal: SPACING.screenPad, marginTop: SPACING.lg,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.md, padding: SPACING.md,
  },
  agendaHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  agendaTitle: {
    fontSize: FONT_SIZE.sm, color: COLORS.textPrimary,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1.5,
  },
  aiPill: { borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: RADII.full, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  aiPillText: { fontSize: 7, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },
  agendaEmptyText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, lineHeight: 18, paddingVertical: SPACING.xs },
  agendaLineRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingVertical: 4 },
  agendaLineTime: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5, width: 68 },
  agendaLineDash: { fontSize: 9, color: COLORS.textMuted },
  agendaLineLabel: { flex: 1, fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.bodyMedium ?? undefined },
  agendaNextBlock: {
    marginTop: SPACING.sm, paddingTop: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.borderDim,
  },
  agendaNextLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700', marginBottom: 3 },
  agendaNextText: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.bodyMedium ?? undefined },
  agendaBtnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  agendaBtnPrimary: {
    flex: 1, backgroundColor: COLORS.textPrimary, borderRadius: RADII.full,
    paddingVertical: SPACING.sm + 2, alignItems: 'center',
  },
  agendaBtnPrimaryText: { fontSize: FONT_SIZE.xs, color: COLORS.textInverse, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  agendaBtnSecondary: {
    flex: 1, borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.full,
    paddingVertical: SPACING.sm + 2, alignItems: 'center',
  },
  agendaBtnSecondaryText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    rowGap: SPACING.sm, marginHorizontal: SPACING.screenPad, marginTop: SPACING.md,
  },

  workoutCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginHorizontal: SPACING.screenPad, marginTop: SPACING.md,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.md, padding: SPACING.md,
  },
  workoutIcon: {
    width: 38, height: 38, borderRadius: RADII.sm,
    borderWidth: 1, borderColor: COLORS.borderDim,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surfaceElevated,
  },
  workoutLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },
  workoutValue: { fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.bodyMedium ?? undefined, marginTop: 2 },
  workoutArrow: { fontSize: FONT_SIZE.lg, color: COLORS.textMuted },

  quickRow: {
    flexDirection: 'row', gap: SPACING.sm,
    marginHorizontal: SPACING.screenPad, marginTop: SPACING.md,
  },
  quickChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.full,
    paddingVertical: SPACING.sm, backgroundColor: COLORS.surface,
  },
  quickChipText: { fontSize: 9, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },

  sleepRow: { paddingHorizontal: SPACING.screenPad, gap: SPACING.xs, paddingTop: SPACING.sm },
  sleepChip: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.full,
    paddingHorizontal: SPACING.md, paddingVertical: 6,
  },
  sleepChipActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  sleepChipText:   { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, fontWeight: '700' },

  sectionLabel: {
    fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined,
    letterSpacing: 2.5, fontWeight: '600',
    paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.lg, paddingBottom: SPACING.sm,
  },
  weekPad: { paddingHorizontal: SPACING.screenPad },
});
