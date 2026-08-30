import {
  CalendarEvent, Occurrence, EVENT_CATEGORIES, EventCategory,
  getEvents, getStatusMap, occurrencesForDateSync, upsertEvent, moveOccurrence,
  addDaysKey, weekdayOf, fmtTime, fmtDuration, fmtDateHuman, findFreeSlots,
} from './calendar';
import { bestSlotFor } from './planner';
import { getTodayKey } from './storage';

// Rule-based assistant: parses common scheduling questions and commands.
// Runs entirely on-device — no network, no API key.

export interface AssistantReply {
  reply: string;
  /** true when the assistant modified the calendar (UI should refresh) */
  changed: boolean;
}

// ─── Date & time word parsing ─────────────────────────────────────────────────

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function resolveDateWord(text: string): string | null {
  const today = getTodayKey();
  if (/\btoday\b/.test(text)) return today;
  if (/\btomorrow\b/.test(text)) return addDaysKey(today, 1);
  if (/\byesterday\b/.test(text)) return addDaysKey(today, -1);
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(text)) {
      // Next occurrence of that weekday (1–7 days ahead)
      const todayWd = weekdayOf(today);
      let delta = (i - todayWd + 7) % 7;
      if (delta === 0) delta = 7;
      return addDaysKey(today, delta);
    }
  }
  return null;
}

