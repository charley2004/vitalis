import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, useWindowDimensions,
  TextInput, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg';
import { GlassCard } from '../../components/GlassCard';
import { ScoreRing } from '../../components/ScoreRing';
import { AppIcon } from '../../components/icons';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII, BREAKPOINTS, getScoreColor, getScoreState } from '../../theme';
import {
  getLast7DayKeys, getDayAbbr, KEYS, calcScore, countRoutineHitsAndSkips, getSettings, getRoutineConfig,
  getRoutineStates, getRoutineCompletionTimes, formatDateKey,
} from '../../services/storage';
import { fmtDuration } from '../../services/calendar';
import { askCoach, getCoachHistory, clearCoachHistory, CoachMessage } from '../../services/coach';

interface WeeklyEntry { day: string; score: number }
interface Insight { id: string; category: string; title: string; body: string; severity: 'info' | 'warn' | 'alert'; emoji: string }
interface Breakdown { label: string; value: number; color: string }

function buildInsights(
  avgHydration: number, waterGoal: number,
  avgSteps: number, stepGoal: number,
  streak: number, avgScore: number,
  avgRoutineHits: number, totalRoutines: number,
  avgSleep: number,
): Insight[] {
  const insights: Insight[] = [];
  const avgLitres = (avgHydration * 0.25).toFixed(1);
  const goalLitres = (waterGoal * 0.25).toFixed(1);

  if (avgHydration >= waterGoal * 0.75)
    insights.push({ id: 'hyd', category: 'HYDRATION', title: 'Hydration on target', body: `Averaging ${avgLitres}L over 7 days — within the optimal window. Keep front-loading in the morning.`, severity: 'info', emoji: 'droplet' });
  else if (avgHydration >= waterGoal * 0.4)
    insights.push({ id: 'hyd', category: 'HYDRATION', title: 'Hydration below target', body: `Averaging ${avgLitres}L over 7 days — below your ${goalLitres}L goal. Use Quick Capture to log each glass.`, severity: 'warn', emoji: 'droplet' });
  else
    insights.push({ id: 'hyd', category: 'HYDRATION', title: 'Critical hydration deficit', body: `Averaging only ${avgLitres}L per day. Start tomorrow with 500ml before any caffeine.`, severity: 'alert', emoji: 'droplet' });

  const stepsK = Math.round(avgSteps / 100) / 10;
  if (avgSteps >= stepGoal * 0.8)
    insights.push({ id: 'mov', category: 'MOVEMENT', title: 'Strong daily movement', body: `${stepsK}K avg daily steps. Add a brief evening walk to hit your ${(stepGoal / 1000).toFixed(0)}K goal.`, severity: 'info', emoji: 'runner' });
  else if (avgSteps >= stepGoal * 0.3)
    insights.push({ id: 'mov', category: 'MOVEMENT', title: 'Movement needs boosting', body: `${stepsK}K avg daily steps — below your ${(stepGoal / 1000).toFixed(0)}K goal. A 20-minute walk adds ~2,000 steps.`, severity: 'warn', emoji: 'runner' });
  else
    insights.push({ id: 'mov', category: 'MOVEMENT', title: 'Low movement detected', body: `Only ${stepsK}K steps on average. Try a movement alarm at 10:00 and 15:00.`, severity: 'alert', emoji: 'runner' });

  if (streak >= 7)
    insights.push({ id: 'str', category: 'CONSISTENCY', title: `${streak}-day streak — exceptional`, body: 'You have shown up every day this week. Protect this streak by completing at least one routine before noon.', severity: 'info', emoji: 'flame' });
  else if (streak >= 3)
    insights.push({ id: 'str', category: 'CONSISTENCY', title: `${streak}-day streak running`, body: 'Solid momentum. Push through to 7 days.', severity: 'info', emoji: 'flame' });
  else
    insights.push({ id: 'str', category: 'CONSISTENCY', title: 'Build your streak', body: 'Complete at least one routine per day to start a streak.', severity: 'warn', emoji: 'flame' });

  if (totalRoutines > 0) {
    const hitPct = Math.round((avgRoutineHits / totalRoutines) * 100);
    if (hitPct >= 70)
      insights.push({ id: 'rtn', category: 'ROUTINES', title: 'Routine adherence solid', body: `Hitting ${hitPct}% of routines on average. Identify the one you miss most and anchor it to an existing habit.`, severity: 'info', emoji: 'bolt' });
    else if (hitPct >= 30)
      insights.push({ id: 'rtn', category: 'ROUTINES', title: 'Routine completion needs work', body: `Only ${hitPct}% adherence. Focus on your top 3 must-hit routines tomorrow.`, severity: 'warn', emoji: 'bolt' });
    else
      insights.push({ id: 'rtn', category: 'ROUTINES', title: 'Routines largely unmeasured', body: 'Start by marking Morning Anchors each day — even logging misses builds awareness.', severity: 'alert', emoji: 'bolt' });
  }

  if (avgSleep > 0) {
    if (avgSleep >= 7.5)
      insights.push({ id: 'slp', category: 'SLEEP', title: 'Sleep quality optimal', body: `Averaging ${avgSleep.toFixed(1)}h over logged nights — within the restorative range.`, severity: 'info', emoji: 'moon' });
    else if (avgSleep >= 6.0)
      insights.push({ id: 'slp', category: 'SLEEP', title: 'Sleep below optimal', body: `Averaging ${avgSleep.toFixed(1)}h. Aim for 7.5h — even 30 extra minutes improves recovery significantly.`, severity: 'warn', emoji: 'moon' });
    else
      insights.push({ id: 'slp', category: 'SLEEP', title: 'Critical sleep deficit', body: `Averaging only ${avgSleep.toFixed(1)}h. Prioritise sleep before optimising any other metric.`, severity: 'alert', emoji: 'moon' });
  }

  return insights;
}

