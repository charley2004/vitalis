import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatDateKey } from './storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EventCategory =
  | 'EXAM' | 'STUDY' | 'WORK' | 'MEETING' | 'GYM'
  | 'HEALTH' | 'FINANCE' | 'PERSONAL' | 'SOCIAL' | 'OTHER';

export type EventPriority = 'high' | 'medium' | 'low';
export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly';
export type OccurrenceStatus = 'pending' | 'completed' | 'skipped';

export const EVENT_CATEGORIES: EventCategory[] = [
  'EXAM', 'STUDY', 'WORK', 'MEETING', 'GYM',
  'HEALTH', 'FINANCE', 'PERSONAL', 'SOCIAL', 'OTHER',
];

// Reminder offsets in minutes before start (0 = at start time)
export const REMINDER_OPTIONS = [
  { minutes: 1440, label: '1 DAY' },
  { minutes: 60,   label: '1 HOUR' },
  { minutes: 15,   label: '15 MIN' },
  { minutes: 0,    label: 'AT START' },
] as const;

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  /** First (or only) date this event occurs — YYYY-MM-DD */
  date: string;
  /** Minutes since midnight; null = flexible / no fixed time yet */
  start: number | null;
  /** Minutes since midnight; null when start is null */
  end: number | null;
  /** Used for flexible events and when auto-scheduling */
  durationMinutes: number;
  category: EventCategory;
  priority: EventPriority;
  location?: string;
  repeat: RepeatRule;
  /** Minutes-before-start offsets, e.g. [1440, 60, 15, 0] */
  reminders: number[];
  createdAt: number;
  /** Set when this event was created by the Finance module (e.g. a recurring
   *  bill) so Finance can find/edit/delete its own linked event without
   *  scanning by title. Absent for events created directly in Planner. */
  financeRefId?: string;
  /** Set when this event is a one-off "make-up" instance created by moving a
   *  single occurrence of a recurring event to a different day — see
   *  moveOccurrence(). Absent for everything else. */
  movedFromEventId?: string;
  movedFromDate?: string;
}

/** A concrete instance of an event on a specific date */
export interface Occurrence {
  event: CalendarEvent;
  dateKey: string;
  start: number | null;
  end: number | null;
  status: OccurrenceStatus;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const EVENTS_KEY = '@vitalis/planner_events';
const STATUS_KEY = '@vitalis/planner_status';

type StatusMap = Record<string, 'completed' | 'skipped'>;

function statusKeyFor(eventId: string, dateKey: string): string {
  return `${eventId}@${dateKey}`;
}

export async function getEvents(): Promise<CalendarEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(EVENTS_KEY);
    return raw ? (JSON.parse(raw) as CalendarEvent[]) : [];
  } catch { return []; }
}

async function saveEvents(events: CalendarEvent[]): Promise<void> {
  try { await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events)); } catch {}
}

export async function getStatusMap(): Promise<StatusMap> {
  try {
    const raw = await AsyncStorage.getItem(STATUS_KEY);
    return raw ? (JSON.parse(raw) as StatusMap) : {};
  } catch { return {}; }
}

async function saveStatusMap(map: StatusMap): Promise<void> {
  try { await AsyncStorage.setItem(STATUS_KEY, JSON.stringify(map)); } catch {}
}

export function newEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function upsertEvent(event: CalendarEvent): Promise<void> {
  const events = await getEvents();
  const idx = events.findIndex((e) => e.id === event.id);
  if (idx >= 0) events[idx] = event;
  else events.push(event);
  await saveEvents(events);
}

export async function deleteEvent(eventId: string): Promise<void> {
  const events = await getEvents();
  await saveEvents(events.filter((e) => e.id !== eventId));
  const map = await getStatusMap();
  let changed = false;
  Object.keys(map).forEach((k) => {
    if (k.startsWith(`${eventId}@`)) { delete map[k]; changed = true; }
  });
  if (changed) await saveStatusMap(map);
}

