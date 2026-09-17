import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import {
  getSettings, getRoutineConfig, saveRoutineConfig, getRoutineStates, getRoutineCompletionTimes,
  getLast7DayKeys, getLastNDayKeys, getWeekKey, getDayAbbr, formatDateKey, calcScore, countRoutineHitsAndSkips, getWorkoutSession, KEYS,
  getTodayKey, getRoutineTimeOverrides, setRoutineTimeOverride, effectivePreferredTime, setRoutineSkipped,
  type RoutineDefinition,
} from './storage';
import { fmtTime, fmtDuration } from './calendar';
import { syncReminders } from './reminders';
import {
  getFitnessGoal, saveFitnessGoal, getFitnessProgram, saveFitnessProgram, newFitnessId, resolveExercise,
  type FitnessGoal, type FitnessProgram, type SplitDay, type ProgramExercise,
} from './fitness';
import type { BodyPart } from './exercises';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ROUTINE_ICON_CHOICES = [
  'bolt', 'flame', 'snowflake', 'moon', 'sunrise', 'droplet', 'dumbbell',
  'scale', 'runner', 'lotus', 'pen', 'coffee', 'bowl', 'signal', 'brain', 'bell', 'shield',
];

function fmtTimeHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "HH:MM" (24h) -> minutes since midnight, or null if malformed. */
function parseHHMM(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Compact plain-text snapshot of the same data Growth's CoachSection rule-based
 * insights already compute — routine timing/lateness, hydration, movement,
 * sleep, streak, and a 7-day trend — plus the routine catalog and any active
 * fitness goal/program, kept small on purpose to stay cheap per request.
 */
async function buildCoachContext(): Promise<string> {
  const [settings, routineConfig] = await Promise.all([getSettings(), getRoutineConfig()]);
  const enabledRoutines = routineConfig.filter((r) => r.enabled !== false);
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
    const score = calcScore(hits, enabledRoutines.length - skipped, water, settings.waterGoal, steps, settings.stepGoal, sleep, settings.sleepGoalHours);
    return { dateKey: dk, day: getDayAbbr(dk), score, water, steps, sleep, hits };
  }));

  const todayKey = dayKeys[dayKeys.length - 1];
  const [todayStates, todayTimes, streakRaw, todayOverrides] = await Promise.all([
    getRoutineStates(todayKey),
    getRoutineCompletionTimes(todayKey),
    AsyncStorage.getItem(KEYS.streak),
    getRoutineTimeOverrides(todayKey),
  ]);
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  const routineLines = enabledRoutines.map((r) => {
    const effTime = effectivePreferredTime(r, todayOverrides);
    const overrideNote = todayOverrides[r.id] !== undefined ? ' [reset for today]' : '';
    const plannedText = effTime !== undefined ? fmtTime(effTime) : 'no fixed time';
    if (todayStates[r.id] === 'skipped') return `- ${r.label}: intentionally skipped today`;
    if (todayStates[r.id] !== 'hit') return `- ${r.label} (planned ${plannedText}${overrideNote}): not done yet today`;

    const iso = todayTimes[r.id];
    if (!iso || formatDateKey(new Date(iso)) !== todayKey) return `- ${r.label}: done today (no time recorded)`;

    const d = new Date(iso);
    const mins = d.getHours() * 60 + d.getMinutes();
    const delta = effTime !== undefined ? mins - effTime : null;
    const drift =
      delta === null ? '' :
      delta > 15 ? `, ${fmtDuration(delta)} later than planned` :
      delta < -15 ? `, ${fmtDuration(Math.abs(delta))} earlier than planned` : ', on time';
    return `- ${r.label}: done at ${fmtTime(mins)}${drift}`;
  });

  const weekLines = dailyData.map((d) =>
    `${d.day} ${d.dateKey}: score ${d.score}, ${d.hits}/${enabledRoutines.length} routines, ` +
    `${d.water} glasses water (goal ${settings.waterGoal}), ${d.steps} steps (goal ${settings.stepGoal}), ` +
    `${d.sleep > 0 ? `${d.sleep}h sleep` : 'no sleep logged'}`
  );

  const streak = streakRaw ? parseInt(streakRaw, 10) : 0;

  // Every routine (including disabled ones), with real ids, so tool calls
  // that add/update/remove/rebuild routines can reference exact rows.
  const catalogLines = routineConfig.map((r) =>
    `id:${r.id} | ${r.label} | ${r.slot} | ${r.preferredTime !== undefined ? fmtTimeHHMM(r.preferredTime) : 'no fixed time'} | ` +
    `${r.durationMinutes ?? 5} min | ${r.target} | ${r.enabled === false ? 'disabled' : 'enabled'}`
  );

  const fitnessLines = await buildFitnessContextLines(dayKeys);

  return [
    `Current time: ${fmtTimeHHMM(nowMinutes)}.`,
    `Current streak: ${streak} days.`,
    `Today's routines:`,
    ...routineLines,
    `Last 7 days:`,
    ...weekLines,
    `Routine catalog (id | label | slot | time | duration | target | status):`,
    ...(catalogLines.length > 0 ? catalogLines : ['(no routines configured)']),
    `Fitness:`,
    ...fitnessLines,
  ].join('\n');
}

