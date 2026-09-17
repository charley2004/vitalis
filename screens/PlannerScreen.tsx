import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
  KeyboardAvoidingView, Platform, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CalendarEvent, Occurrence, OccurrenceStatus,
  getEvents, upsertEvent, setOccurrenceStatus,
  addDaysKey, weekdayOf, eventCountsInRange, busyMinutesOn,
  fmtTime, fmtDuration, fmtDateHuman, parseDateKey,
} from '../services/calendar';
import {
  loadDay, DayPlan, Suggestion, Agenda, bestSlotFor,
  getProductivityStats, ProductivityStats, UnifiedAgenda, AgendaItem,
} from '../services/planner';
import { askAssistant } from '../services/assistant';
import { syncReminders } from '../services/reminders';
import * as Haptics from 'expo-haptics';
import { formatDateKey, getTodayKey, KEYS, setRoutineHit, setRoutineSkipped } from '../services/storage';
import { EventModal } from './EventModal';
import { MoveOccurrenceSheet } from '../components/MoveOccurrenceSheet';
import { BoltIcon } from '../components/icons';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../theme';

type ViewMode = 'month' | 'week' | 'day';

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

interface ChatEntry {
  from: 'you' | 'planner';
  text: string;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
}

// ─── Segmented control ────────────────────────────────────────────────────────