/**
 * Reads how far off each completed routine's real check-off time landed from
 * its planned preferredTime — the coach only knew whether a routine happened
 * before this; now it knows when, so it can flag the day actually slipping.
 */
function buildTimingInsight(
  timedCount: number,
  lateItems: { label: string; lateBy: number }[],
  totalLostMinutes: number,
): Insight | null {
  if (timedCount === 0) return null;

  if (lateItems.length === 0) {
    return {
      id: 'tim', category: 'TIMING', title: 'Running on schedule',
      body: 'Every routine checked off today landed close to its planned time.',
      severity: 'info', emoji: 'bell',
    };
  }

  const worst = lateItems.reduce((a, b) => (b.lateBy > a.lateBy ? b : a));
  const severity: 'warn' | 'alert' = totalLostMinutes < 60 ? 'warn' : 'alert';
  return {
    id: 'tim', category: 'TIMING', title: `${fmtDuration(totalLostMinutes)} behind schedule today`,
    body: severity === 'warn'
      ? `${worst.label} happened ${fmtDuration(worst.lateBy)} later than planned. Small slips like this push everything else back — try anchoring it to something that already happens on time.`
      : `${worst.label} alone slipped ${fmtDuration(worst.lateBy)} from its planned time. That's enough drift to reshape the rest of the day — worth resetting its planned time if this keeps happening.`,
    severity, emoji: 'bell',
  };
}

// ─── Weekly chart ─────────────────────────────────────────────────────────────

const CHART_H = 100;
const BAR_GAP = 6;

