import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  StyleSheet, TextInput, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CalendarEvent, EventCategory, EventPriority, RepeatRule,
  EVENT_CATEGORIES, REMINDER_OPTIONS,
  newEventId, upsertEvent, deleteEvent,
  getEvents, getStatusMap, occurrencesForDateSync, findConflicts,
  fmtTime, parseDateKey, addDaysKey,
} from '../services/calendar';
import { bestSlotFor } from '../services/planner';
import { formatDateKey, getTodayKey } from '../services/storage';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../theme';

interface Props {
  visible: boolean;
  /** Existing event to edit, or null to create */
  event: CalendarEvent | null;
  /** Default date for new events */
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}

const PRIORITIES: { key: EventPriority; label: string }[] = [
  { key: 'high', label: 'HIGH' },
  { key: 'medium', label: 'MEDIUM' },
  { key: 'low', label: 'LOW' },
];

const REPEATS: { key: RepeatRule; label: string }[] = [
  { key: 'none', label: 'NONE' },
  { key: 'daily', label: 'DAILY' },
  { key: 'weekly', label: 'WEEKLY' },
  { key: 'monthly', label: 'MONTHLY' },
];

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

export function EventModal({ visible, event, defaultDate, onClose, onSaved }: Props) {
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation]       = useState('');
  const [date, setDate]               = useState(defaultDate);
  const [flexible, setFlexible]       = useState(false);
  const [start, setStart]             = useState(9 * 60);
  const [duration, setDuration]       = useState(60);
  const [category, setCategory]       = useState<EventCategory>('PERSONAL');
  const [priority, setPriority]       = useState<EventPriority>('medium');
  const [repeat, setRepeat]           = useState<RepeatRule>('none');
  const [reminders, setReminders]     = useState<number[]>([60, 15]);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = parseDateKey(defaultDate);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Load / reset form when opened
  useEffect(() => {
    if (!visible) return;
    if (event) {
      setTitle(event.title);
      setDescription(event.description ?? '');
      setLocation(event.location ?? '');
      setDate(event.date);
      setFlexible(event.start === null);
      setStart(event.start ?? 9 * 60);
      setDuration(event.start !== null && event.end !== null
        ? event.end - event.start
        : event.durationMinutes);
      setCategory(event.category);
      setPriority(event.priority);
      setRepeat(event.repeat);
      setReminders(event.reminders);
      const d = parseDateKey(event.date);
      setMonthCursor({ year: d.getFullYear(), month: d.getMonth() });
    } else {
      setTitle('');
      setDescription('');
      setLocation('');
      setDate(defaultDate);
      setFlexible(false);
      setStart(9 * 60);
      setDuration(60);
      setCategory('PERSONAL');
      setPriority('medium');
      setRepeat('none');
      setReminders([60, 15]);
      const d = parseDateKey(defaultDate);
      setMonthCursor({ year: d.getFullYear(), month: d.getMonth() });
    }
    setConflictMsg(null);
  }, [visible, event, defaultDate]);

  const end = start + duration;

  const toggleReminder = useCallback((mins: number) => {
    setReminders((prev) =>
      prev.includes(mins) ? prev.filter((m) => m !== mins) : [...prev, mins]);
  }, []);

  const buildEvent = useCallback((): CalendarEvent => ({
    id: event?.id ?? newEventId(),
    title: title.trim() || 'Untitled',
    description: description.trim() || undefined,
    location: location.trim() || undefined,
    date,
    start: flexible ? null : start,
    end: flexible ? null : end,
    durationMinutes: duration,
    category,
    priority,
    repeat,
    reminders: [...reminders].sort((a, b) => b - a),
    createdAt: event?.createdAt ?? Date.now(),
  }), [event, title, description, location, date, flexible, start, end, duration, category, priority, repeat, reminders]);

  const checkConflicts = useCallback(async (candidate: CalendarEvent): Promise<string | null> => {
    if (candidate.start === null) return null;
    const [events, statusMap] = await Promise.all([getEvents(), getStatusMap()]);
    const others = events.filter((e) => e.id !== candidate.id);
    const occs = occurrencesForDateSync([...others, candidate], statusMap, candidate.date);
    const conflicts = findConflicts(occs).filter(
      (c) => c.a.event.id === candidate.id || c.b.event.id === candidate.id);
    if (conflicts.length === 0) return null;
    const other = conflicts[0].a.event.id === candidate.id ? conflicts[0].b : conflicts[0].a;
    return `Overlaps with "${other.event.title}" (${fmtTime(other.start!)}–${fmtTime(other.end!)})`;
  }, []);

  const doSave = useCallback(async (candidate: CalendarEvent) => {
    await upsertEvent(candidate);
    onSaved();
    onClose();
  }, [onSaved, onClose]);

  const handleSave = useCallback(async () => {
    const candidate = buildEvent();
    const conflict = await checkConflicts(candidate);
    if (conflict && !conflictMsg) {
      setConflictMsg(conflict);
      return; // first tap: warn; user chooses below
    }
    await doSave(candidate);
  }, [buildEvent, checkConflicts, conflictMsg, doSave]);

  const handleAutoResolve = useCallback(async () => {
    const candidate = buildEvent();
    const [events, statusMap] = await Promise.all([getEvents(), getStatusMap()]);
    const others = events.filter((e) => e.id !== candidate.id);
    const occs = occurrencesForDateSync(others, statusMap, candidate.date);
    const slot = bestSlotFor(candidate, occs, candidate.date);
    if (slot) {
      await doSave({ ...candidate, start: slot.start, end: slot.end, durationMinutes: slot.end - slot.start });
    } else {
      // No room today — push to next day at same time
      await doSave({ ...candidate, date: addDaysKey(candidate.date, 1) });
    }
  }, [buildEvent, doSave]);

  const handleDelete = useCallback(async () => {
    if (!event) return;
    await deleteEvent(event.id);
    onSaved();
    onClose();
  }, [event, onSaved, onClose]);

  // ── Mini month grid for date picking ────────────────────────────────────────
  const monthDays = useMemo(() => {
    const first = new Date(monthCursor.year, monthCursor.month, 1);
    const startPad = first.getDay(); // 0=Sun
    const daysInMonth = new Date(monthCursor.year, monthCursor.month + 1, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(formatDateKey(new Date(monthCursor.year, monthCursor.month, d)));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthCursor]);

  const shiftMonth = useCallback((delta: number) => {
    setMonthCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const today = getTodayKey();

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>{event ? 'EDIT EVENT' : 'NEW EVENT'}</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            activeOpacity={0.7}
            style={s.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={s.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Title */}
          <Text style={s.label}>EVENT TITLE</Text>
          <TextInput
            style={s.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Weekly Strategy Review"
            placeholderTextColor={COLORS.textMuted}
          />

          {/* Description */}
          <Text style={s.label}>DESCRIPTION</Text>
          <TextInput
            style={[s.input, s.inputMulti]}
            value={description}
            onChangeText={setDescription}
            placeholder="Details, agenda, or notes…"
            placeholderTextColor={COLORS.textMuted}
            multiline
          />

          {/* Location */}
          <Text style={s.label}>LOCATION</Text>
          <View style={s.inputIconRow}>
            <Text style={s.inputIconGlyph}>◎</Text>
            <TextInput
              style={s.inputIconField}
              value={location}
              onChangeText={setLocation}
              placeholder="Add place or link"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          {/* Schedule */}
          <Text style={s.label}>SCHEDULE</Text>
          <View style={s.scheduleCard}>
            <View style={s.monthNav}>
              <Text style={s.monthLabel}>{MONTHS[monthCursor.month]} {monthCursor.year}</Text>
              <View style={s.monthNavArrows}>
                <TouchableOpacity
                  onPress={() => shiftMonth(-1)}
                  hitSlop={10}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                >
                  <Text style={s.monthArrow}>‹</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => shiftMonth(1)}
                  hitSlop={10}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                >
                  <Text style={s.monthArrow}>›</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={s.weekHeader}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <Text key={i} style={s.weekHeaderCell}>{d}</Text>
              ))}
            </View>
            <View style={s.monthGrid}>
              {monthDays.map((key, i) => {
                if (!key) return <View key={i} style={s.dayCell} />;
                const dayNum = Number(key.slice(-2));
                const selected = key === date;
                const isToday = key === today;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[s.dayCell, selected && s.dayCellSelected, !selected && isToday && s.dayCellToday]}
                    onPress={() => setDate(key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.dayCellText, selected && { color: COLORS.textInverse }]}>
                      {dayNum}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Time */}
          <TouchableOpacity
            onPress={() => setFlexible((f) => !f)}
            activeOpacity={0.7}
            style={s.flexToggle}
          >
            <View style={[s.checkbox, flexible && s.checkboxOn]}>
              {flexible && <Text style={s.checkmark}>✓</Text>}
            </View>
            <Text style={s.flexToggleText}>FLEXIBLE — LET THE PLANNER PICK THE BEST TIME</Text>
          </TouchableOpacity>

          {!flexible && (
            <>
              <View style={s.timeRow}>
                <Text style={s.timeRowLabel}>START</Text>
                <View style={s.stepper}>
                  <TouchableOpacity onPress={() => setStart((v) => Math.max(0, v - 60))} style={s.stepBtn} activeOpacity={0.7}><Text style={s.stepBtnText}>-1H</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setStart((v) => Math.max(0, v - 15))} style={s.stepBtn} activeOpacity={0.7}><Text style={s.stepBtnText}>-15</Text></TouchableOpacity>
                  <Text style={s.timeValue}>{fmtTime(start)}</Text>
                  <TouchableOpacity onPress={() => setStart((v) => Math.min(23 * 60 + 45, v + 15))} style={s.stepBtn} activeOpacity={0.7}><Text style={s.stepBtnText}>+15</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setStart((v) => Math.min(23 * 60 + 45, v + 60))} style={s.stepBtn} activeOpacity={0.7}><Text style={s.stepBtnText}>+1H</Text></TouchableOpacity>
                </View>
              </View>
              <View style={s.timeRow}>
                <Text style={s.timeRowLabel}>END</Text>
                <View style={s.stepper}>
                  <TouchableOpacity onPress={() => setDuration((v) => Math.max(15, v - 60))} style={s.stepBtn} activeOpacity={0.7}><Text style={s.stepBtnText}>-1H</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setDuration((v) => Math.max(15, v - 15))} style={s.stepBtn} activeOpacity={0.7}><Text style={s.stepBtnText}>-15</Text></TouchableOpacity>
                  <Text style={s.timeValue}>{fmtTime(end)}</Text>
                  <TouchableOpacity onPress={() => setDuration((v) => Math.min(24 * 60 - start, v + 15))} style={s.stepBtn} activeOpacity={0.7}><Text style={s.stepBtnText}>+15</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setDuration((v) => Math.min(24 * 60 - start, v + 60))} style={s.stepBtn} activeOpacity={0.7}><Text style={s.stepBtnText}>+1H</Text></TouchableOpacity>
                </View>
              </View>
            </>
          )}
          {flexible && (
            <View style={s.timeRow}>
              <Text style={s.timeRowLabel}>DURATION</Text>
              <View style={s.stepper}>
                <TouchableOpacity onPress={() => setDuration((v) => Math.max(15, v - 15))} style={s.stepBtn} activeOpacity={0.7}><Text style={s.stepBtnText}>-15</Text></TouchableOpacity>
                <Text style={s.timeValue}>{Math.floor(duration / 60) > 0 ? `${Math.floor(duration / 60)}H ` : ''}{duration % 60 > 0 ? `${duration % 60}M` : ''}</Text>
                <TouchableOpacity onPress={() => setDuration((v) => Math.min(24 * 60, v + 15))} style={s.stepBtn} activeOpacity={0.7}><Text style={s.stepBtnText}>+15</Text></TouchableOpacity>
              </View>
            </View>
          )}

          {/* Category */}
          <Text style={s.label}>CATEGORY</Text>
          <View style={s.chipWrap}>
            {EVENT_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                onPress={() => setCategory(cat)}
                activeOpacity={0.7}
                style={[s.chip, category === cat && s.chipActive]}
              >
                <Text style={[s.chipText, category === cat && { color: COLORS.textPrimary }]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Priority */}
          <Text style={s.label}>PRIORITY</Text>
          <View style={s.chipWrap}>
            {PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p.key}
                onPress={() => setPriority(p.key)}
                activeOpacity={0.7}
                style={[s.chip, priority === p.key && s.chipActive]}
              >
                <Text style={[s.chipText, priority === p.key && { color: COLORS.textPrimary }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Repeat */}
          <Text style={s.label}>REPEAT</Text>
          <View style={s.chipWrap}>
            {REPEATS.map((r) => (
              <TouchableOpacity
                key={r.key}
                onPress={() => setRepeat(r.key)}
                activeOpacity={0.7}
                style={[s.chip, repeat === r.key && s.chipActive]}
              >
                <Text style={[s.chipText, repeat === r.key && { color: COLORS.textPrimary }]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Reminders */}
          <Text style={s.label}>REMIND ME</Text>
          <View style={s.chipWrap}>
            {REMINDER_OPTIONS.map((r) => {
              const on = reminders.includes(r.minutes);
              return (
                <TouchableOpacity
                  key={r.minutes}
                  onPress={() => toggleReminder(r.minutes)}
                  activeOpacity={0.7}
                  style={[s.chip, on && s.chipActive]}
                >
                  <Text style={[s.chipText, on && { color: COLORS.textPrimary }]}>{r.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Conflict warning */}
          {conflictMsg && (
            <View style={s.conflictBox}>
              <Text style={s.conflictTitle}>SCHEDULE CONFLICT</Text>
              <Text style={s.conflictText}>{conflictMsg}</Text>
              <View style={s.conflictActions}>
                <TouchableOpacity onPress={handleAutoResolve} style={s.conflictBtn} activeOpacity={0.7}>
                  <Text style={s.conflictBtnText}>FIND ANOTHER TIME</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSave} style={s.conflictBtn} activeOpacity={0.7}>
                  <Text style={s.conflictBtnText}>SAVE ANYWAY</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Delete */}
          {event && (
            <TouchableOpacity onPress={handleDelete} style={s.deleteBtn} activeOpacity={0.7}>
              <Text style={s.deleteBtnText}>DELETE EVENT</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>

        {/* Footer actions */}
        <View style={s.footer}>
          <TouchableOpacity onPress={onClose} style={s.cancelBtn} activeOpacity={0.7}>
            <Text style={s.cancelBtnText}>CANCEL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            style={[s.saveBtn, !title.trim() && { opacity: 0.4 }]}
            activeOpacity={0.8}
            disabled={!title.trim()}
          >
            <Text style={s.saveBtnText}>
              {conflictMsg ? 'SAVE ANYWAY' : event ? 'SAVE CHANGES' : 'CREATE EVENT'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenPad, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderDim,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg, color: COLORS.textPrimary,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 0.5,
  },
  closeBtn: {
    width: 30, height: 30, borderRadius: RADII.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { fontSize: FONT_SIZE.md, color: COLORS.textMuted },
  scroll:    { paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.lg },
  label: {
    fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined,
    letterSpacing: 1.5, fontWeight: '700', marginTop: SPACING.lg, marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderNeon,
    borderRadius: RADII.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.body ?? undefined,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  inputIconRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderNeon,
    borderRadius: RADII.md, paddingHorizontal: SPACING.md,
  },
  inputIconGlyph: { fontSize: FONT_SIZE.base, color: COLORS.textMuted },
  inputIconField: {
    flex: 1, paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.body ?? undefined,
  },

  scheduleCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderNeon,
    borderRadius: RADII.md, padding: SPACING.md,
  },
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: SPACING.sm,
  },
  monthNavArrows: { flexDirection: 'row', gap: SPACING.md },
  monthArrow: { fontSize: FONT_SIZE.lg, color: COLORS.textSecondary, paddingHorizontal: SPACING.xs },
  monthLabel: {
    fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.headingSemi ?? undefined,
    fontWeight: '700',
  },
  weekHeader:     { flexDirection: 'row' },
  weekHeaderCell: {
    flex: 1, textAlign: 'center', fontSize: 9, color: COLORS.textMuted,
    fontFamily: FONTS.mono ?? undefined, paddingVertical: 4,
  },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`, aspectRatio: 1.25, alignItems: 'center', justifyContent: 'center',
  },
  dayCellSelected: {
    backgroundColor: COLORS.textPrimary, borderRadius: RADII.sm,
  },
  dayCellToday: {
    borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: RADII.sm,
  },
  dayCellText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined },

  flexToggle: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  flexToggleText: { fontSize: FONT_SIZE.xxs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5, flex: 1 },
  checkbox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: COLORS.borderBright,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  checkmark:  { fontSize: 11, color: COLORS.textInverse, fontWeight: '700' },

  timeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  timeRowLabel: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, width: 64 },
  stepper:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, flex: 1, justifyContent: 'flex-end' },
  stepBtn: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.xs,
    paddingHorizontal: 8, paddingVertical: 6,
  },
  stepBtnText: { fontSize: 10, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined },
  timeValue: {
    fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined,
    fontWeight: '700', minWidth: 84, textAlign: 'center',
  },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  chip: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 5,
  },
  chipActive: { borderColor: COLORS.borderBright, backgroundColor: COLORS.surfaceElevated },
  chipText:   { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },

  conflictBox: {
    marginTop: SPACING.lg, borderWidth: 1, borderColor: COLORS.amber,
    borderRadius: RADII.md, padding: SPACING.md, backgroundColor: COLORS.amberDim,
  },
  conflictTitle: { fontSize: 9, color: COLORS.amber, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700', marginBottom: 4 },
  conflictText:  { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, lineHeight: 18 },
  conflictActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  conflictBtn: {
    borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: 8, flex: 1, alignItems: 'center',
  },
  conflictBtnText: { fontSize: 9, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, fontWeight: '700' },

  deleteBtn: {
    marginTop: SPACING.xl, alignItems: 'center', paddingVertical: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.redDim, borderRadius: RADII.md,
  },
  deleteBtnText: { fontSize: 10, color: COLORS.red, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700' },

  footer: {
    flexDirection: 'row', gap: SPACING.sm,
    paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.md, paddingBottom: SPACING.md,
    backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: COLORS.borderDim,
  },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: RADII.md,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: FONT_SIZE.xs, color: COLORS.textSecondary,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1.5,
  },
  saveBtn: {
    flex: 1.4, backgroundColor: COLORS.textPrimary, borderRadius: RADII.md,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  saveBtnText: {
    fontSize: FONT_SIZE.xs, color: COLORS.textInverse,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1.5,
  },
});
