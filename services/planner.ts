import {
  CalendarEvent, EventCategory, Occurrence, FreeSlot, Conflict,
  findConflicts, findFreeSlots, totalFreeMinutes,
  fmtTime, fmtDuration, fmtDateHuman, isWeekend,
  getEvents, getStatusMap, occurrencesForDateSync,
  DAY_START, DAY_END,
} from './calendar';
import {
  getTodayKey, getRoutineConfig, getRoutineStates, getRoutineCompletionTimes, formatDateKey,
  type RoutineDefinition,
} from './storage';

// ─── Energy model ─────────────────────────────────────────────────────────────
// Each category has a drain level (how much it depletes you) and a kind.
// The planner uses this to avoid stacking demanding activities back-to-back
// and to pick recovery-friendly orderings.

export type EnergyKind = 'mental' | 'physical' | 'light';

interface EnergyProfile {
  drain: 0 | 1 | 2;       // 0 = restful/neutral, 2 = heavily draining
  kind: EnergyKind;
  /** Preferred windows [startMin, endMin] when this activity lands best */
  preferred: [number, number][];
  /** Hard window the activity must fit inside, if any (e.g. bank hours) */
  mustFit?: [number, number];
}

const ENERGY: Record<EventCategory, EnergyProfile> = {
  EXAM:     { drain: 2, kind: 'mental',   preferred: [[8 * 60, 15 * 60]] },
  STUDY:    { drain: 2, kind: 'mental',   preferred: [[9 * 60, 12 * 60], [17 * 60, 21 * 60]] },
  WORK:     { drain: 1, kind: 'mental',   preferred: [[9 * 60, 17 * 60]] },
  MEETING:  { drain: 1, kind: 'mental',   preferred: [[9 * 60, 17 * 60]] },
  GYM:      { drain: 2, kind: 'physical', preferred: [[13 * 60, 19 * 60]] },
  HEALTH:   { drain: 1, kind: 'light',    preferred: [[8 * 60, 17 * 60]] },
  FINANCE:  { drain: 1, kind: 'light',    preferred: [[9 * 60, 14 * 60]], mustFit: [9 * 60, 15 * 60] },
  PERSONAL: { drain: 0, kind: 'light',    preferred: [[10 * 60, 21 * 60]] },
  SOCIAL:   { drain: 1, kind: 'light',    preferred: [[12 * 60, 22 * 60]] },
  OTHER:    { drain: 0, kind: 'light',    preferred: [[9 * 60, 21 * 60]] },
};

export function energyOf(category: EventCategory): EnergyProfile {
  return ENERGY[category];
}