function WeeklyChart({ width: containerW, scores }: { width: number; scores: WeeklyEntry[] }) {
  const W = containerW > 0 ? containerW - SPACING.md * 2 : 280;
  const barW = (W - BAR_GAP * 6) / 7;
  const avg = scores.length ? Math.round(scores.reduce((s, d) => s + d.score, 0) / scores.length) : 0;

  return (
    <View style={{ overflow: 'hidden' }}>
      <Svg width={W} height={CHART_H + 28} viewBox={`0 0 ${W} ${CHART_H + 28}`}>
        {scores.map((d, i) => {
          const barH = Math.round((d.score / 100) * CHART_H);
          const x = i * (barW + BAR_GAP);
          const y = CHART_H - barH;
          const color = getScoreColor(d.score);
          const isToday = i === scores.length - 1;
          return (
            <React.Fragment key={`${d.day}-${i}`}>
              <Rect x={x} y={0} width={barW} height={CHART_H} rx={3} fill="rgba(255,255,255,0.03)" />
              <Rect x={x} y={y} width={barW} height={barH} rx={3} fill={isToday ? `${color}CC` : `${color}55`} />
              {d.score > 0 && (
                <SvgText x={x + barW / 2} y={y - 4} textAnchor="middle" fill={COLORS.textMuted} fontSize={8} fontFamily={FONTS.mono ?? undefined}>{d.score}</SvgText>
              )}
              <SvgText x={x + barW / 2} y={CHART_H + 16} textAnchor="middle" fill={isToday ? COLORS.textPrimary : COLORS.textMuted} fontSize={9} fontFamily={FONTS.mono ?? undefined}>{d.day}</SvgText>
            </React.Fragment>
          );
        })}
        {avg > 0 && (() => {
          const avgY = CHART_H - (avg / 100) * CHART_H;
          return (
            <>
              <Line x1={0} y1={avgY} x2={W} y2={avgY} stroke={`${COLORS.textMuted}50`} strokeWidth={1} strokeDasharray="4 4" />
              <SvgText x={W - 2} y={avgY - 4} textAnchor="end" fill={COLORS.textMuted} fontSize={8} fontFamily={FONTS.mono ?? undefined}>AVG {avg}</SvgText>
            </>
          );
        })()}
      </Svg>
    </View>
  );
}

// ─── Verdict card ─────────────────────────────────────────────────────────────

function VerdictCard({ score, breakdown }: { score: number; breakdown: Breakdown[] }) {
  const state = getScoreState(score);
  const color = getScoreColor(score);
  const verdict =
    state === 'optimal' ? { title: 'SYSTEM OPTIMAL',  sub: 'All primary vitals within target range.', iconId: 'check-circle' } :
    state === 'warning' ? { title: 'ATTENTION NEEDED', sub: 'One or more metrics below threshold.', iconId: 'warning' } :
                          { title: 'CRITICAL STATE',   sub: 'Multiple systems require immediate correction.', iconId: 'alert-circle' };

  return (
    <GlassCard>
      <View style={verdictStyles.topRow}>
        <AppIcon id={verdict.iconId} size={26} color={color} />
        <View style={verdictStyles.verdictText}>
          <Text style={[verdictStyles.title, { color }]}>{verdict.title}</Text>
          <Text style={verdictStyles.sub}>{verdict.sub}</Text>
        </View>
        <View style={[verdictStyles.stateBadge, { borderColor: color }]}>
          <Text style={[verdictStyles.stateBadgeText, { color }]}>{state.toUpperCase()}</Text>
        </View>
      </View>
      <View style={verdictStyles.breakdown}>
        {breakdown.map((item) => (
          <View key={item.label} style={verdictStyles.breakdownItem}>
            <Text style={[verdictStyles.breakdownVal, { color: item.color }]}>{item.value}</Text>
            <Text style={verdictStyles.breakdownLabel}>{item.label}</Text>
            <View style={verdictStyles.miniBarTrack}>
              <View style={[verdictStyles.miniBarFill, { width: `${item.value}%` as any, backgroundColor: item.color }]} />
            </View>
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

const verdictStyles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg },
  verdictText: { flex: 1, gap: 2 },
  title: { fontSize: FONT_SIZE.lg, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1 },
  sub: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.body ?? undefined },
  stateBadge: { borderWidth: 1, borderRadius: RADII.sm, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  stateBadgeText: { fontSize: FONT_SIZE.xxs, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1.5 },
  breakdown: { flexDirection: 'row', gap: SPACING.sm },
  breakdownItem: { flex: 1, alignItems: 'center', gap: SPACING.xxs },
  breakdownVal: { fontSize: FONT_SIZE.xl, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  breakdownLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },
  miniBarTrack: { width: '100%', height: 2, backgroundColor: COLORS.borderNeon, borderRadius: RADII.full, overflow: 'hidden' },
  miniBarFill: { height: '100%', borderRadius: RADII.full },
});

// ─── Insight card ─────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: Insight }) {
  const color = insight.severity === 'info' ? COLORS.textSecondary : insight.severity === 'warn' ? COLORS.amber : COLORS.red;
  return (
    <View style={insightStyles.card}>
      <View style={[insightStyles.severityBar, { backgroundColor: color }]} />
      <View style={insightStyles.content}>
        <View style={insightStyles.catRow}>
          <AppIcon id={insight.emoji} size={14} color={color} />
          <Text style={[insightStyles.category, { color }]}>{insight.category}</Text>
        </View>
        <Text style={insightStyles.title}>{insight.title}</Text>
        <Text style={insightStyles.body}>{insight.body}</Text>
      </View>
    </View>
  );
}

const insightStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.surfaceSolid,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderDim,
    overflow: 'hidden',
  },
  severityBar: { width: 2, margin: SPACING.xs, borderRadius: 1, opacity: 0.8 },
  content: { flex: 1, padding: SPACING.md, gap: SPACING.xs },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  category: { fontSize: FONT_SIZE.xxs, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700' },
  title: { fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.bodySemi ?? undefined, fontWeight: '600' },
  body: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.body ?? undefined, lineHeight: FONT_SIZE.sm * 1.5 },
});