async function buildFitnessContextLines(dayKeys: string[]): Promise<string[]> {
  const [goal, program] = await Promise.all([getFitnessGoal(), getFitnessProgram()]);
  if (!goal || !program) return ['No active fitness goal or program.'];

  const lines: string[] = [
    `Goal: "${goal.description}" by ${goal.targetDate}${goal.startWeightKg ? ` (started at ${goal.startWeightKg}kg)` : ''}.`,
    `Program (id:${program.id}):`,
  ];
  for (const day of [...program.days].sort((a, b) => a.weekday - b.weekday)) {
    if (day.exercises.length === 0) {
      lines.push(`  ${WEEKDAY_NAMES[day.weekday]} - ${day.label} (rest/no exercises)`);
      continue;
    }
    const exLine = day.exercises
      .map((e) => `${e.name} (id:${e.exerciseId}, ${e.bodyPart}) ${e.targetSets}x${e.targetReps} @ ${e.currentWeightKg}kg`)
      .join(' | ');
    lines.push(`  ${WEEKDAY_NAMES[day.weekday]} - ${day.label}: ${exLine}`);
  }

  const recentSessions = await Promise.all(dayKeys.map((dk) => getWorkoutSession(dk)));
  const loggedLines = recentSessions
    .filter((s): s is NonNullable<typeof s> => !!s && !!s.loggedExercises && s.loggedExercises.length > 0)
    .map((s) => {
      const exSummary = s.loggedExercises!
        .map((le) => `${le.exerciseId} ${le.sets.map((set) => `${set.weightKg}kg x${set.reps}`).join(', ')}${le.feltTooHeavy ? ' (felt too heavy)' : ''}`)
        .join(' | ');
      return `  ${s.date}: ${exSummary}`;
    });
  lines.push(`Recently logged sets (last 7 days, by exercise id):`);
  lines.push(...(loggedLines.length > 0 ? loggedLines : ['  (nothing logged yet)']));

  return lines;
}

const WEEKLY_REVIEW_WINDOW_DAYS = 21;

/**
 * A second, separate context builder used only by refreshWeeklyReview() below
 * — regular chat via buildCoachContext() is untouched. That context only
 * ever shows TODAY's per-routine status plus a 7-day *aggregate* score, which
 * can't answer "what's chronically missed" — this tallies hit/miss/skipped
 * per routine over a multi-week window so the AI can name actual patterns
 * instead of guessing from a recap.
 */