function Segmented({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <View style={sg.wrap}>
      {(['month', 'week', 'day'] as ViewMode[]).map((m) => (
        <TouchableOpacity
          key={m}
          style={[sg.seg, mode === m && sg.segActive]}
          onPress={() => onChange(m)}
          activeOpacity={0.8}
        >
          <Text style={[sg.segText, mode === m && sg.segTextActive]}>{m.toUpperCase()}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const sg = StyleSheet.create({
  wrap: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.full, padding: 3, marginBottom: SPACING.md,
  },
  seg:       { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: RADII.full },
  segActive: { backgroundColor: COLORS.textPrimary },
  segText:   { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700' },
  segTextActive: { color: COLORS.textInverse },
});

// ─── Smart plan card ──────────────────────────────────────────────────────────

function SmartPlanCard({ narrative, actionable, onApply }: {
  narrative: string;
  actionable: Suggestion | null;
  onApply: (s: Suggestion) => void;
}) {
  return (
    <View style={sp.card}>
      <View style={sp.headRow}>
        <View style={sp.pill}><Text style={sp.pillText}>AI AGENDA</Text></View>
        <Text style={sp.headLabel}>WHY THIS SCHEDULE WORKS</Text>
        <View style={{ flex: 1 }} />
        <BoltIcon size={14} color={COLORS.textPrimary} />
      </View>
      <Text style={sp.body}>{narrative}</Text>
      {actionable?.apply && (
        <>
          <View style={sp.actionableDivider} />
          <Text style={sp.actionableLabel}>SUGGESTED NEXT STEP</Text>
          <Text style={sp.actionableText}>{actionable.text}</Text>
          <TouchableOpacity style={sp.applyBtn} onPress={() => onApply(actionable)} activeOpacity={0.8}>
            <Text style={sp.applyText}>APPLY SUGGESTION  →</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const sp = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1, borderColor: COLORS.borderBright,
    borderRadius: RADII.lg, padding: SPACING.md, marginBottom: SPACING.md,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  pill: {
    backgroundColor: COLORS.textPrimary, borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  pillText:  { fontSize: 8, color: COLORS.textInverse, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },
  headLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },
  body: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, lineHeight: 20 },
  actionableDivider: { height: 1, backgroundColor: COLORS.borderDim, marginVertical: SPACING.sm },
  actionableLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700', marginBottom: 3 },
  actionableText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, lineHeight: 17 },
  applyBtn: {
    backgroundColor: COLORS.textPrimary, borderRadius: RADII.full,
    paddingVertical: SPACING.sm + 2, alignItems: 'center', marginTop: SPACING.md,
  },
  applyText: { fontSize: FONT_SIZE.xs, color: COLORS.textInverse, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1.5 },
});

// ─── PlannerScreen ────────────────────────────────────────────────────────────

export function PlannerScreen() {
  const isFocused = useIsFocused();
  const today = getTodayKey();

  const [viewMode, setViewMode]         = useState<ViewMode>('day');
  const [selectedDate, setSelectedDate] = useState(today);
  const [allEvents, setAllEvents]       = useState<CalendarEvent[]>([]);
  const [occs, setOccs]                 = useState<Occurrence[]>([]);
  const [plan, setPlan]                 = useState<DayPlan | null>(null);
  const [agenda, setAgenda]             = useState<UnifiedAgenda | null>(null);
  const [narrative, setNarrative]       = useState('');
  const [suggestions, setSuggestions]   = useState<Suggestion[]>([]);
  const [stats7, setStats7]             = useState<ProductivityStats | null>(null);
  const [stats30, setStats30]           = useState<ProductivityStats | null>(null);
  const [focusScore, setFocusScore]     = useState(0);
  const [streak, setStreak]             = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [movingOcc, setMovingOcc]       = useState<Occurrence | null>(null);
  const [chat, setChat]                 = useState<ChatEntry[]>([]);
  const [chatInput, setChatInput]       = useState('');
  const [chatBusy, setChatBusy]         = useState(false);
  const [nowMinutes, setNowMinutes]     = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  const scrollRef                       = useRef<ScrollView | null>(null);

  const refresh = useCallback(async (dateKey: string) => {
    const [events, day, s7, s30, scoreRaw, streakRaw] = await Promise.all([
      getEvents(),
      loadDay(dateKey),
      getProductivityStats(7),
      getProductivityStats(30),
      AsyncStorage.getItem(KEYS.score(getTodayKey())).catch(() => null),
      AsyncStorage.getItem(KEYS.streak).catch(() => null),
    ]);
    setAllEvents(events);
    setOccs(day.occs);
    setPlan(day.plan);
    setAgenda(day.unified);
    setNarrative(day.narrative);
    setSuggestions(day.suggestions);
    setStats7(s7);
    setStats30(s30);
    setFocusScore(scoreRaw ? parseInt(scoreRaw, 10) : 0);
    setStreak(streakRaw ? parseInt(streakRaw, 10) : 0);
  }, []);

  useEffect(() => {
    if (isFocused) {
      refresh(selectedDate);
      syncReminders();
    }
  }, [isFocused, selectedDate, refresh]);

  useEffect(() => {
    const iv = setInterval(() => {
      setNowMinutes(new Date().getHours() * 60 + new Date().getMinutes());
    }, 30_000);
    return () => clearInterval(iv);
  }, []);

  const afterMutation = useCallback(async () => {
    await syncReminders();
    refresh(selectedDate);
  }, [refresh, selectedDate]);

  const handleStatus = useCallback(async (occ: Occurrence, status: OccurrenceStatus) => {
    if (status === 'completed') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else if (status === 'skipped') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    await setOccurrenceStatus(occ.event.id, occ.dateKey, status);
    afterMutation();
  }, [afterMutation]);

  const handleToggleRoutine = useCallback(async (routineId: string, hit: boolean) => {
    await setRoutineHit(selectedDate, routineId, hit);
    afterMutation();
  }, [selectedDate, afterMutation]);

  const handleLongPressRoutine = useCallback((routineId: string, label: string, skipped: boolean) => {
    Alert.alert(label, undefined, [
      {
        text: skipped ? 'Un-skip' : 'Skip This Day',
        onPress: async () => { await setRoutineSkipped(selectedDate, routineId, !skipped); afterMutation(); },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [selectedDate, afterMutation]);

  const handleApplySuggestion = useCallback(async (sug: Suggestion) => {
    if (!sug.apply) return;
    const event = allEvents.find((e) => e.id === sug.apply!.eventId);
    if (!event) return;
    await upsertEvent({
      ...event,
      date: selectedDate,
      start: sug.apply.start,
      end: sug.apply.end,
      durationMinutes: sug.apply.end - sug.apply.start,
    });
    afterMutation();
  }, [allEvents, selectedDate, afterMutation]);

  const handleSlotIn = useCallback(async (occ: Occurrence) => {
    const slot = bestSlotFor(occ.event, occs, selectedDate);
    if (!slot) return;
    await upsertEvent({
      ...occ.event,
      date: selectedDate,
      start: slot.start,
      end: slot.end,
      durationMinutes: slot.end - slot.start,
    });
    afterMutation();
  }, [occs, selectedDate, afterMutation]);

  const openEdit = useCallback((event: CalendarEvent | null) => {
    setEditingEvent(event);
    setModalVisible(true);
  }, []);

  const handleAsk = useCallback(async () => {
    const q = chatInput.trim();
    if (!q || chatBusy) return;
    setChatBusy(true);
    setChatInput('');
    const history: { role: 'user' | 'assistant'; content: string }[] =
      chat.map((c) => ({ role: c.from === 'you' ? 'user' : 'assistant', content: c.text }));
    setChat((prev) => [...prev.slice(-8), { from: 'you', text: q }]);
    const res = await askAssistant(q, history);
    setChat((prev) => [...prev.slice(-8), { from: 'planner', text: res.reply }]);
    setChatBusy(false);
    if (res.changed) afterMutation();
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, [chat, chatInput, chatBusy, afterMutation]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const monthInfo = useMemo(() => {
    const d = parseDateKey(selectedDate);
    const year = d.getFullYear(), month = d.getMonth();
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(formatDateKey(new Date(year, month, day)));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return {
      year, month, cells,
      firstKey: formatDateKey(first),
      lastKey: formatDateKey(new Date(year, month, daysInMonth)),
    };
  }, [selectedDate]);

  const eventCounts = useMemo(
    () => eventCountsInRange(allEvents, monthInfo.firstKey, monthInfo.lastKey),
    [allEvents, monthInfo],
  );

  const weekDays = useMemo(() => {
    const wd = weekdayOf(selectedDate);
    const weekStart = addDaysKey(selectedDate, -wd);
    return Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i));
  }, [selectedDate]);

  const weekDensity = useMemo(() => {
    const mins = weekDays.map((k) => busyMinutesOn(allEvents, k));
    const max = Math.max(...mins, 60);
    return weekDays.map((k, i) => ({ key: k, minutes: mins[i], frac: mins[i] / max }));
  }, [weekDays, allEvents]);

  const shiftMonth = useCallback((delta: number) => {
    const d = parseDateKey(selectedDate);
    setSelectedDate(formatDateKey(new Date(d.getFullYear(), d.getMonth() + delta, 1)));
  }, [selectedDate]);

  const isToday = selectedDate === today;
  const tasksDone = occs.filter((o) => o.status === 'completed').length;
  const topSuggestion = suggestions.find((s) => s.apply) ?? suggestions[0] ?? null;
  const restSuggestions = suggestions.filter((s) => s !== topSuggestion);

  const conflictPartner = useCallback((occ: Occurrence): string | null => {
    if (!agenda) return null;
    const c = agenda.conflicts.find((x) => x.a === occ || x.b === occ);
    if (!c) return null;
    return (c.a === occ ? c.b : c.a).event.title;
  }, [agenda]);

  const efficiencyInsight = useMemo(() => {
    if (!stats7) return '';
    const total = stats7.completed + stats7.skipped + stats7.missed;
    if (total === 0) return 'No tracked activities yet this week — schedule something and complete it.';
    if (stats7.missed > 0) return `${stats7.missed} activit${stats7.missed > 1 ? 'ies' : 'y'} slipped past unmarked this week. Mark them done or skipped to keep stats honest.`;
    if (stats7.ratePercent >= 80) return `Strong week — ${stats7.completed} of ${total} planned activities completed.`;
    return `${stats7.completed} of ${total} completed. Try planning fewer, higher-priority blocks per day.`;
  }, [stats7]);

  // ── Render pieces ───────────────────────────────────────────────────────────

  const renderTimeline = () => (
    <>
      <View style={st.sectionRow}>
        <Text style={st.sectionLabel}>{isToday ? "TODAY'S TIMELINE" : fmtDateHuman(selectedDate).toUpperCase()}</Text>
        {isToday && (
          <View style={st.liveRow}>
            <View style={st.liveDot} />
            <Text style={st.liveText}>LIVE</Text>
          </View>
        )}
      </View>

      {agenda && agenda.timeline.length === 0 && agenda.flexible.length === 0 && (
        <TouchableOpacity style={st.emptySlot} onPress={() => openEdit(null)} activeOpacity={0.7}>
          <Text style={st.emptySlotTitle}>NOTHING SCHEDULED</Text>
          <Text style={st.emptySlotSub}>TAP TO ADD AN EVENT</Text>
        </TouchableOpacity>
      )}

      {agenda?.timeline.map((entry, i) => {
        if (entry.type === 'gap') {
          return (
            <View key={`gap${i}`} style={st.gapRow}>
              <View style={st.gapLine} />
              <View style={st.gapPill}>
                <Text style={st.gapText}>{fmtDuration(entry.end - entry.start)} FREE</Text>
              </View>
              <View style={st.gapLine} />
            </View>
          );
        }

        const item = entry.item;

        if (item.kind === 'routine') {
          const r = item.routine;
          return (
            <View key={`routine-${r.id}-${i}`} style={st.tlRow}>
              <View style={st.tlTimeCol}>
                <Text style={st.tlTime}>{fmtTime(item.start)}</Text>
              </View>
              <View style={st.tlRailCol}>
                <View style={[st.tlDot, item.completed && { backgroundColor: COLORS.textPrimary }]} />
                <View style={st.tlLine} />
              </View>
              <TouchableOpacity
                style={[st.tlCard, st.tlCardRoutine, (item.completed || item.skipped) && { opacity: 0.6 }]}
                onPress={() => handleToggleRoutine(r.id, !item.completed)}
                onLongPress={() => handleLongPressRoutine(r.id, r.label, item.skipped)}
                delayLongPress={500}
                activeOpacity={0.7}
              >
                <View style={st.tlChipRow}>
                  <View style={st.routineChip}><Text style={st.routineChipText}>ROUTINE</Text></View>
                  <View style={{ flex: 1 }} />
                  <Text style={st.tlDur}>{fmtDuration(item.end - item.start)}</Text>
                </View>
                <Text style={[st.tlTitle, (item.completed || item.skipped) && { textDecorationLine: 'line-through' }]}>
                  {r.label.toUpperCase()}{item.completed ? '  ✓' : item.skipped ? '  (SKIPPED)' : ''}
                </Text>
                {item.shifted && (
                  <Text style={st.tlLoc}>MOVED FROM ITS USUAL TIME TO FIT YOUR SCHEDULE</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        }

        const occ = item.occ;
        const partner = item.conflicted ? conflictPartner(occ) : null;
        const isPast = selectedDate < today || (isToday && occ.end !== null && occ.end < nowMinutes);
        const needsAction = isPast && occ.status === 'pending';
        const canMove = occ.status === 'pending';
        const done = occ.status === 'completed';
        const skipped = occ.status === 'skipped';
        return (
          <View key={`${occ.event.id}-${i}`} style={st.tlRow}>
            <View style={st.tlTimeCol}>
              <Text style={st.tlTime}>{occ.start !== null ? fmtTime(occ.start) : '—'}</Text>
            </View>
            <View style={st.tlRailCol}>
              <View style={[st.tlDot, done && { backgroundColor: COLORS.textPrimary }]} />
              <View style={st.tlLine} />
            </View>
            <TouchableOpacity
              style={[st.tlCard, item.conflicted && st.tlCardConflict, (done || skipped) && { opacity: 0.45 }]}
              onPress={() => openEdit(occ.event)}
              activeOpacity={0.7}
            >
              <View style={st.tlChipRow}>
                <View style={st.catChip}><Text style={st.catChipText}>{occ.event.category}</Text></View>
                {occ.event.priority === 'high' && <View style={st.prioDot} />}
                <View style={{ flex: 1 }} />
                {occ.end !== null && occ.start !== null && (
                  <Text style={st.tlDur}>{fmtDuration(occ.end - occ.start)}</Text>
                )}
              </View>
              <Text style={[st.tlTitle, skipped && { textDecorationLine: 'line-through' }]}>
                {occ.event.title.toUpperCase()}{done ? '  ✓' : ''}
              </Text>
              {occ.event.location && (
                <Text style={st.tlLoc}>◎ {occ.event.location.toUpperCase()}</Text>
              )}
              {partner && (
                <View style={st.conflictBanner}>
                  <Text style={st.conflictBannerText}>⊘ OVERLAPS WITH {partner.toUpperCase()}</Text>
                </View>
              )}
              {(needsAction || canMove) && (
                <View style={st.actionRow}>
                  {needsAction && (
                    <>
                      <TouchableOpacity onPress={() => handleStatus(occ, 'completed')} style={st.doneBtn} activeOpacity={0.7}>
                        <Text style={st.doneBtnText}>✓ DONE</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleStatus(occ, 'skipped')} style={st.miniBtn} activeOpacity={0.7}>
                        <Text style={st.miniBtnText}>SKIP</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {canMove && (
                    <TouchableOpacity onPress={() => setMovingOcc(occ)} style={st.miniBtn} activeOpacity={0.7}>
                      <Text style={st.miniBtnText}>MOVE</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </TouchableOpacity>
          </View>
        );
      })}
    </>
  );

  const renderFlexBacklog = () => {
    if (!agenda || agenda.flexible.length === 0) return null;
    return (
      <>
        <Text style={st.sectionLabel}>UNSCHEDULED / FLEX ({agenda.flexible.length})</Text>
        <View style={st.flexGrid}>
          {agenda.flexible.map((occ) => (
            <View key={occ.event.id} style={st.flexCard}>
              <View style={st.flexTop}>
                <Text style={st.flexDur}>{fmtDuration(occ.event.durationMinutes)}</Text>
              </View>
              <Text style={st.flexTitle} numberOfLines={2}>{occ.event.title.toUpperCase()}</Text>
              <TouchableOpacity onPress={() => handleSlotIn(occ)} activeOpacity={0.7} style={st.slotInBtn}>
                <Text style={st.slotInText}>SLOT IN  →</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </>
    );
  };

  const renderInsights = () => {
    if (restSuggestions.length === 0) return null;
    return (
      <>
        <Text style={st.sectionLabel}>MORE INSIGHTS</Text>
        {restSuggestions.map((sug, i) => (
          <View key={i} style={[st.insightCard, sug.severity === 'warn' && st.insightWarn]}>
            <Text style={st.insightText}>{sug.text}</Text>
            {sug.apply && (
              <TouchableOpacity onPress={() => handleApplySuggestion(sug)} style={st.insightApply} activeOpacity={0.7}>
                <Text style={st.insightApplyText}>APPLY</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </>
    );
  };

  return (
    <SafeAreaView style={st.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={st.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={st.headerRow}>
            <Text style={st.headerTitle}>{viewMode === 'day' && isToday ? 'TODAY' : 'SCHEDULE'}</Text>
            {!isToday && (
              <TouchableOpacity onPress={() => setSelectedDate(today)} activeOpacity={0.7} style={st.todayBtn}>
                <Text style={st.todayBtnText}>TODAY</Text>
              </TouchableOpacity>
            )}
          </View>

          <Segmented mode={viewMode} onChange={setViewMode} />

          {/* ── DAY VIEW ─────────────────────────────────────────────────────── */}
          {viewMode === 'day' && (
            <>
              {/* Stats strip */}
              <View style={st.statsRow}>
                <View style={st.statCard}>
                  <Text style={st.statLabel}>⌁ FOCUS SCORE</Text>
                  <Text style={st.statValue}>{focusScore}</Text>
                </View>
                <View style={st.statCard}>
                  <Text style={st.statLabel}>✓ TASKS DONE</Text>
                  <Text style={st.statValue}>{tasksDone}/{occs.length}</Text>
                </View>
                <View style={st.statCard}>
                  <Text style={st.statLabel}>⚡ STREAK</Text>
                  <Text style={st.statValue}>{streak}D</Text>
                </View>
              </View>

              <SmartPlanCard narrative={narrative} actionable={topSuggestion} onApply={handleApplySuggestion} />
              {renderTimeline()}
              {renderFlexBacklog()}
              {renderInsights()}
            </>
          )}

          {/* ── WEEK VIEW ────────────────────────────────────────────────────── */}
          {viewMode === 'week' && (
            <>
              {/* Week strip */}
              <View style={st.weekStrip}>
                {weekDays.map((key) => {
                  const selected = key === selectedDate;
                  const isTodayCell = key === today;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setSelectedDate(key)}
                      activeOpacity={0.7}
                      style={[st.wDay, selected && st.wDaySelected, !selected && isTodayCell && st.wDayToday]}
                    >
                      <Text style={[st.wDayAbbr, selected && { color: COLORS.textInverse }]}>
                        {DAY_ABBR[weekdayOf(key)]}
                      </Text>
                      <Text style={[st.wDayNum, selected && { color: COLORS.textInverse }]}>
                        {Number(key.slice(-2))}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Weekly density */}
              <Text style={st.sectionLabel}>WEEKLY DENSITY</Text>
              <View style={st.densityRow}>
                {weekDensity.map((d) => (
                  <TouchableOpacity
                    key={d.key}
                    style={st.densityCol}
                    onPress={() => setSelectedDate(d.key)}
                    activeOpacity={0.7}
                  >
                    <View style={st.densityTrack}>
                      <View
                        style={[
                          st.densityFill,
                          {
                            height: `${Math.max(d.frac * 100, d.minutes > 0 ? 8 : 0)}%` as any,
                            backgroundColor: d.key === selectedDate ? COLORS.textPrimary : COLORS.purpleLight,
                          },
                        ]}
                      />
                    </View>
                    <Text style={st.densityLabel}>{DAY_ABBR[weekdayOf(d.key)].slice(0, 1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Efficiency */}
              {stats7 && (
                <View style={st.effCard}>
                  <View style={st.effTop}>
                    <Text style={st.effLabel}>EFFICIENCY LAST 7D</Text>
                    <Text style={st.effValue}>{stats7.ratePercent}%</Text>
                  </View>
                  <View style={st.effTrack}>
                    <View style={[st.effFill, { width: `${stats7.ratePercent}%` as any }]} />
                  </View>
                  <Text style={st.effInsight}>{efficiencyInsight}</Text>
                </View>
              )}

              <SmartPlanCard narrative={narrative} actionable={topSuggestion} onApply={handleApplySuggestion} />
              {renderTimeline()}
              {renderFlexBacklog()}
              {renderInsights()}
            </>
          )}

          {/* ── MONTH VIEW ───────────────────────────────────────────────────── */}
          {viewMode === 'month' && (
            <>
              <View style={st.monthCard}>
                <View style={st.monthNav}>
                  <TouchableOpacity
                    onPress={() => shiftMonth(-1)}
                    hitSlop={10}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Previous month"
                  >
                    <Text style={st.monthArrow}>‹</Text>
                  </TouchableOpacity>
                  <Text style={st.monthLabel}>{MONTHS[monthInfo.month]} {monthInfo.year}</Text>
                  <TouchableOpacity
                    onPress={() => shiftMonth(1)}
                    hitSlop={10}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Next month"
                  >
                    <Text style={st.monthArrow}>›</Text>
                  </TouchableOpacity>
                </View>
                <View style={st.weekHeader}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <Text key={i} style={st.weekHeaderCell}>{d}</Text>
                  ))}
                </View>
                <View style={st.monthGrid}>
                  {monthInfo.cells.map((key, i) => {
                    if (!key) return <View key={i} style={st.mDay} />;
                    const selected = key === selectedDate;
                    const isTodayCell = key === today;
                    const count = Math.min(eventCounts[key] ?? 0, 4);
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[st.mDay, selected && st.mDaySelected, !selected && isTodayCell && st.mDayToday]}
                        onPress={() => setSelectedDate(key)}
                        activeOpacity={0.7}
                      >
                        <Text style={[st.mDayText, selected && { color: COLORS.textInverse }]}>
                          {Number(key.slice(-2))}
                        </Text>
                        <View style={st.mDotRow}>
                          {Array.from({ length: count }, (_, di) => (
                            <View key={di} style={[st.mDot, selected && { backgroundColor: COLORS.textInverse }]} />
                          ))}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* 30d stats line */}
              {stats30 && (
                <View style={st.monthStatsRow}>
                  <Text style={st.monthStatsText}>PRODUCTIVITY 30D · {stats30.ratePercent}%</Text>
                  <Text style={st.monthStatsText}>{stats30.completed} DONE · {stats30.skipped} SKIPPED</Text>
                </View>
              )}

              {/* Agenda card for the selected date */}
              <View style={st.agendaCard}>
                <View style={st.agendaTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.agendaDate}>{fmtDateHuman(selectedDate).toUpperCase()}</Text>
                    <Text style={st.agendaGreeting}>{isToday ? greeting() : fmtDateHuman(selectedDate)}</Text>
                  </View>
                  {plan && (
                    <View style={st.freeChip}>
                      <Text style={st.freeChipLabel}>FREE TIME</Text>
                      <Text style={st.freeChipValue}>{fmtDuration(plan.freeMinutes)}</Text>
                    </View>
                  )}
                </View>
                {occs.length === 0 && (
                  <Text style={st.agendaEmpty}>Nothing scheduled — the day is wide open.</Text>
                )}
                {occs.slice(0, 4).map((occ) => (
                  <TouchableOpacity
                    key={occ.event.id}
                    style={st.agendaRow}
                    onPress={() => openEdit(occ.event)}
                    activeOpacity={0.7}
                  >
                    <View style={st.agendaRowIcon}>
                      <Text style={st.agendaRowIconText}>{occ.event.category.slice(0, 1)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.agendaRowTitle}>{occ.event.title}</Text>
                      <Text style={st.agendaRowTime}>
                        {occ.start !== null
                          ? `${fmtTime(occ.start)}${occ.end !== null ? ` – ${fmtTime(occ.end)}` : ''}`
                          : `FLEXIBLE · ${fmtDuration(occ.event.durationMinutes)}`}
                      </Text>
                    </View>
                    <View style={[st.statusChip, occ.status === 'completed' && st.statusChipDone]}>
                      <Text style={[st.statusChipText, occ.status === 'completed' && { color: COLORS.textInverse }]}>
                        {occ.status === 'completed' ? 'DONE' : occ.status === 'skipped' ? 'SKIP' : 'TODO'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
                {occs.length > 4 && (
                  <TouchableOpacity onPress={() => setViewMode('day')} activeOpacity={0.7}>
                    <Text style={st.agendaMore}>+{occs.length - 4} MORE — OPEN DAY VIEW</Text>
                  </TouchableOpacity>
                )}
              </View>

              <SmartPlanCard narrative={narrative} actionable={topSuggestion} onApply={handleApplySuggestion} />
              {renderFlexBacklog()}
              {renderInsights()}
            </>
          )}

          {/* Assistant conversation */}
          {chat.length > 0 && (
            <>
              <Text style={st.sectionLabel}>ASSISTANT</Text>
              {chat.map((entry, i) => (
                <View key={i} style={[st.chatBubble, entry.from === 'you' && st.chatBubbleYou]}>
                  <Text style={st.chatFrom}>{entry.from === 'you' ? 'YOU' : 'VITALIS'}</Text>
                  <Text style={st.chatText}>{entry.text}</Text>
                </View>
              ))}
            </>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* FAB */}
        <TouchableOpacity
          onPress={() => openEdit(null)}
          style={st.fab}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Add event"
        >
          <Text style={st.fabText}>+</Text>
        </TouchableOpacity>

        {/* Docked assistant bar */}
        <View style={st.dock}>
          <View style={st.dockDot} />
          <TextInput
            style={st.dockInput}
            value={chatInput}
            onChangeText={setChatInput}
            placeholder="Ask Vitalis Assistant…"
            placeholderTextColor={COLORS.textMuted}
            onSubmitEditing={handleAsk}
            returnKeyType="send"
          />
          <TouchableOpacity onPress={handleAsk} disabled={chatBusy} activeOpacity={0.7} hitSlop={8}>
            <Text style={st.dockSend}>{chatBusy ? '…' : '→'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <EventModal
        visible={modalVisible}
        event={editingEvent}
        defaultDate={selectedDate}
        onClose={() => setModalVisible(false)}
        onSaved={afterMutation}
      />

      <MoveOccurrenceSheet
        visible={movingOcc !== null}
        occ={movingOcc}
        weekDays={weekDays}
        onClose={() => setMovingOcc(null)}
        onMoved={afterMutation}
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.sm },

  headerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  headerTitle: {
    fontSize: FONT_SIZE.xl, color: COLORS.textPrimary,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 2,
  },
  todayBtn:     { borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: RADII.full, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
  todayBtnText: { fontSize: 9, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },

  // Stats strip
  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  statCard: {
    flex: 1, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.md,
    padding: SPACING.sm + 2,
  },
  statLabel: { fontSize: 7, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },
  statValue: { fontSize: FONT_SIZE.xl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', marginTop: 4 },

  // Section headers
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md, marginBottom: SPACING.sm },
  sectionLabel: {
    fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined,
    letterSpacing: 2.5, fontWeight: '700', marginTop: SPACING.md, marginBottom: SPACING.sm,
  },
  liveRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.textPrimary },
  liveText: { fontSize: 8, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },

  // Timeline
  tlRow:     { flexDirection: 'row', marginBottom: SPACING.sm },
  tlTimeCol: { width: 44, paddingTop: 2 },
  tlTime:    { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5 },
  tlRailCol: { width: 14, alignItems: 'center' },
  tlDot:     { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: COLORS.borderBright, backgroundColor: COLORS.background, marginTop: 3 },
  tlLine:    { flex: 1, width: 1, backgroundColor: COLORS.borderDim, marginTop: 2 },
  tlCard: {
    flex: 1, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.md,
    padding: SPACING.sm + 2,
  },
  tlCardConflict: { borderColor: COLORS.red, backgroundColor: COLORS.redGlow },
  tlCardRoutine: { borderStyle: 'dashed', backgroundColor: COLORS.surfaceElevated },
  routineChip: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.full,
    paddingHorizontal: 7, paddingVertical: 2, backgroundColor: COLORS.surfaceSolid,
  },
  routineChipText: { fontSize: 7, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },
  tlChipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  catChip: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.full,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  catChipText: { fontSize: 7, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },
  prioDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.textPrimary },
  tlDur:   { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5 },
  tlTitle: {
    fontSize: FONT_SIZE.sm, color: COLORS.textPrimary,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 0.8,
  },
  tlLoc: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, marginTop: 4 },
  conflictBanner: {
    backgroundColor: COLORS.red, borderRadius: RADII.xs,
    paddingHorizontal: SPACING.sm, paddingVertical: 4, marginTop: SPACING.sm, alignSelf: 'flex-start',
  },
  conflictBannerText: { fontSize: 8, color: '#FFFFFF', fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },

  actionRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.sm },
  doneBtn: {
    flex: 1, borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: RADII.full,
    paddingVertical: 6, alignItems: 'center',
  },
  doneBtnText: { fontSize: 9, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },
  miniBtn: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 6, alignItems: 'center',
  },
  miniBtnText: { fontSize: 8, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },

  // Gap separators
  gapRow:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs, marginLeft: 58 },
  gapLine: { flex: 1, height: 1, backgroundColor: COLORS.borderDim },
  gapPill: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  gapText: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5 },

  emptySlot: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderStyle: 'dashed',
    borderRadius: RADII.md, paddingVertical: SPACING.xl, alignItems: 'center', gap: 4,
  },
  emptySlotTitle: { fontSize: 10, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700' },
  emptySlotSub:   { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5 },

  // Flex backlog
  flexGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  flexCard: {
    width: '48%', backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.md,
    padding: SPACING.sm + 2,
  },
  flexTop:   { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 6 },
  flexDur:   { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },
  flexTitle: { fontSize: FONT_SIZE.xs, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 0.5, minHeight: 28 },
  slotInBtn:  { marginTop: SPACING.sm },
  slotInText: { fontSize: 9, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },

  // Insights
  insightCard: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.md,
    padding: SPACING.sm + 2, marginBottom: SPACING.xs, backgroundColor: COLORS.surface,
  },
  insightWarn: { borderColor: COLORS.amber, backgroundColor: COLORS.amberGlow },
  insightText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, lineHeight: 17 },
  insightApply: {
    alignSelf: 'flex-start', marginTop: SPACING.xs,
    borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
  },
  insightApplyText: { fontSize: 8, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },

  // Week strip
  weekStrip: { flexDirection: 'row', gap: 5, marginBottom: SPACING.sm },
  wDay: {
    flex: 1, alignItems: 'center', paddingVertical: SPACING.sm,
    borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.borderDim,
  },
  wDaySelected: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  wDayToday:    { borderColor: COLORS.borderBright },
  wDayAbbr: { fontSize: 7, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },
  wDayNum:  { fontSize: FONT_SIZE.md, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', marginTop: 2 },

  // Density
  densityRow: { flexDirection: 'row', gap: SPACING.sm, height: 92, alignItems: 'flex-end', marginBottom: SPACING.md },
  densityCol: { flex: 1, alignItems: 'center', height: '100%' },
  densityTrack: {
    flex: 1, width: '100%', backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.sm,
    justifyContent: 'flex-end', overflow: 'hidden',
  },
  densityFill:  { width: '100%' },
  densityLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, marginTop: 4 },

  // Efficiency
  effCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.md, padding: SPACING.md, marginBottom: SPACING.md,
  },
  effTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  effLabel: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700' },
  effValue: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  effTrack: { height: 5, backgroundColor: COLORS.borderNeon, borderRadius: RADII.full, overflow: 'hidden' },
  effFill:  { height: '100%', backgroundColor: COLORS.textPrimary, borderRadius: RADII.full },
  effInsight: { fontSize: FONT_SIZE.xxs, color: COLORS.textSecondary, lineHeight: 15, marginTop: SPACING.sm },

  // Month
  monthCard: {
    backgroundColor: COLORS.surfaceSolid, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.lg, padding: SPACING.sm, paddingBottom: SPACING.md,
  },
  monthNav:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.xs, paddingHorizontal: SPACING.xs },
  monthArrow: { fontSize: FONT_SIZE.xl, color: COLORS.textSecondary, paddingHorizontal: SPACING.md },
  monthLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700' },
  weekHeader:     { flexDirection: 'row' },
  weekHeaderCell: { flex: 1, textAlign: 'center', fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, paddingVertical: 2 },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  mDay: {
    width: `${100 / 7}%`, aspectRatio: 1.05, alignItems: 'center', justifyContent: 'center',
    borderRadius: RADII.sm,
  },
  mDaySelected: { backgroundColor: COLORS.textPrimary },
  mDayToday:    { borderWidth: 1, borderColor: COLORS.borderBright },
  mDayText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined },
  mDotRow:  { flexDirection: 'row', gap: 2, marginTop: 3, height: 3 },
  mDot:     { width: 3, height: 3, borderRadius: 2, backgroundColor: COLORS.purpleLight },

  monthStatsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.sm, paddingHorizontal: 2 },
  monthStatsText: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },

  // Agenda card (month view)
  agendaCard: {
    backgroundColor: COLORS.surfaceSolid, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.lg, padding: SPACING.md, marginBottom: SPACING.md,
  },
  agendaTop:      { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  agendaDate:     { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2 },
  agendaGreeting: { fontSize: FONT_SIZE.xl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', marginTop: 2 },
  freeChip: {
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.borderBright,
    borderRadius: RADII.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, alignItems: 'center',
  },
  freeChipLabel: { fontSize: 7, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },
  freeChipValue: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', marginTop: 2 },
  agendaEmpty: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, paddingVertical: SPACING.sm },
  agendaRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: RADII.md,
    padding: SPACING.sm + 2, marginTop: SPACING.xs,
  },
  agendaRowIcon: {
    width: 30, height: 30, borderRadius: RADII.sm,
    borderWidth: 1, borderColor: COLORS.borderDim,
    alignItems: 'center', justifyContent: 'center',
  },
  agendaRowIconText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  agendaRowTitle:    { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.bodyMedium ?? undefined },
  agendaRowTime:     { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5, marginTop: 2 },
  statusChip: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  statusChipDone: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  statusChipText: { fontSize: 7, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },
  agendaMore: { fontSize: 9, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, textAlign: 'center', paddingTop: SPACING.sm, fontWeight: '700' },

  // Chat
  chatBubble: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.md,
    padding: SPACING.sm, marginBottom: SPACING.xs, backgroundColor: COLORS.surface,
  },
  chatBubbleYou: { backgroundColor: COLORS.surfaceElevated, borderColor: COLORS.borderNeon },
  chatFrom: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700', marginBottom: 2 },
  chatText: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, lineHeight: 17 },

  // FAB + dock
  fab: {
    position: 'absolute', bottom: 74, right: SPACING.screenPad,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: COLORS.textPrimary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 6,
  },
  fabText: { fontSize: 26, color: COLORS.textInverse, fontWeight: '400', lineHeight: 30 },
  dock: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginHorizontal: SPACING.screenPad, marginBottom: SPACING.sm,
    backgroundColor: COLORS.surfaceSolid, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.full, paddingHorizontal: SPACING.md, paddingVertical: 4,
  },
  dockDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.textPrimary },
  dockInput: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, paddingVertical: SPACING.sm },
  dockSend:  { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, paddingHorizontal: SPACING.xs },
});