/** Minimum recovery break (minutes) recommended after an occurrence */
function recoveryAfter(occ: Occurrence): number {
  const e = ENERGY[occ.event.category];
  const duration = occ.start !== null && occ.end !== null ? occ.end - occ.start : occ.event.durationMinutes;
  if (e.drain === 2 && duration >= 120) return 45;
  if (e.drain === 2) return 30;
  if (e.drain === 1 && duration >= 180) return 30;
  return 0;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export type TimelineItem =
  | { type: 'event'; occ: Occurrence; conflicted: boolean }
  | { type: 'gap'; start: number; end: number };

export interface DayPlan {
  timeline: TimelineItem[];
  flexible: Occurrence[];       // events with no fixed time yet
  conflicts: Conflict[];
  freeMinutes: number;
}

export function buildDayPlan(occs: Occurrence[]): DayPlan {
  const conflicts = findConflicts(occs);
  const timed = occs.filter((o) => o.start !== null && o.end !== null);
  const flexible = occs.filter((o) => o.start === null);

  const timeline: TimelineItem[] = [];
  let cursor: number | null = null;
  for (const occ of timed) {
    if (cursor !== null && occ.start! - cursor >= 30) {
      timeline.push({ type: 'gap', start: cursor, end: occ.start! });
    }
    timeline.push({
      type: 'event',
      occ,
      conflicted: conflicts.some((c) => c.a === occ || c.b === occ),
    });
    cursor = cursor === null ? occ.end! : Math.max(cursor, occ.end!);
  }

  return { timeline, flexible, conflicts, freeMinutes: totalFreeMinutes(occs) };
}

// ─── Unified agenda (Routine habits + Planner events, one timeline) ──────────
//
// Routine and Planner are separate systems with separate storage — this is
// the bridge. Planner events are fixed commitments and always win a time
// slot; Routine habits carry a soft "preferred time" that this scheduler
// shifts around real commitments rather than flagging as a conflict.

const SLOT_BOUNDS: Record<RoutineDefinition['slot'], [number, number]> = {
  MORNING: [5 * 60, 11 * 60],
  NOON:    [11 * 60, 17 * 60],
  NIGHT:   [17 * 60, 23 * 60],
};

export interface RoutineOccurrence {
  kind: 'routine';
  routine: RoutineDefinition;
  start: number;
  end: number;
  completed: boolean;
  /** Intentionally excused for this date — see setRoutineSkipped(). Neither
   *  completed nor a plain miss; excluded from score/streak either way. */
  skipped: boolean;
  /** True when the AI moved this habit off its preferred time to avoid a clash */
  shifted: boolean;
  /** Real clock time (minutes since midnight) this was actually checked off,
   *  if done today and recorded. Null if not completed or not recorded. */
  completedAtMinutes: number | null;
  /** completedAtMinutes - routine.preferredTime. Positive = later than
   *  planned, negative = earlier. Null if not completed or no preferredTime. */
  lateBy: number | null;
}

export interface PlannerOccurrence {
  kind: 'planner';
  occ: Occurrence;
  conflicted: boolean;
}

export type AgendaItem = RoutineOccurrence | PlannerOccurrence;

export type AgendaEntry =
  | { type: 'item'; item: AgendaItem }
  | { type: 'gap'; start: number; end: number };

export interface UnifiedAgenda {
  timeline: AgendaEntry[];
  flexible: Occurrence[];   // Planner events with no fixed time yet
  conflicts: Conflict[];    // Planner-vs-Planner conflicts only
  freeMinutes: number;
  /** The next item at or after "now" today, for the Today screen's summary card */
  nextItem: AgendaItem | null;
}

function placeRoutines(
  routines: RoutineDefinition[],
  states: Record<string, string>,
  completionTimes: Record<string, string>,
  dateKey: string,
  busy: { start: number; end: number }[],
): RoutineOccurrence[] {
  const enabled = routines.filter((r) => r.enabled !== false && r.preferredTime !== undefined);
  const sorted = [...enabled].sort((a, b) => a.preferredTime! - b.preferredTime!);
  const placed: RoutineOccurrence[] = [];

  const overlapsAny = (start: number, end: number) =>
    busy.some((b) => start < b.end && b.start < end) ||
    placed.some((p) => start < p.end && p.start < end);

  for (const r of sorted) {
    const duration = r.durationMinutes ?? 5;
    const bounds = SLOT_BOUNDS[r.slot];
    let start = r.preferredTime!;
    let shifted = false;

    if (overlapsAny(start, start + duration)) {
      let found = false;
      for (let delta = 15; delta <= 240 && !found; delta += 15) {
        for (const dir of [1, -1]) {
          const candidate = start + dir * delta;
          if (candidate < bounds[0] || candidate + duration > bounds[1]) continue;
          if (!overlapsAny(candidate, candidate + duration)) { start = candidate; found = true; break; }
        }
      }
      // Only report a real move. If no gap exists anywhere in the slot, keep
      // the original preferred time — it'll visually sit alongside the
      // Planner event rather than vanish — but don't claim it was shifted.
      shifted = found;
    }

    const completed = states[r.id] === 'hit';
    const skipped = states[r.id] === 'skipped';
    let completedAtMinutes: number | null = null;
    let lateBy: number | null = null;
    const completedIso = completionTimes[r.id];
    if (completed && completedIso) {
      const completedDate = new Date(completedIso);
      // Guard against a stale timestamp left over from a different day.
      if (formatDateKey(completedDate) === dateKey) {
        completedAtMinutes = completedDate.getHours() * 60 + completedDate.getMinutes();
        if (r.preferredTime !== undefined) lateBy = completedAtMinutes - r.preferredTime;
      }
    }

    placed.push({
      kind: 'routine', routine: r, start, end: start + duration,
      completed, skipped, shifted, completedAtMinutes, lateBy,
    });
  }

  return placed;
}

export function buildUnifiedAgenda(
  routines: RoutineDefinition[],
  routineStates: Record<string, string>,
  occs: Occurrence[],
  completionTimes: Record<string, string> = {},
  dateKey: string = getTodayKey(),
): UnifiedAgenda {
  const timedPlanner = occs.filter((o) => o.start !== null && o.end !== null && o.status !== 'skipped');
  const flexible = occs.filter((o) => o.start === null);
  const conflicts = findConflicts(occs);

  const busy = timedPlanner.map((o) => ({ start: o.start!, end: o.end! }));
  const routineItems = placeRoutines(routines, routineStates, completionTimes, dateKey, busy);

  interface Merged { start: number; end: number; item: AgendaItem }
  const merged: Merged[] = [
    ...timedPlanner.map((o): Merged => ({
      start: o.start!, end: o.end!,
      item: { kind: 'planner', occ: o, conflicted: conflicts.some((c) => c.a === o || c.b === o) },
    })),
    ...routineItems.map((ri): Merged => ({ start: ri.start, end: ri.end, item: ri })),
  ].sort((a, b) => a.start - b.start);

  const timeline: AgendaEntry[] = [];
  let cursor: number | null = null;
  for (const m of merged) {
    if (cursor !== null && m.start - cursor >= 20) {
      timeline.push({ type: 'gap', start: cursor, end: m.start });
    }
    timeline.push({ type: 'item', item: m.item });
    cursor = cursor === null ? m.end : Math.max(cursor, m.end);
  }

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const nextItem = merged.find((m) => m.end > nowMinutes)?.item ?? null;

  return {
    timeline, flexible, conflicts,
    freeMinutes: totalFreeMinutes(occs),
    nextItem,
  };
}

/** Fetches routines + today's habit states + Planner occurrences and merges them */
export async function loadUnifiedAgenda(dateKey: string): Promise<UnifiedAgenda> {
  const [events, statusMap, routines, routineStates, completionTimes] = await Promise.all([
    getEvents(), getStatusMap(), getRoutineConfig(), getRoutineStates(dateKey), getRoutineCompletionTimes(dateKey),
  ]);
  const occs = occurrencesForDateSync(events, statusMap, dateKey);
  return buildUnifiedAgenda(routines, routineStates, occs, completionTimes, dateKey);
}

/**
 * Explains the whole day's schedule — priorities, breaks, available time,
 * and routine consistency — rather than surfacing a single isolated tip.
 */
export function buildDayNarrative(agenda: UnifiedAgenda, occs: Occurrence[]): string {
  const plannerCount = agenda.timeline.filter((t) => t.type === 'item' && t.item.kind === 'planner').length;
  const routineItems = agenda.timeline.filter((t): t is { type: 'item'; item: RoutineOccurrence } => t.type === 'item' && t.item.kind === 'routine');
  const routineCount = routineItems.length;

  if (plannerCount === 0 && routineCount === 0) {
    return "Nothing scheduled yet — add an event in Planner or complete a routine to get today's agenda going.";
  }

  const parts: string[] = [];
  parts.push(
    `Today blends ${plannerCount} planner event${plannerCount !== 1 ? 's' : ''} with ${routineCount} routine${routineCount !== 1 ? 's' : ''}.`,
  );

  const heavy = occs.filter((o) => o.start !== null && ENERGY[o.event.category].drain === 2);
  if (heavy.length > 0) {
    parts.push(`${heavy.length} demanding block${heavy.length !== 1 ? 's are' : ' is'} on the schedule, so recovery gaps are placed around ${heavy.length !== 1 ? 'them' : 'it'}.`);
  }

  const highPriorityPending = occs.filter((o) => o.event.priority === 'high' && o.status === 'pending').length;
  if (highPriorityPending > 0) {
    parts.push(`${highPriorityPending} high-priority item${highPriorityPending !== 1 ? 's' : ''} still need${highPriorityPending === 1 ? 's' : ''} attention.`);
  }

  const shiftedCount = routineItems.filter((t) => t.item.shifted).length;
  if (shiftedCount > 0) {
    parts.push(`${shiftedCount} routine${shiftedCount !== 1 ? 's were' : ' was'} moved from ${shiftedCount !== 1 ? 'their' : 'its'} usual time to fit around fixed commitments.`);
  }

  const completedRoutines = routineItems.filter((t) => t.item.completed).length;
  if (routineCount > 0) {
    parts.push(`${completedRoutines}/${routineCount} routines done so far — consistency is what compounds over time.`);
  }

  // Time-drift: how far actual completion times landed from their preferred
  // times, using the real clock time recorded when each routine was checked
  // off (not just whether it happened at all).
  const timedRoutines = routineItems.filter((t) => t.item.lateBy !== null);
  const lateRoutines = timedRoutines.filter((t) => t.item.lateBy! > 15);
  if (lateRoutines.length > 0) {
    const totalLate = lateRoutines.reduce((sum, t) => sum + t.item.lateBy!, 0);
    const worst = lateRoutines.reduce((a, b) => (b.item.lateBy! > a.item.lateBy! ? b : a));
    if (lateRoutines.length === 1) {
      parts.push(`${worst.item.routine.label} happened ${fmtDuration(worst.item.lateBy!)} later than planned.`);
    } else {
      parts.push(`You're running about ${fmtDuration(totalLate)} behind schedule today — ${worst.item.routine.label} slipped the most, by ${fmtDuration(worst.item.lateBy!)}.`);
    }
  } else if (timedRoutines.length >= 2) {
    parts.push(`Every completed routine has landed close to its planned time today.`);
  }

  if (agenda.freeMinutes > 0) {
    parts.push(`${fmtDuration(agenda.freeMinutes)} of free time remains for anything flexible.`);
  }

  return parts.join(' ');
}

// ─── Best-slot finder ─────────────────────────────────────────────────────────

export interface SlotSuggestion {
  start: number;
  end: number;
  reason: string;
}

/**
 * Score candidate start times inside free slots for a flexible event.
 * Considers: preferred windows, hard windows (bank hours), energy recovery
 * after draining events, and earlier-is-better as a tiebreak.
 */
export function bestSlotFor(
  event: CalendarEvent,
  occs: Occurrence[],
  dateKey: string,
): SlotSuggestion | null {
  const profile = ENERGY[event.category];
  const duration = event.durationMinutes;
  const others = occs.filter((o) => o.event.id !== event.id);
  const slots = findFreeSlots(others, duration);

  let best: { start: number; score: number; afterOcc: Occurrence | null } | null = null;

  for (const slot of slots) {
    // Try starts every 30 min within the slot
    for (let start = slot.start; start + duration <= slot.end; start += 30) {
      const end = start + duration;

      if (profile.mustFit && (start < profile.mustFit[0] || end > profile.mustFit[1])) continue;
      if (event.category === 'FINANCE' && isWeekend(dateKey)) continue; // banks closed

      let score = 0;

      // Preferred window bonus
      for (const [ps, pe] of profile.preferred) {
        if (start >= ps && end <= pe) { score += 40; break; }
        if (start < pe && ps < end) { score += 15; break; } // partial overlap
      }

      // Energy: find the timed occurrence immediately before this start
      let prev: Occurrence | null = null;
      for (const o of others) {
        if (o.end !== null && o.end <= start && (prev === null || o.end > prev.end!)) prev = o;
      }
      if (prev) {
        const needed = recoveryAfter(prev);
        const gap = start - prev.end!;
        if (needed > 0 && gap < needed) {
          score -= 50; // too soon after a draining activity
        } else if (needed > 0 && gap >= needed && gap <= needed + 60) {
          score += 20; // ideal: recovered but not wasting the day
        }
        // Variety bonus: physical after mental (and vice versa) aids recovery
        const prevKind = ENERGY[prev.event.category].kind;
        if (profile.drain === 2 && prevKind !== profile.kind && ENERGY[prev.event.category].drain === 2) {
          score += 10;
        }
        // Penalty: two heavy mental blocks back-to-back (exam then study)
        if (profile.kind === 'mental' && profile.drain === 2 &&
            prevKind === 'mental' && ENERGY[prev.event.category].drain === 2 && start - prev.end! < 90) {
          score -= 30;
        }
      }

      // Earlier is (slightly) better — don't push everything to night
      score -= (start - DAY_START) / 60;

      if (!best || score > best.score) best = { start, score, afterOcc: prev };
    }
  }

  if (!best) return null;

  const start = best.start;
  const end = start + duration;
  let reason = `Fits your free time at ${fmtTime(start)}`;
  if (best.afterOcc) {
    const prevTitle = best.afterOcc.event.title;
    const needed = recoveryAfter(best.afterOcc);
    if (needed > 0) {
      reason = `You finish ${prevTitle} at ${fmtTime(best.afterOcc.end!)} — this leaves time to recover before starting at ${fmtTime(start)}`;
    } else {
      reason = `Right after ${prevTitle} works well — starts ${fmtTime(start)}`;
    }
  }
  if (event.category === 'FINANCE') {
    reason += ' (within banking hours)';
  }
  if (event.category === 'GYM') {
    reason += ' — gyms are usually quieter early afternoon';
  }

  return { start, end, reason };
}

// ─── Smart suggestions ────────────────────────────────────────────────────────

export interface Suggestion {
  text: string;
  /** When set, the UI can offer an APPLY button that schedules the event */
  apply?: { eventId: string; start: number; end: number };
  severity: 'warn' | 'tip';
}

export function getSuggestions(occs: Occurrence[], dateKey: string): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const plan = buildDayPlan(occs);

  // 1. Conflicts
  for (const c of plan.conflicts) {
    suggestions.push({
      severity: 'warn',
      text: `"${c.a.event.title}" overlaps with "${c.b.event.title}" (${fmtTime(Math.max(c.a.start!, c.b.start!))}–${fmtTime(Math.min(c.a.end!, c.b.end!))}). Consider rescheduling one of them.`,
    });
  }

  // 2. Missing recovery breaks between draining back-to-back events
  const timed = occs.filter((o) => o.start !== null && o.end !== null);
  for (let i = 0; i < timed.length - 1; i++) {
    const cur = timed[i], next = timed[i + 1];
    const needed = recoveryAfter(cur);
    const gap = next.start! - cur.end!;
    if (needed > 0 && gap >= 0 && gap < needed) {
      const nextProfile = ENERGY[next.event.category];
      if (nextProfile.drain >= 1) {
        suggestions.push({
          severity: 'warn',
          text: `${cur.event.title} is demanding — a ${needed}-minute break before ${next.event.title} would help you perform better. Right now there's only ${gap === 0 ? 'no gap' : fmtDuration(gap)}.`,
        });
      }
    }
  }

  // 3. Slot suggestions for flexible (unscheduled) events
  for (const flex of plan.flexible) {
    if (flex.status !== 'pending') continue;
    const slot = bestSlotFor(flex.event, occs, dateKey);
    if (slot) {
      suggestions.push({
        severity: 'tip',
        text: `${flex.event.title}: best time is ${fmtTime(slot.start)}–${fmtTime(slot.end)}. ${slot.reason}.`,
        apply: { eventId: flex.event.id, start: slot.start, end: slot.end },
      });
    } else {
      suggestions.push({
        severity: 'warn',
        text: `${flex.event.title} (${fmtDuration(flex.event.durationMinutes)}) doesn't fit in today's remaining free time. Consider moving it to another day.`,
      });
    }
  }

  // 4. Heavy day warning
  const heavyMinutes = timed
    .filter((o) => ENERGY[o.event.category].drain === 2)
    .reduce((sum, o) => sum + (o.end! - o.start!), 0);
  if (heavyMinutes >= 5 * 60) {
    suggestions.push({
      severity: 'tip',
      text: `This is a heavy day (${fmtDuration(heavyMinutes)} of demanding activities). Protect your sleep tonight and keep meals light and regular.`,
    });
  }

  return suggestions;
}