// ─── Ask your coach ───────────────────────────────────────────────────────────
// Self-contained: the rule-based insights above are instant and free; this is
// the LLM layer on top, for open questions those fixed templates can't answer.

const SUGGESTED_QUESTIONS = [
  'Why am I behind today?',
  "How's my week trending?",
  'What should I focus on tomorrow?',
];

function AskCoachCard() {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getCoachHistory().then((h) => { if (active) setMessages(h); });
      return () => { active = false; };
    }, [])
  );

  const handleAsk = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setQuestion('');
    setError(null);
    setLoading(true);
    // Optimistic: show the question immediately, replaced by the canonical
    // persisted pair (with the real reply) once the request resolves.
    setMessages((prev) => [...prev, { id: `pending-${Date.now()}`, role: 'user', content: trimmed, createdAt: new Date().toISOString() }]);

    const result = await askCoach(trimmed);
    setLoading(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    getCoachHistory().then(setMessages);
  }, [loading]);

  const handleClear = useCallback(() => {
    clearCoachHistory();
    setMessages([]);
    setError(null);
  }, []);

  return (
    <>
      <View style={askStyles.headerRow}>
        <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>ASK YOUR COACH</Text>
        {messages.length > 0 && (
          <TouchableOpacity onPress={handleClear} accessibilityRole="button" accessibilityLabel="Clear conversation">
            <Text style={askStyles.clearText}>CLEAR</Text>
          </TouchableOpacity>
        )}
      </View>
      <GlassCard>
        <View style={askStyles.inputRow}>
          <TextInput
            style={askStyles.input}
            value={question}
            onChangeText={setQuestion}
            placeholder="Ask about your data…"
            placeholderTextColor={COLORS.textMuted}
            onSubmitEditing={() => handleAsk(question)}
            returnKeyType="send"
            accessibilityLabel="Ask your coach"
          />
          <TouchableOpacity
            onPress={() => handleAsk(question)}
            style={askStyles.sendBtn}
            activeOpacity={0.7}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            {loading ? <ActivityIndicator size="small" color={COLORS.textInverse} /> : <Text style={askStyles.sendBtnText}>ASK</Text>}
          </TouchableOpacity>
        </View>
        <View style={askStyles.chipsRow}>
          {SUGGESTED_QUESTIONS.map((q) => (
            <TouchableOpacity
              key={q}
              onPress={() => handleAsk(q)}
              style={askStyles.chip}
              activeOpacity={0.7}
              disabled={loading}
            >
              <Text style={askStyles.chipText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {error && <Text style={askStyles.errorText}>{error}</Text>}
      </GlassCard>
      {/* Newest first, right below the input — oldest turns scroll further down */}
      {[...messages].reverse().map((m) => (
        <View key={m.id} style={[askStyles.bubble, m.role === 'user' && askStyles.bubbleYou]}>
          <Text style={askStyles.bubbleFrom}>{m.role === 'user' ? 'YOU' : 'COACH'}</Text>
          <Text style={askStyles.bubbleText}>{m.content}</Text>
        </View>
      ))}
    </>
  );
}

const askStyles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  clearText: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },
  bubble: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.md,
    padding: SPACING.sm, marginTop: SPACING.xs, backgroundColor: COLORS.surface,
  },
  bubbleYou: { backgroundColor: COLORS.surfaceElevated, borderColor: COLORS.borderNeon },
  bubbleFrom: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700', marginBottom: 2 },
  bubbleText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.body ?? undefined, lineHeight: 17 },
  inputRow: { flexDirection: 'row', gap: SPACING.sm },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.borderDim,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.textPrimary,
    fontFamily: FONTS.body ?? undefined,
    fontSize: FONT_SIZE.sm,
  },
  sendBtn: {
    backgroundColor: COLORS.textPrimary,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
  },
  sendBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.textInverse, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: SPACING.sm },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.borderDim,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
  },
  chipText: { fontSize: FONT_SIZE.xxs, color: COLORS.textSecondary, fontFamily: FONTS.body ?? undefined },
  errorText: { fontSize: FONT_SIZE.sm, color: COLORS.red, fontFamily: FONTS.body ?? undefined, marginTop: SPACING.md },
});