export async function setOccurrenceStatus(
  eventId: string,
  dateKey: string,
  status: OccurrenceStatus,
): Promise<void> {
  const map = await getStatusMap();
  const key = statusKeyFor(eventId, dateKey);
  if (status === 'pending') delete map[key];
  else map[key] = status;
  await saveStatusMap(map);
}

/**
 * Move a single occurrence of an event to a different day, without touching
 * any of its other occurrences.
 *
 * - One-off events (`repeat: 'none'`), or a same-day time-only change: only
 *   one occurrence ever exists, so mutating the event directly is correct.
 * - A recurring event moved to a different day: the event's `date` is the
 *   anchor every future occurrence is computed from (see `occursOn`), so it
 *   can't move without dragging the whole series with it. Instead, this one
 *   instance is marked skipped on its original date, and reborn as an
 *   independent one-off event on the target date — editable/completable on
 *   its own from here on, with no special-casing needed anywhere else.
 *
 * Returns the event as it now stands on the target date (the mutated
 * original, or the new clone), or null if `eventId` doesn't exist.
 */
export async function moveOccurrence(
  eventId: string,
  fromDateKey: string,
  toDateKey: string,
  timeOverride?: { start: number | null; end: number | null },
): Promise<CalendarEvent | null> {
  const events = await getEvents();
  const event = events.find((e) => e.id === eventId);
  if (!event) return null;

  const applyTime = (e: CalendarEvent): CalendarEvent => {
    if (!timeOverride) return e;
    const duration = timeOverride.start !== null && timeOverride.end !== null
      ? timeOverride.end - timeOverride.start
      : e.durationMinutes;
    return { ...e, start: timeOverride.start, end: timeOverride.end, durationMinutes: duration };
  };

  if (fromDateKey === toDateKey || event.repeat === 'none') {
    const next = applyTime({ ...event, date: toDateKey });
    await upsertEvent(next);
    if (fromDateKey !== toDateKey) {
      const map = await getStatusMap();
      const oldKey = statusKeyFor(eventId, fromDateKey);
      if (map[oldKey] !== undefined) {
        map[statusKeyFor(eventId, toDateKey)] = map[oldKey];
        delete map[oldKey];
        await saveStatusMap(map);
      }
    }
    return next;
  }

  await setOccurrenceStatus(eventId, fromDateKey, 'skipped');
  const clone = applyTime({
    ...event,
    id: newEventId(),
    date: toDateKey,
    repeat: 'none',
    movedFromEventId: event.id,
    movedFromDate: fromDateKey,
  });
  await upsertEvent(clone);
  return clone;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function parseDateKey(key: string): Date {
  return new Date(key + 'T12:00:00');
}

export function addDaysKey(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return formatDateKey(d);
}

export function weekdayOf(key: string): number {
  return parseDateKey(key).getDay(); // 0 = Sunday
}

export function isWeekend(key: string): boolean {
  const wd = weekdayOf(key);
  return wd === 0 || wd === 6;
}

export function fmtTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}M`;
  if (m === 0) return `${h}H`;
  return `${h}H ${m}M`;
}

export function fmtDateHuman(key: string): string {
  const d = parseDateKey(key);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

// ─── Recurrence ───────────────────────────────────────────────────────────────

export function occursOn(event: CalendarEvent, dateKey: string): boolean {
  if (event.date === dateKey) return true;
  if (event.repeat === 'none') return false;
  if (dateKey < event.date) return false;
  if (event.repeat === 'daily') return true;
  if (event.repeat === 'weekly') {
    return weekdayOf(event.date) === weekdayOf(dateKey);
  }
  // monthly — same day-of-month, falling back to the last day of shorter
  // months (e.g. an event created on the 31st still fires on Feb 28/29)
  const candidate = parseDateKey(dateKey);
  const eventDay = parseDateKey(event.date).getDate();
  const daysInCandidateMonth = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
  return candidate.getDate() === Math.min(eventDay, daysInCandidateMonth);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getOccurrencesForDate(dateKey: string): Promise<Occurrence[]> {
  const [events, statusMap] = await Promise.all([getEvents(), getStatusMap()]);
  return occurrencesForDateSync(events, statusMap, dateKey);
}

export function occurrencesForDateSync(
  events: CalendarEvent[],
  statusMap: StatusMap,
  dateKey: string,
): Occurrence[] {
  const occs: Occurrence[] = [];
  for (const event of events) {
    if (!occursOn(event, dateKey)) continue;
    occs.push({
      event,
      dateKey,
      start: event.start,
      end: event.end,
      status: statusMap[statusKeyFor(event.id, dateKey)] ?? 'pending',
    });
  }
  // Timed first sorted by start, then flexible
  occs.sort((a, b) => {
    if (a.start === null && b.start === null) return 0;
    if (a.start === null) return 1;
    if (b.start === null) return -1;
    return a.start - b.start;
  });
  return occs;
}

/** Which dates in [startKey, endKey] have at least one occurrence — for calendar dots */
export function datesWithEvents(
  events: CalendarEvent[],
  startKey: string,
  endKey: string,
): Set<string> {
  const result = new Set<string>();
  let key = startKey;
  // Bounded loop — a month view is at most 42 days
  for (let i = 0; i < 60 && key <= endKey; i++) {
    if (events.some((e) => occursOn(e, key))) result.add(key);
    key = addDaysKey(key, 1);
  }
  return result;
}

/** Occurrence count per date in [startKey, endKey] — for calendar density dots */
export function eventCountsInRange(
  events: CalendarEvent[],
  startKey: string,
  endKey: string,
): Record<string, number> {
  const result: Record<string, number> = {};
  let key = startKey;
  for (let i = 0; i < 60 && key <= endKey; i++) {
    let n = 0;
    for (const e of events) if (occursOn(e, key)) n++;
    if (n > 0) result[key] = n;
    key = addDaysKey(key, 1);
  }
  return result;
}

/** Total scheduled minutes on a date — for weekly density bars */
export function busyMinutesOn(events: CalendarEvent[], dateKey: string): number {
  let total = 0;
  for (const e of events) {
    if (!occursOn(e, dateKey)) continue;
    total += e.start !== null && e.end !== null ? e.end - e.start : e.durationMinutes;
  }
  return total;
}

// ─── Conflicts ────────────────────────────────────────────────────────────────

export interface Conflict {
  a: Occurrence;
  b: Occurrence;
}

export function findConflicts(occs: Occurrence[]): Conflict[] {
  const timed = occs.filter((o) => o.start !== null && o.end !== null);
  const conflicts: Conflict[] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], b = timed[j];
      if (a.start! < b.end! && b.start! < a.end!) {
        conflicts.push({ a, b });
      }
    }
  }
  return conflicts;
}

export function isConflicted(occ: Occurrence, conflicts: Conflict[]): boolean {
  return conflicts.some(
    (c) => c.a.event.id === occ.event.id || c.b.event.id === occ.event.id,
  );
}

// ─── Free slots ───────────────────────────────────────────────────────────────

/** Active planning window — 7 AM to 10 PM */
export const DAY_START = 7 * 60;
export const DAY_END = 22 * 60;

export interface FreeSlot {
  start: number;
  end: number;
}

export function findFreeSlots(occs: Occurrence[], minMinutes = 15): FreeSlot[] {
  const busy = occs
    .filter((o) => o.start !== null && o.end !== null && o.status !== 'skipped')
    .map((o) => ({ start: o.start!, end: o.end! }))
    .sort((x, y) => x.start - y.start);

  const slots: FreeSlot[] = [];
  let cursor = DAY_START;
  for (const b of busy) {
    if (b.start > cursor && b.start - cursor >= minMinutes) {
      slots.push({ start: cursor, end: Math.min(b.start, DAY_END) });
    }
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < DAY_END && DAY_END - cursor >= minMinutes) {
    slots.push({ start: cursor, end: DAY_END });
  }
  return slots;
}

export function totalFreeMinutes(occs: Occurrence[]): number {
  return findFreeSlots(occs).reduce((sum, s) => sum + (s.end - s.start), 0);
}