// ─── Daily agenda ─────────────────────────────────────────────────────────────

export function agendaGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export interface Agenda {
  greeting: string;
  lines: string[];
  freeSummary: string;
}

export function buildAgenda(occs: Occurrence[]): Agenda {
  const active = occs.filter((o) => o.status !== 'skipped');
  const lines = active.map((o) => {
    const time = o.start !== null
      ? `${fmtTime(o.start)}${o.end !== null ? ` – ${fmtTime(o.end)}` : ''}`
      : 'flexible';
    return `${o.event.title} (${time})`;
  });
  const free = totalFreeMinutes(active);
  const freeSummary = active.length === 0
    ? 'Your day is completely free.'
    : `You have approximately ${fmtDuration(free)} of free time between activities.`;
  return { greeting: agendaGreeting(), lines, freeSummary };
}

// ─── Completion stats ─────────────────────────────────────────────────────────

export interface ProductivityStats {
  completed: number;
  skipped: number;
  missed: number;   // past events left pending
  ratePercent: number; // completed / (completed + skipped + missed)
}

export async function getProductivityStats(days = 30): Promise<ProductivityStats> {
  const [events, statusMap] = await Promise.all([getEvents(), getStatusMap()]);
  const today = getTodayKey();
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  let completed = 0, skipped = 0, missed = 0;
  let key = today;
  for (let i = 0; i < days; i++) {
    const occs = occurrencesForDateSync(events, statusMap, key);
    for (const o of occs) {
      const isPast = key < today || (key === today && o.end !== null && o.end < nowMinutes);
      if (o.status === 'completed') completed++;
      else if (o.status === 'skipped') skipped++;
      else if (isPast) missed++;
    }
    key = addDaysBack(key);
  }

  const total = completed + skipped + missed;
  return {
    completed, skipped, missed,
    ratePercent: total === 0 ? 100 : Math.round((completed / total) * 100),
  };
}

function addDaysBack(key: string): string {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Convenience loader ───────────────────────────────────────────────────────

export async function loadDay(dateKey: string): Promise<{
  occs: Occurrence[];
  plan: DayPlan;
  suggestions: Suggestion[];
  agenda: Agenda;
  unified: UnifiedAgenda;
  narrative: string;
}> {
  const [events, statusMap, routines, routineStates, completionTimes] = await Promise.all([
    getEvents(), getStatusMap(), getRoutineConfig(), getRoutineStates(dateKey), getRoutineCompletionTimes(dateKey),
  ]);
  const occs = occurrencesForDateSync(events, statusMap, dateKey);
  const unified = buildUnifiedAgenda(routines, routineStates, occs, completionTimes, dateKey);
  return {
    occs,
    plan: buildDayPlan(occs),
    suggestions: getSuggestions(occs, dateKey),
    agenda: buildAgenda(occs),
    unified,
    narrative: buildDayNarrative(unified, occs),
  };
}

export { fmtTime, fmtDuration, fmtDateHuman };