async function buildWeeklyReviewContext(): Promise<string> {
  const [settings, routineConfig] = await Promise.all([getSettings(), getRoutineConfig()]);
  const enabledRoutines = routineConfig.filter((r) => r.enabled !== false);
  const dayKeys = getLastNDayKeys(WEEKLY_REVIEW_WINDOW_DAYS);

  const dayStatesRaw = await Promise.all(dayKeys.map((dk) => AsyncStorage.getItem(KEYS.routines(dk))));
  const dayStates: Record<string, string>[] = dayStatesRaw.map((raw) => (raw ? JSON.parse(raw) : {}));

  const routineLines = enabledRoutines.map((r) => {
    let hit = 0, missed = 0, skipped = 0;
    for (const states of dayStates) {
      const s = states[r.id];
      if (s === 'hit') hit++;
      else if (s === 'skipped') skipped++;
      else missed++;
    }
    return `- ${r.label}: ${hit} hit / ${missed} missed / ${skipped} skipped over the last ${dayKeys.length} days`;
  });

  const dailyScores = await Promise.all(dayKeys.map(async (dk) => {
    const [waterRaw, stepsRaw, sleepRaw] = await Promise.all([
      AsyncStorage.getItem(KEYS.water(dk)),
      AsyncStorage.getItem(KEYS.steps(dk)),
      AsyncStorage.getItem(KEYS.sleep(dk)),
    ]);
    const states = dayStates[dayKeys.indexOf(dk)];
    const water = waterRaw ? parseInt(waterRaw, 10) : 0;
    const steps = stepsRaw ? parseInt(stepsRaw, 10) : 0;
    const sleep = sleepRaw ? parseFloat(sleepRaw) : 0;
    const { hits, skipped } = countRoutineHitsAndSkips(states);
    return calcScore(hits, enabledRoutines.length - skipped, water, settings.waterGoal, steps, settings.stepGoal, sleep, settings.sleepGoalHours);
  }));
  const avgScore = dailyScores.length > 0 ? Math.round(dailyScores.reduce((a, b) => a + b, 0) / dailyScores.length) : 0;

  // A 7-day "deferred instead of done" signal — ties the Snooze cap
  // (services/reminders.ts) into the same review.
  const last7Keys = getLastNDayKeys(7);
  const snoozeCountsRaw = await Promise.all(last7Keys.map((dk) => AsyncStorage.getItem(KEYS.snoozeCounts(dk))));
  const totalSnoozes = snoozeCountsRaw.reduce((sum, raw) => {
    if (!raw) return sum;
    try {
      const counts: Record<string, number> = JSON.parse(raw);
      return sum + Object.values(counts).reduce((a, b) => a + b, 0);
    } catch {
      return sum;
    }
  }, 0);

  return [
    `Average daily score over the last ${dayKeys.length} days: ${avgScore}.`,
    `Total snoozes across all tasks in the last 7 days: ${totalSnoozes}.`,
    `Per-routine consistency over the last ${dayKeys.length} days:`,
    ...(routineLines.length > 0 ? routineLines : ['(no routines configured)']),
  ].join('\n');
}

const WEEKLY_REVIEW_MAX_CHARS = 220;

/**
 * Writes the "VITALIS — WEEKLY REVIEW" notification body via Vitalis AI,
 * once a week — mirrors refreshMorningDigest's cache-then-invoke shape, but
 * with buildWeeklyReviewContext()'s wider window instead of the regular chat
 * context, and its own prompt asking for named patterns rather than a recap.
 * Gated on getWeekKey() so it only actually calls the model once per week;
 * cheap to call on every foreground otherwise. Same non-circular constraint
 * as refreshMorningDigest: never called from inside syncReminders() itself.
 */
