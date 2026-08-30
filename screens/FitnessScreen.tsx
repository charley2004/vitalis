import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle } from 'react-native-svg';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../theme';
import { BoltIcon, CheckCircleIcon } from '../components/icons';
import { WorkoutModal, type CompletedSession } from './WorkoutModal';
import { KEYS, saveWorkoutSession, getWorkoutSession, getSettings, DEFAULT_SETTINGS, type WorkoutSession } from '../services/storage';

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getLast7DayKeys(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

function fmtSessionDate(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

const CATEGORY_LABEL: Record<CompletedSession['category'], string> = {
  upper: 'STRENGTH',
  lower: 'STRENGTH',
  cardio: 'CARDIO',
  full: 'FULL BODY',
};

const WEEKS_PER_YEAR = 52;

// ─── Weekly training ring ─────────────────────────────────────────────────────

function WeeklyRing({ done, target }: { done: number; target: number }) {
  const size = 76;
  const strokeWidth = 7;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = target > 0 ? Math.min(done / target, 1) : 0;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
      <Circle
        cx={cx} cy={cy} r={radius} fill="none" stroke={COLORS.textPrimary} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)}
        strokeLinecap="round" transform={`rotate(-90, ${cx}, ${cy})`}
      />
    </Svg>
  );
}

// ─── FitnessScreen ────────────────────────────────────────────────────────────

interface HistoryEntry {
  session: WorkoutSession;
}