// ─── CoachSection ─────────────────────────────────────────────────────────────

export function CoachSection() {
  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINTS.tablet;
  const chartW = isWide ? Math.floor(width / 2) - SPACING.xxl * 2 : width - SPACING.md * 2;

  const [overallScore, setOverallScore]   = useState(0);
  const [weeklyScores, setWeeklyScores]   = useState<WeeklyEntry[]>([]);
  const [breakdown, setBreakdown]         = useState<Breakdown[]>([]);
  const [insights, setInsights]           = useState<Insight[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        try {
          const [settings, routineConfig] = await Promise.all([getSettings(), getRoutineConfig()]);
          const totalRoutines = routineConfig.filter((r) => r.enabled !== false).length;

          const dayKeys = getLast7DayKeys();
          const dailyData = await Promise.all(dayKeys.map(async (dk) => {
            const [routRaw, waterRaw, stepsRaw, sleepRaw] = await Promise.all([
              AsyncStorage.getItem(KEYS.routines(dk)),
              AsyncStorage.getItem(KEYS.water(dk)),
              AsyncStorage.getItem(KEYS.steps(dk)),
              AsyncStorage.getItem(KEYS.sleep(dk)),
            ]);
            const routineStates: Record<string, string> = routRaw ? JSON.parse(routRaw) : {};
            const water = waterRaw ? parseInt(waterRaw, 10) : 0;
            const steps = stepsRaw ? parseInt(stepsRaw, 10) : 0;
            const sleep = sleepRaw ? parseFloat(sleepRaw) : 0;
            const { hits, skipped } = countRoutineHitsAndSkips(routineStates);
            const score = calcScore(hits, totalRoutines - skipped, water, settings.waterGoal, steps, settings.stepGoal, sleep, settings.sleepGoalHours);
            return { dateKey: dk, score, water, steps, sleep, hits };
          }));

          if (!active) return;

          const weekly: WeeklyEntry[] = dailyData.map((d) => ({ day: getDayAbbr(d.dateKey), score: d.score }));
          const todayData = dailyData[dailyData.length - 1];
          const avgWater = dailyData.reduce((s, d) => s + d.water, 0) / 7;
          const avgSteps = dailyData.reduce((s, d) => s + d.steps, 0) / 7;
          const avgHits  = dailyData.reduce((s, d) => s + d.hits, 0)  / 7;
          const avgScore = dailyData.reduce((s, d) => s + d.score, 0) / 7;
          const sleepDays = dailyData.filter((d) => d.sleep > 0);
          const avgSleep = sleepDays.length ? sleepDays.reduce((s, d) => s + d.sleep, 0) / sleepDays.length : 0;

          const streakRaw = await AsyncStorage.getItem(KEYS.streak);
          const streakVal = streakRaw ? parseInt(streakRaw, 10) : 0;

          const todayHits = todayData.hits;
          const bd: Breakdown[] = [
            { label: 'ROUTINES',  value: totalRoutines > 0 ? Math.min(Math.round((todayHits / totalRoutines) * 100), 100) : 0, color: COLORS.textSecondary },
            { label: 'HYDRATION', value: Math.min(Math.round((todayData.water / settings.waterGoal) * 100), 100),               color: COLORS.textSecondary },
            { label: 'MOVEMENT',  value: Math.min(Math.round((todayData.steps / settings.stepGoal) * 100), 100),                 color: COLORS.textSecondary },
            { label: 'STREAK',    value: Math.min(Math.round((streakVal / 30) * 100), 100),                                      color: COLORS.amber },
          ];

          const todayKey = dayKeys[dayKeys.length - 1];
          const [todayStates, todayTimes] = await Promise.all([
            getRoutineStates(todayKey),
            getRoutineCompletionTimes(todayKey),
          ]);
          const timedToday = routineConfig
            .filter((r) => r.enabled !== false && r.preferredTime !== undefined)
            .map((r) => {
              if (todayStates[r.id] !== 'hit') return null;
              const iso = todayTimes[r.id];
              if (!iso) return null;
              const completedDate = new Date(iso);
              if (formatDateKey(completedDate) !== todayKey) return null;
              const completedAtMinutes = completedDate.getHours() * 60 + completedDate.getMinutes();
              return { label: r.label, lateBy: completedAtMinutes - r.preferredTime! };
            })
            .filter((x): x is { label: string; lateBy: number } => x !== null);
          const lateToday = timedToday.filter((x) => x.lateBy > 15);
          const totalLostMinutes = lateToday.reduce((s, x) => s + x.lateBy, 0);
          const timingInsight = buildTimingInsight(timedToday.length, lateToday, totalLostMinutes);

          setOverallScore(todayData.score);
          setWeeklyScores(weekly);
          setBreakdown(bd);
          const baseInsights = buildInsights(avgWater, settings.waterGoal, avgSteps, settings.stepGoal, streakVal, avgScore, avgHits, totalRoutines, avgSleep);
          setInsights(timingInsight ? [...baseInsights, timingInsight] : baseInsights);
        } catch (_) {}
      };
      load();
      return () => { active = false; };
    }, [])
  );

  return (
    <ScrollView contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]} showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}>
        <Text style={styles.topRowLabel}>AI INSIGHTS & VERDICT ENGINE</Text>
        <ScoreRing score={overallScore} size={44} strokeWidth={4} label="" />
      </View>

      <AskCoachCard />
      {isWide ? (
        <View style={styles.desktopGrid}>
          <View style={styles.leftCol}>
            <Text style={styles.sectionLabel}>DAILY SYSTEM VERDICT</Text>
            <VerdictCard score={overallScore} breakdown={breakdown} />
            <Text style={[styles.sectionLabel, { marginTop: SPACING.md }]}>WEEKLY SCORE HISTORY</Text>
            <GlassCard><WeeklyChart width={chartW} scores={weeklyScores} /></GlassCard>
          </View>
          <View style={styles.rightCol}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>ACTIVE INSIGHTS</Text>
              <Text style={styles.insightCount}>{insights.length} FINDINGS</Text>
            </View>
            {insights.map((i) => <InsightCard key={i.id} insight={i} />)}
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.sectionLabel}>DAILY SYSTEM VERDICT</Text>
          <VerdictCard score={overallScore} breakdown={breakdown} />
          <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>WEEKLY SCORE HISTORY</Text>
          <GlassCard><WeeklyChart width={chartW} scores={weeklyScores} /></GlassCard>
          <View style={[styles.sectionRow, { marginTop: SPACING.lg }]}>
            <Text style={styles.sectionLabel}>ACTIVE INSIGHTS</Text>
            <Text style={styles.insightCount}>{insights.length} FINDINGS</Text>
          </View>
          {insights.map((i) => <InsightCard key={i.id} insight={i} />)}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: SPACING.screenPad, paddingBottom: SPACING.xxl, gap: SPACING.md },
  scrollWide: { paddingHorizontal: SPACING.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xs },
  topRowLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700', flex: 1 },
  desktopGrid: { flexDirection: 'row', gap: SPACING.xl },
  leftCol: { flex: 1, gap: SPACING.md },
  rightCol: { flex: 1, gap: SPACING.md },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  sectionLabel: {
    fontSize: FONT_SIZE.xxs,
    color: COLORS.textMuted,
    fontFamily: FONTS.mono ?? undefined,
    letterSpacing: 2.5,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  insightCount: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },
});