export async function refreshWeeklyReview(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const weekKey = getWeekKey();
  try {
    const cachedWeek = await AsyncStorage.getItem(KEYS.weeklyReviewWeek);
    if (cachedWeek === weekKey) return;

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;

    const context = await buildWeeklyReviewContext();
    const question =
      "Write this week's accountability review. Name the specific routine(s) with the worst hit/miss pattern over the window and one concrete fix for each " +
      "(move the time, drop it, or change what 'done' means) — not a generic pep talk. Plain text only, no markdown, " +
      `under ${WEEKLY_REVIEW_MAX_CHARS} characters total.`;

    const { data, error } = await supabase.functions.invoke('coach-ai', { body: { context, question } });
    if (error || data?.error) return;

    const reply = (data?.reply as string) ?? '';
    const actions = (data?.actions as CoachAction[] | null | undefined) ?? [];
    await applyCoachActions(actions);

    const text = reply.trim().slice(0, WEEKLY_REVIEW_MAX_CHARS);
    if (!text) return;
    await AsyncStorage.setItem(KEYS.weeklyReview, text);
    await AsyncStorage.setItem(KEYS.weeklyReviewWeek, weekKey);
    await syncReminders();
  } catch {
    // best-effort — the static fallback line covers this
  }
}

export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface NewRoutineSpec {
  label: string;
  emoji?: string;
  slot: RoutineDefinition['slot'];
  time?: string;
  durationMinutes?: number;
  target?: string;
}

interface NewProgramExerciseSpec {
  name: string;
  bodyPart: BodyPart;
  targetSets: number;
  targetReps: string;
  startWeightKg: number;
  incrementKg?: number;
}

interface NewSplitDaySpec {
  weekday: number;
  label: string;
  bodyParts: BodyPart[];
  exercises: NewProgramExerciseSpec[];
}

type CoachAction =
  | { type: 'set_routines'; routines: NewRoutineSpec[] }
  | { type: 'add_routine'; routine: NewRoutineSpec }
  | { type: 'update_routine'; routineId: string; patch: Partial<NewRoutineSpec> & { enabled?: boolean } }
  | { type: 'remove_routine'; routineId: string }
  | { type: 'set_fitness_program'; goal: { description: string; targetDate: string; startWeightKg?: number }; days: NewSplitDaySpec[] }
  | { type: 'adjust_program_exercise'; exerciseId: string; patch: Partial<{ targetSets: number; targetReps: string; currentWeightKg: number; incrementKg: number }> }
  | { type: 'reassign_split_day'; day: NewSplitDaySpec }
  | { type: 'reset_today_routines'; resets: { routineId: string; action: 'retime' | 'skip'; time?: string }[] };

function buildRoutine(spec: NewRoutineSpec, id: string): RoutineDefinition {
  const preferredTime = spec.time ? parseHHMM(spec.time) ?? undefined : undefined;
  return {
    id,
    label: spec.label,
    emoji: spec.emoji && ROUTINE_ICON_CHOICES.includes(spec.emoji) ? spec.emoji : 'bolt',
    slot: spec.slot,
    target: spec.target?.trim() || (spec.durationMinutes ? `${spec.durationMinutes} min` : 'Complete'),
    preferredTime,
    durationMinutes: spec.durationMinutes ?? 5,
    enabled: true,
  };
}

function buildProgramExercise(spec: NewProgramExerciseSpec): ProgramExercise {
  const resolved = resolveExercise(spec.name, spec.bodyPart);
  return {
    exerciseId: resolved?.id ?? newFitnessId('ex'),
    name: resolved?.name ?? spec.name,
    bodyPart: spec.bodyPart,
    targetSets: spec.targetSets,
    targetReps: spec.targetReps,
    currentWeightKg: spec.startWeightKg,
    incrementKg: spec.incrementKg,
  };
}

function buildSplitDay(spec: NewSplitDaySpec): SplitDay {
  return {
    weekday: spec.weekday,
    label: spec.label,
    bodyParts: spec.bodyParts,
    exercises: spec.exercises.map(buildProgramExercise),
  };
}

/** Applies every action from one turn in order — Vitalis AI decides intent,
 *  this function is the only place that actually writes routine config or
 *  fitness program/goal, mirroring how Planner's assistant never mutates
 *  storage itself either. Reminders get resynced once at the end so a
 *  routine change is reflected immediately. */
