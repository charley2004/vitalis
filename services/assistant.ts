import {
  CalendarEvent, getEvents, getStatusMap, occurrencesForDateSync,
  moveOccurrence, setOccurrenceStatus,
  addDaysKey, weekdayOf, fmtTime,
} from './calendar';
import { bestSlotFor } from './planner';
import { supabase, isSupabaseConfigured } from './supabase';
import { getTodayKey } from './storage';

// AI-backed assistant — Claude reads the schedule below and either answers
// directly or returns a structured action (a tool call keyed by the real
// event id + the occurrence's own date). The model never touches storage;
// every action is executed here through the same safe primitives the rest
// of Planner uses — moveOccurrence (so a recurring event's whole series
// can't get dragged by a "just this once" request) and bestSlotFor (so slot
// math stays deterministic instead of asking the model to compute times).

export interface AssistantReply {
  reply: string;
  /** true when the assistant modified the calendar (UI should refresh) */
  changed: boolean;
}

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

const CONTEXT_DAYS = 14;
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HISTORY_TURNS = 6;

type StatusMap = Record<string, 'completed' | 'skipped'>;

function buildScheduleContext(events: CalendarEvent[], statusMap: StatusMap, today: string): string {
  const lines: string[] = [`Today: ${today} (${WEEKDAY_ABBR[weekdayOf(today)]})`, '', `Upcoming schedule (next ${CONTEXT_DAYS} days):`];
  for (let i = 0; i < CONTEXT_DAYS; i++) {
    const dateKey = addDaysKey(today, i);
    const occs = occurrencesForDateSync(events, statusMap, dateKey);
    for (const occ of occs) {
      const time = occ.start !== null && occ.end !== null ? `${fmtTime(occ.start)}-${fmtTime(occ.end)}` : 'flexible';
      lines.push(
        `id:${occ.event.id} | ${occ.event.title} | ${WEEKDAY_ABBR[weekdayOf(dateKey)]} ${dateKey} | ${time} | ` +
        `repeat:${occ.event.repeat} | status:${occ.status} | priority:${occ.event.priority}`
      );
    }
  }
  if (lines.length === 3) lines.push('(nothing scheduled)');
  return lines.join('\n');
}

/** Parses a Claude-supplied "HH:MM" (24h) into a start/end pair using the
 *  event's existing duration, or null if the string isn't well-formed. */
function parseTimeOverride(toTime: string, event: CalendarEvent): { start: number; end: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(toTime.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const start = h * 60 + min;
  const duration = event.start !== null && event.end !== null ? event.end - event.start : event.durationMinutes;
  return { start, end: start + duration };
}

type Action =
  | { type: 'move'; eventId: string; fromDate: string; toDate: string; toTime?: string }
  | { type: 'find_slot'; eventId: string; fromDate: string; toDate: string }
  | { type: 'status'; eventId: string; date: string; status: 'completed' | 'skipped' };

async function applyAction(action: Action, events: CalendarEvent[], statusMap: StatusMap): Promise<string | null> {
  const event = events.find((e) => e.id === action.eventId);
  if (!event) return "Couldn't find one item to update — it may have changed since I last synced.";

  if (action.type === 'move') {
    const timeOverride = action.toTime ? parseTimeOverride(action.toTime, event) : undefined;
    await moveOccurrence(event.id, action.fromDate, action.toDate, timeOverride ?? undefined);
    return null;
  }

  if (action.type === 'find_slot') {
    const dayOccs = occurrencesForDateSync(events, statusMap, action.toDate).filter((o) => o.event.id !== event.id);
    const slot = bestSlotFor(event, dayOccs, action.toDate);
    if (!slot) return `Couldn't find a free slot for "${event.title}" that day.`;
    await moveOccurrence(event.id, action.fromDate, action.toDate, { start: slot.start, end: slot.end });
    return null;
  }

  if (action.type === 'status') {
    await setOccurrenceStatus(event.id, action.date, action.status);
    return null;
  }

  return null;
}

const MAX_ACTIONS = 8;

/** Applies every action from one turn in order, refetching state before
 *  each — so a later find_slot in the same batch sees the free time an
 *  earlier move in that batch just opened up, instead of working off a
 *  snapshot from before this turn's changes started landing. */
async function applyActions(actions: Action[]): Promise<{ appliedCount: number; problems: string[] }> {
  let appliedCount = 0;
  const problems: string[] = [];
  for (const action of actions.slice(0, MAX_ACTIONS)) {
    const [events, statusMap] = await Promise.all([getEvents(), getStatusMap()]);
    const problem = await applyAction(action, events, statusMap);
    if (problem) problems.push(problem);
    else appliedCount++;
  }
  return { appliedCount, problems };
}

export async function askAssistant(question: string, history: AssistantTurn[] = []): Promise<AssistantReply> {
  const trimmed = question.trim();
  if (!trimmed) {
    return { reply: 'Ask me about your schedule — e.g. "What do I have tomorrow?" or "Move my gym session to Friday at 3pm."', changed: false };
  }

  if (!isSupabaseConfigured || !supabase) {
    return { reply: 'The assistant needs cloud sync configured first (Settings → Account & Sync).', changed: false };
  }
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return { reply: 'Sign in (Settings → Account & Sync) to use the assistant.', changed: false };
  }

  try {
    const [events, statusMap] = await Promise.all([getEvents(), getStatusMap()]);
    const today = getTodayKey();
    const context = buildScheduleContext(events, statusMap, today);

    const { data, error } = await supabase.functions.invoke('planner-assistant', {
      body: { context, question: trimmed, history: history.slice(-HISTORY_TURNS) },
    });
    if (error) return { reply: error.message ?? 'The assistant request failed.', changed: false };
    if (data?.error) return { reply: data.error as string, changed: false };

    const reply = (data?.reply as string) ?? 'Done.';
    const actions = (data?.actions as Action[] | null | undefined) ?? [];
    if (actions.length === 0) return { reply, changed: false };

    const { appliedCount, problems } = await applyActions(actions);
    const suffix = problems.length > 0 ? `\n\n(${problems.join(' ')})` : '';
    return { reply: `${reply}${suffix}`, changed: appliedCount > 0 };
  } catch (e) {
    return { reply: e instanceof Error ? e.message : 'The assistant request failed.', changed: false };
  }
}