export function FitnessScreen() {
  const navigation = useNavigation();
  const dateKey = getTodayKey();

  const [weekActive, setWeekActive]       = useState(0);
  const [yearlyDays, setYearlyDays]       = useState(0);
  const [lastSession, setLastSession]     = useState<{ session: WorkoutSession; dateKey: string } | null>(null);
  const [history, setHistory]             = useState<HistoryEntry[]>([]);
  const [showModal, setShowModal]         = useState(false);
  const [annualTarget, setAnnualTarget]   = useState(DEFAULT_SETTINGS.trainingDaysPerWeek * WEEKS_PER_YEAR);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        try {
          const settings = await getSettings();
          if (active) setAnnualTarget(settings.trainingDaysPerWeek * WEEKS_PER_YEAR);

          const dayKeys = getLast7DayKeys();
          const pastWorkout = await Promise.all(dayKeys.map((dk) => AsyncStorage.getItem(`@vitalis/workout_${dk}`)));
          if (!active) return;
          setWeekActive(pastWorkout.filter((v) => v && v !== 'rest').length);

          const year = new Date().getFullYear().toString();
          const allKeys = await AsyncStorage.getAllKeys();
          const workoutKeys = allKeys.filter((k) => k.startsWith(`@vitalis/workout_${year}`));
          if (workoutKeys.length > 0) {
            const pairs = await AsyncStorage.multiGet(workoutKeys);
            if (active) setYearlyDays(pairs.filter(([, v]) => v && v !== 'rest').length);
          } else if (active) {
            setYearlyDays(0);
          }

          // Session history — scan @vitalis/workout_session_* keys
          const sessionKeys = allKeys.filter((k) => k.startsWith('@vitalis/workout_session_'));
          const sessionPairs = await AsyncStorage.multiGet(sessionKeys);
          const sessions: WorkoutSession[] = sessionPairs
            .map(([, v]) => { try { return v ? (JSON.parse(v) as WorkoutSession) : null; } catch { return null; } })
            .filter((s): s is WorkoutSession => s !== null)
            .sort((a, b) => (a.date < b.date ? 1 : -1));

          if (!active) return;
          setHistory(sessions.slice(0, 6).map((session) => ({ session })));
          const today = sessions.find((s) => s.date === dateKey);
          setLastSession(today ? { session: today, dateKey: today.date } : (sessions[0] ? { session: sessions[0], dateKey: sessions[0].date } : null));
        } catch (_) {}
      };
      load();
      return () => { active = false; };
    }, [dateKey])
  );

  const handleSessionComplete = useCallback(async (completed: CompletedSession) => {
    const session: WorkoutSession = { date: dateKey, ...completed };
    await Promise.all([
      saveWorkoutSession(session),
      AsyncStorage.setItem(KEYS.workout(dateKey), completed.category).catch(() => {}),
    ]);
    setShowModal(false);
    setLastSession({ session, dateKey });
    setHistory((prev) => [{ session }, ...prev.filter((h) => h.session.date !== dateKey)].slice(0, 6));
    setWeekActive((prev) => Math.min(7, prev + (history.some((h) => h.session.date === dateKey) ? 0 : 1)));
  }, [dateKey, history]);

  const weeklyTarget = Math.round(annualTarget / WEEKS_PER_YEAR);
  const remaining = Math.max(0, weeklyTarget - weekActive);
  const consistencyPct = Math.round((weekActive / 7) * 100);

  // Honest estimate: ~7 kcal/min of training is a reasonable general-purpose
  // resistance/cardio estimate — not exercise-specific, clearly presented as an estimate.
  const energyKcal = lastSession ? Math.round(lastSession.session.durationMinutes * 7) : 0;
  const completedCount = lastSession?.session.completedIds.length ?? 0;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <WorkoutModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onComplete={handleSessionComplete}
        weekActiveDays={weekActive}
        annualTarget={annualTarget}
      />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.logoBox}>
            <BoltIcon size={16} color={COLORS.textPrimary} />
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Settings' as never)} activeOpacity={0.7}>
            <Text style={s.profileLink}>Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Weekly training card */}
        <View style={s.trainingCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.trainingLabel}>WEEKLY TRAINING</Text>
            <View style={s.trainingValueRow}>
              <Text style={s.trainingValue}>{weekActive}</Text>
              <Text style={s.trainingValueUnit}> / {weeklyTarget}</Text>
            </View>
            <Text style={s.trainingSub}>
              {remaining > 0
                ? `${remaining} session${remaining !== 1 ? 's' : ''} until weekly goal met`
                : 'Weekly goal met — great work'}
            </Text>
          </View>
          <WeeklyRing done={weekActive} target={weeklyTarget} />
        </View>

        {/* Yearly + consistency stats */}
        <View style={s.statsRow}>
          <View style={s.statCol}>
            <Text style={s.statLabel}>YEARLY ORBIT</Text>
            <Text style={s.statValue}>{yearlyDays}<Text style={s.statValueDim}>/{annualTarget}</Text></Text>
          </View>
          <View style={s.statColRight}>
            <Text style={s.statLabel}>CONSISTENCY</Text>
            <Text style={s.statValue}>{consistencyPct}%</Text>
          </View>
        </View>

        {/* Start workout */}
        <TouchableOpacity onPress={() => setShowModal(true)} style={s.startBtn} activeOpacity={0.85}>
          <Text style={s.startBtnText}>
            {lastSession?.dateKey === dateKey ? '+ LOG ANOTHER SESSION' : 'START WORKOUT'}
          </Text>
        </TouchableOpacity>

        {/* Performance insight */}
        <Text style={s.sectionLabel}>PERFORMANCE INSIGHT</Text>
        {lastSession ? (
          <View style={s.insightCard}>
            <View style={s.insightTopRow}>
              <Text style={s.insightDate}>
                LAST SESSION: {lastSession.dateKey === dateKey ? 'TODAY' : fmtSessionDate(lastSession.dateKey).toUpperCase()}
              </Text>
              <View style={s.categoryPill}>
                <Text style={s.categoryPillText}>{CATEGORY_LABEL[lastSession.session.category]}</Text>
              </View>
            </View>
            <View style={s.insightStatsRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.insightStatLabel}>⏱ DURATION</Text>
                <View style={s.insightStatValueRow}>
                  <Text style={s.insightStatValue}>{lastSession.session.durationMinutes}</Text>
                  <Text style={s.insightStatUnit}>MIN</Text>
                </View>
              </View>
              <View style={s.insightDivider} />
              <View style={{ flex: 1 }}>
                <Text style={s.insightStatLabel}>◆ ENERGY (EST.)</Text>
                <View style={s.insightStatValueRow}>
                  <Text style={s.insightStatValue}>{energyKcal}</Text>
                  <Text style={s.insightStatUnit}>KCAL</Text>
                </View>
              </View>
            </View>
            <View style={s.insightFooterRow}>
              <Text style={s.insightFooterText}>{completedCount} EXERCISES COMPLETED</Text>
              <CheckCircleIcon size={16} color={COLORS.textSecondary} />
            </View>
          </View>
        ) : (
          <View style={s.insightEmpty}>
            <Text style={s.insightEmptyText}>No sessions logged yet — start your first workout above</Text>
          </View>
        )}

        {/* Activity history */}
        <View style={s.historyHeaderRow}>
          <Text style={s.sectionLabel}>ACTIVITY HISTORY</Text>
        </View>
        {history.length === 0 ? (
          <Text style={s.historyEmpty}>Your completed sessions will appear here.</Text>
        ) : (
          history.map(({ session }, i) => {
            const pct = session.exerciseIds.length > 0
              ? Math.round((session.completedIds.length / session.exerciseIds.length) * 100)
              : 0;
            return (
              <View key={`${session.date}-${i}`} style={s.historyRow}>
                <View style={s.historyIcon}>
                  <BoltIcon size={14} color={COLORS.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.historyTitle}>
                    {CATEGORY_LABEL[session.category]} SESSION
                  </Text>
                  <Text style={s.historySub}>{fmtSessionDate(session.date)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.historyStat}>{session.durationMinutes} MIN</Text>
                  <Text style={s.historySubRight}>{pct}% DONE</Text>
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 96 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        onPress={() => setShowModal(true)}
        style={s.fab}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add workout"
      >
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.sm },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  logoBox: {
    width: 34, height: 34, borderRadius: RADII.sm,
    borderWidth: 1, borderColor: COLORS.borderBright,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  profileLink: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.body ?? undefined },

  trainingCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.lg, padding: SPACING.md, marginBottom: SPACING.md,
  },
  trainingLabel: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700' },
  trainingValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: SPACING.xs },
  trainingValue: { fontSize: FONT_SIZE.display, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: -1 },
  trainingValueUnit: { fontSize: FONT_SIZE.lg, color: COLORS.textMuted, fontFamily: FONTS.heading ?? undefined },
  trainingSub: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, marginTop: 4, maxWidth: 200 },

  statsRow: { flexDirection: 'row', marginBottom: SPACING.md },
  statCol:      { flex: 1 },
  statColRight: { flex: 1, alignItems: 'flex-end' },
  statLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginBottom: 4 },
  statValue: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  statValueDim: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontWeight: '400' },

  startBtn: {
    backgroundColor: COLORS.textPrimary, borderRadius: RADII.md,
    paddingVertical: SPACING.md, alignItems: 'center', marginBottom: SPACING.lg,
  },
  startBtnText: {
    fontSize: FONT_SIZE.sm, color: COLORS.textInverse,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1,
  },

  sectionLabel: {
    fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined,
    letterSpacing: 2.5, fontWeight: '700', marginBottom: SPACING.sm,
  },

  insightCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.lg, padding: SPACING.md, marginBottom: SPACING.lg,
  },
  insightTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  insightDate: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },
  categoryPill: {
    borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  categoryPillText: { fontSize: 8, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },
  insightStatsRow: {
    flexDirection: 'row', paddingTop: SPACING.sm, paddingBottom: SPACING.md,
    borderTopWidth: 1, borderTopColor: COLORS.borderDim,
  },
  insightStatLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginBottom: 4 },
  insightStatValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  insightStatValue: { fontSize: FONT_SIZE.xxl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  insightStatUnit: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined },
  insightDivider: { width: 1, backgroundColor: COLORS.borderDim, marginHorizontal: SPACING.md },
  insightFooterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.borderDim,
  },
  insightFooterText: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },

  insightEmpty: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderStyle: 'dashed', borderRadius: RADII.md,
    padding: SPACING.lg, alignItems: 'center', marginBottom: SPACING.lg,
  },
  insightEmptyText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, textAlign: 'center' },

  historyHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyEmpty: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, paddingVertical: SPACING.sm },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.md, padding: SPACING.sm + 2, marginBottom: SPACING.xs,
  },
  historyIcon: {
    width: 36, height: 36, borderRadius: RADII.sm,
    borderWidth: 1, borderColor: COLORS.borderDim, backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  historyTitle: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 0.3 },
  historySub: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, marginTop: 2 },
  historyStat: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  historySubRight: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, marginTop: 2 },

  fab: {
    position: 'absolute', bottom: SPACING.md, right: SPACING.screenPad,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: COLORS.textPrimary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 6,
  },
  fabText: { fontSize: 26, color: COLORS.textInverse, fontWeight: '400', lineHeight: 30 },
});