async function applyCoachActions(actions: CoachAction[]): Promise<string[]> {
  if (actions.length === 0) return [];
  const problems: string[] = [];

  const needsRoutines = actions.some((a) =>
    a.type === 'set_routines' || a.type === 'add_routine' || a.type === 'update_routine' || a.type === 'remove_routine');
  const needsFitness = actions.some((a) =>
    a.type === 'set_fitness_program' || a.type === 'adjust_program_exercise' || a.type === 'reassign_split_day');

  let config = needsRoutines ? await getRoutineConfig() : [];
  let routinesTouched = false;

  let program = needsFitness ? await getFitnessProgram() : null;
  let goal: FitnessGoal | null = null;
  let fitnessTouched = false;

  actions.forEach((action, i) => {
    if (action.type === 'set_routines') {
      config = action.routines.map((spec, j) => buildRoutine(spec, `r_${Date.now()}_${j}`));
      routinesTouched = true;
      return;
    }
    if (action.type === 'add_routine') {
      config = [...config, buildRoutine(action.routine, `r_${Date.now()}_${i}`)];
      routinesTouched = true;
      return;
    }
    if (action.type === 'update_routine') {
      const idx = config.findIndex((r) => r.id === action.routineId);
      if (idx === -1) { problems.push(`Couldn't find one routine to update — it may have changed.`); return; }
      const existing = config[idx];
      const p = action.patch;
      config = config.map((r, ri) => ri !== idx ? r : {
        ...r,
        label: p.label ?? r.label,
        emoji: p.emoji && ROUTINE_ICON_CHOICES.includes(p.emoji) ? p.emoji : r.emoji,
        slot: p.slot ?? r.slot,
        target: p.target ?? r.target,
        preferredTime: p.time ? (parseHHMM(p.time) ?? existing.preferredTime) : r.preferredTime,
        durationMinutes: p.durationMinutes ?? r.durationMinutes,
        enabled: p.enabled ?? r.enabled,
      });
      routinesTouched = true;
      return;
    }
    if (action.type === 'remove_routine') {
      const existed = config.some((r) => r.id === action.routineId);
      if (!existed) { problems.push(`Couldn't find one routine to remove — it may have changed.`); return; }
      config = config.filter((r) => r.id !== action.routineId);
      routinesTouched = true;
      return;
    }

    if (action.type === 'set_fitness_program') {
      const goalId = newFitnessId('fg');
      goal = {
        id: goalId,
        description: action.goal.description,
        targetDate: action.goal.targetDate,
        startWeightKg: action.goal.startWeightKg,
        createdAt: Date.now(),
      };
      program = {
        id: newFitnessId('fp'),
        goalId,
        createdAt: Date.now(),
        days: action.days.map(buildSplitDay),
      };
      fitnessTouched = true;
      return;
    }
    if (action.type === 'reassign_split_day') {
      if (!program) { problems.push('No active fitness program to adjust — set a goal up first.'); return; }
      const newDay = buildSplitDay(action.day);
      program = { ...program, days: program.days.map((d) => d.weekday === newDay.weekday ? newDay : d) };
      fitnessTouched = true;
      return;
    }
    if (action.type === 'adjust_program_exercise') {
      if (!program) { problems.push('No active fitness program to adjust.'); return; }
      const exists = program.days.some((d) => d.exercises.some((e) => e.exerciseId === action.exerciseId));
      if (!exists) { problems.push(`Couldn't find one exercise to adjust — it may have changed.`); return; }
      program = {
        ...program,
        days: program.days.map((d) => ({
          ...d,
          exercises: d.exercises.map((e) => e.exerciseId === action.exerciseId ? { ...e, ...action.patch } : e),
        })),
      };
      fitnessTouched = true;
    }
  });

  let resetsTouched = false;
  const todayKey = getTodayKey();
  for (const action of actions) {
    if (action.type !== 'reset_today_routines') continue;
    for (const r of action.resets) {
      if (r.action === 'skip') {
        try { await setRoutineSkipped(todayKey, r.routineId, true); resetsTouched = true; }
        catch { problems.push(`Couldn't skip one routine for today.`); }
        continue;
      }
      const mins = r.time ? parseHHMM(r.time) : null;
      if (mins === null) { problems.push(`Couldn't reset one routine's time — invalid time given.`); continue; }
      try { await setRoutineTimeOverride(todayKey, r.routineId, mins); resetsTouched = true; }
      catch { problems.push(`Couldn't reset one routine's time for today.`); }
    }
  }

  if (routinesTouched) {
    await saveRoutineConfig(config);
    await syncReminders();
  } else if (resetsTouched) {
    await syncReminders();
  }
  if (fitnessTouched && program) {
    if (goal) await saveFitnessGoal(goal);
    await saveFitnessProgram(program);
  }
  return problems;
}