function parseTimeWord(text: string): number | null {
  // "3pm", "3 pm", "15:00", "9:30am"
  const m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const period = m[3];
  if (period === 'pm' && h < 12) h += 12;
  if (period === 'am' && h === 12) h = 0;
  if (!period && h <= 7) h += 12; // "at 3" almost always means 3 PM
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// ─── Event lookup ─────────────────────────────────────────────────────────────

function matchCategory(text: string): EventCategory | null {
  for (const cat of EVENT_CATEGORIES) {
    if (text.includes(cat.toLowerCase())) return cat;
  }
  if (/\bwork ?out|training\b/.test(text)) return 'GYM';
  if (/\bbank\b/.test(text)) return 'FINANCE';
  if (/\bdoctor|dentist|appointment\b/.test(text)) return 'HEALTH';
  if (/\bclass|lecture\b/.test(text)) return 'STUDY';
  return null;
}

function findEventByText(events: CalendarEvent[], text: string): CalendarEvent | null {
  // Try full title containment first, then word overlap
  const lower = text.toLowerCase();
  let match = events.find((e) => lower.includes(e.title.toLowerCase()));
  if (match) return match;

  const cat = matchCategory(lower);
  if (cat) {
    match = events.find((e) => e.category === cat);
    if (match) return match;
  }

  const words = lower.split(/\s+/).filter((w) => w.length >= 4);
  let best: { event: CalendarEvent; hits: number } | null = null;
  for (const e of events) {
    const titleWords = e.title.toLowerCase().split(/\s+/);
    const hits = titleWords.filter((tw) => words.includes(tw)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { event: e, hits };
  }
  return best?.event ?? null;
}

/** Which date's instance a chat "move X to Friday" command should act on —
 *  the event's own date for a one-off event, or the nearest not-yet-resolved
 *  occurrence (today or later) for a recurring one, within the next 60 days. */
function nearestPendingOccurrenceDate(
  events: CalendarEvent[],
  statusMap: Record<string, 'completed' | 'skipped'>,
  event: CalendarEvent,
  today: string,
): string {
  if (event.repeat === 'none') return event.date;
  for (let i = 0; i < 60; i++) {
    const key = addDaysKey(today, i);
    const occ = occurrencesForDateSync([event], statusMap, key)[0];
    if (occ && occ.status === 'pending') return key;
  }
  return today;
}

function describeDay(occs: Occurrence[], dateKey: string): string {
  const active = occs.filter((o) => o.status !== 'skipped');
  if (active.length === 0) return `Nothing scheduled for ${fmtDateHuman(dateKey)}. The day is free.`;
  const lines = active.map((o) => {
    const time = o.start !== null
      ? `${fmtTime(o.start)}${o.end !== null ? `–${fmtTime(o.end)}` : ''}`
      : 'flexible';
    return `• ${o.event.title} (${time})`;
  });
  return `${fmtDateHuman(dateKey)}:\n${lines.join('\n')}`;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function askAssistant(rawInput: string): Promise<AssistantReply> {
  const text = rawInput.trim().toLowerCase();
  if (!text) return { reply: 'Ask me about your schedule — e.g. "What do I have tomorrow?"', changed: false };

  const [events, statusMap] = await Promise.all([getEvents(), getStatusMap()]);
  const today = getTodayKey();

  // ── Reschedule / move commands ──────────────────────────────────────────────
  if (/\b(reschedule|move|shift|postpone)\b/.test(text)) {
    const event = findEventByText(events, text);
    if (!event) {
      return { reply: "I couldn't find that event. Try using its exact title.", changed: false };
    }

    const targetDate = resolveDateWord(text);
    // Strip the event title before parsing time so digits in titles don't confuse it
    const timePart = text.replace(event.title.toLowerCase(), '');
    // A command can legitimately contain "at" twice (e.g. "move X at 9am to
    // Friday at 3pm") — the intended target time is the LAST "at", not the
    // first, since the original time is usually mentioned before the new one.
    const atSegments = timePart.split(/\bat\b/);
    const targetTime = atSegments.length > 1 ? parseTimeWord(atSegments[atSegments.length - 1]) : null;

    if (!targetDate && targetTime === null) {
      // No explicit target — pick the best free slot on its current date
      const occs = occurrencesForDateSync(events, statusMap, event.date)
        .filter((o) => o.event.id !== event.id);
      const slot = bestSlotFor(event, occs, event.date);
      if (!slot) {
        return { reply: `I couldn't find a free slot for "${event.title}" on ${fmtDateHuman(event.date)}. Try naming a day: "move ${event.title} to Friday".`, changed: false };
      }
      await upsertEvent({ ...event, start: slot.start, end: slot.end });
      return { reply: `Moved "${event.title}" to ${fmtTime(slot.start)}–${fmtTime(slot.end)}. ${slot.reason}.`, changed: true };
    }

    const timeOverride = targetTime !== null
      ? {
          start: targetTime,
          end: targetTime + (event.end !== null && event.start !== null ? event.end - event.start : event.durationMinutes),
        }
      : undefined;

    if (!targetDate) {
      // Time-only change, same day — a direct, safe edit regardless of repeat.
      await upsertEvent({ ...event, start: timeOverride!.start, end: timeOverride!.end });
      return { reply: `Done — "${event.title}" is now at ${fmtTime(timeOverride!.start!)}.`, changed: true };
    }

    // Moving to a different day — for a recurring event this must not drag
    // every other occurrence along with it (see moveOccurrence()).
    const fromDateKey = nearestPendingOccurrenceDate(events, statusMap, event, today);
    const moved = await moveOccurrence(event.id, fromDateKey, targetDate, timeOverride);
    if (!moved) {
      return { reply: `I couldn't move "${event.title}".`, changed: false };
    }
    return { reply: `Done — "${event.title}" is now on ${fmtDateHuman(targetDate)}${moved.start !== null ? ` at ${fmtTime(moved.start)}` : ''}.`, changed: true };
  }

  // ── "When is my next X?" ────────────────────────────────────────────────────
  if (/\b(when|next)\b/.test(text)) {
    const cat = matchCategory(text);
    const byTitle = findEventByText(events, text);
    const candidates = events.filter((e) =>
      (cat && e.category === cat) || (byTitle && e.id === byTitle.id));
    const pool = candidates.length > 0 ? candidates : (byTitle ? [byTitle] : []);

    if (pool.length > 0) {
      // Scan the next 60 days for the earliest occurrence
      for (let i = 0; i < 60; i++) {
        const key = addDaysKey(today, i);
        const occs = occurrencesForDateSync(pool, statusMap, key)
          .filter((o) => o.status === 'pending');
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        const upcoming = occs.find((o) => i > 0 || o.start === null || o.start >= nowMin);
        if (upcoming) {
          const when = upcoming.start !== null ? ` at ${fmtTime(upcoming.start)}` : '';
          return {
            reply: `Your next ${upcoming.event.title} is ${i === 0 ? 'today' : i === 1 ? 'tomorrow' : fmtDateHuman(key)}${when}.`,
            changed: false,
          };
        }
      }
      return { reply: `Nothing matching that is scheduled in the next 60 days.`, changed: false };
    }
  }

  // ── Free time questions ─────────────────────────────────────────────────────
  if (/\bfree\b/.test(text)) {
    const dateKey = resolveDateWord(text) ?? today;
    const occs = occurrencesForDateSync(events, statusMap, dateKey);
    let slots = findFreeSlots(occs, 30);

    if (/\bafternoon\b/.test(text)) slots = slots.filter((s) => s.end > 12 * 60 && s.start < 18 * 60);
    if (/\bmorning\b/.test(text)) slots = slots.filter((s) => s.start < 12 * 60);
    if (/\bevening|tonight\b/.test(text)) slots = slots.filter((s) => s.end > 17 * 60);

    if (slots.length === 0) {
      return { reply: `No meaningful free time ${dateKey === today ? 'today' : `on ${fmtDateHuman(dateKey)}`} in that period — your schedule is full.`, changed: false };
    }
    const total = slots.reduce((sum, s) => sum + (s.end - s.start), 0);
    const list = slots.slice(0, 4).map((s) => `${fmtTime(s.start)}–${fmtTime(s.end)}`).join(', ');
    return { reply: `Yes — about ${fmtDuration(total)} free: ${list}.`, changed: false };
  }

  // ── "What do I have <day>?" / agenda ────────────────────────────────────────
  const dateKey = resolveDateWord(text);
  if (dateKey || /\bwhat\b|\bhave\b|\bschedule\b|\bagenda\b|\bplan\b/.test(text)) {
    const key = dateKey ?? today;
    const occs = occurrencesForDateSync(events, statusMap, key);
    return { reply: describeDay(occs, key), changed: false };
  }

  return {
    reply: 'I can answer things like:\n• "What do I have tomorrow?"\n• "When is my next exam?"\n• "Do I have free time this afternoon?"\n• "Move my gym session to Friday at 3pm"',
    changed: false,
  };
}