export async function askCoach(question: string): Promise<{ reply: string } | { error: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'The AI coach needs cloud sync configured first (Settings → Account & Sync).' };
  }
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return { error: 'Sign in (Settings → Account & Sync) to talk to your AI coach.' };
  }

  try {
    const context = await buildCoachContext();
    const { data, error } = await supabase.functions.invoke('coach-ai', { body: { context, question } });
    if (error) return { error: error.message ?? 'The coach request failed.' };
    if (data?.error) return { error: data.error as string };

    const reply = (data?.reply as string) ?? 'No response from the coach.';
    const actions = (data?.actions as CoachAction[] | null | undefined) ?? [];
    const problems = await applyCoachActions(actions);
    return { reply: problems.length > 0 ? `${reply}\n\n(${problems.join(' ')})` : reply };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'The coach request failed.' };
  }
}

const DIGEST_MAX_CHARS = 180;

/**
 * Writes today's "VITALIS — MORNING" notification body via Vitalis AI, once
 * a day, so it's a real recap-plus-nudge instead of the same static line
 * every morning — mirrors how FitnessScreen routes a synthetic prompt
 * through askCoach() rather than calling the model directly. Purely a cache
 * write (services/reminders.ts reads it back at schedule time); silently
 * no-ops when there's nothing new to write, so it's cheap to call often.
 * Called from App.tsx on foreground, never from inside syncReminders()
 * itself — reminders.ts must not depend on coach.ts (coach.ts already
 * depends on reminders.ts for syncReminders, and a cycle between the two
 * would leave one side's imports undefined at load time).
 */
export async function refreshMorningDigest(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const dateKey = getTodayKey();
  const cacheKey = KEYS.morningDigest(dateKey);
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return;

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;

    const result = await askCoach(
      "Write today's morning notification. One tight sentence recapping yesterday's real numbers, then one specific, actionable focus for today. " +
      `Plain text only — no greeting, no sign-off, no markdown, under ${DIGEST_MAX_CHARS} characters total.`
    );
    if ('error' in result) return;

    const text = result.reply.trim().slice(0, DIGEST_MAX_CHARS);
    if (!text) return;
    await AsyncStorage.setItem(cacheKey, text);
    await syncReminders();
  } catch {
    // best-effort — the static fallback line covers this
  }
}

/** The persisted conversation — the edge function writes both sides of each
 *  exchange, this just reads them back for display. Empty (not an error)
 *  when signed out or not configured, so callers can render nothing. */
export async function getCoachHistory(): Promise<CoachMessage[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return [];

  const { data, error } = await supabase
    .from('coach_messages')
    .select('id, role, content, created_at')
    .eq('user_id', sessionData.session.user.id)
    .order('created_at', { ascending: true });
  if (error || !data) return [];

  return data.map((m) => ({
    id: m.id as string,
    role: m.role as 'user' | 'assistant',
    content: m.content as string,
    createdAt: m.created_at as string,
  }));
}

export async function clearCoachHistory(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  await supabase.from('coach_messages').delete().eq('user_id', sessionData.session.user.id);
}
