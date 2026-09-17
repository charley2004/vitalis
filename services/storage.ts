import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Date utilities ───────────────────────────────────────────────────────────

export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getTodayKey(): string {
  return formatDateKey(new Date());
}

export function getYesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDateKey(d);
}

export function getLastNDayKeys(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return formatDateKey(d);
  });
}

export function getLast7DayKeys(): string[] {
  return getLastNDayKeys(7);
}

/** Date-key of the most recent Sunday — stable across a whole week, changes
 *  only when the week rolls over. Used to gate the weekly review to once a
 *  week without needing a server-side cron. */
export function getWeekKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return formatDateKey(d);
}

export function getDayAbbr(dateKey: string): string {
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date(dateKey + 'T12:00:00').getDay()];
}

export function getLastNMonthKeys(n: number): { key: string; label: string }[] {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { key, label: months[d.getMonth()] };
  });
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

export const KEYS = {
  routines:       (date: string) => `@vitalis/routines_${date}`,
  routineTimes:   (date: string) => `@vitalis/routine_times_${date}`,
  routineTimeOverrides: (date: string) => `@vitalis/routine_time_overrides_${date}`,
  morningDigest:  (date: string) => `@vitalis/morning_digest_${date}`,
  snoozeCounts:   (date: string) => `@vitalis/snooze_counts_${date}`,
  weeklyReview:     '@vitalis/weekly_review',
  weeklyReviewWeek: '@vitalis/weekly_review_week',
  water:          (date: string) => `@vitalis/water_${date}`,
  steps:          (date: string) => `@vitalis/steps_${date}`,
  sleep:          (date: string) => `@vitalis/sleep_${date}`,
  workout:        (date: string) => `@vitalis/workout_${date}`,
  workoutSession: (date: string) => `@vitalis/workout_session_${date}`,
  score:          (date: string) => `@vitalis/score_${date}`,
  log:            (date: string) => `@vitalis/log_${date}`,
  streak:         '@vitalis/streak',
  streakLastDate: '@vitalis/streak_lastDate',
  weight:         '@vitalis/weight',
  weightStart:    '@vitalis/weight_start',
  settings:       '@vitalis/settings',
  routinesConfig: '@vitalis/routines_config',
  growthGoals:    '@vitalis/growth_goals',
  financeCategories: '@vitalis/finance_categories',
  financeTransactions: '@vitalis/finance_transactions',
  financeBudgets: '@vitalis/finance_budgets',
  financeGoals: '@vitalis/finance_goals',
  financeCalcHistory: '@vitalis/finance_calc_history',
  financeSettings: '@vitalis/finance_settings',
  fitnessGoal: '@vitalis/fitness_goal',
  fitnessProgram: '@vitalis/fitness_program',
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface AppSettings {
  stepGoal: number;
  waterGoal: number;
  sleepGoalHours: number;
  morningReminderEnabled: boolean;
  morningReminderHour: number;
  morningReminderMinute: number;
  eveningReminderEnabled: boolean;
  eveningReminderHour: number;
  eveningReminderMinute: number;
  /** Preferences captured during onboarding's permissions step */
  plannerTipsEnabled: boolean;
  activityRemindersEnabled: boolean;
  notificationsEnabled: boolean;
  /** Captured during onboarding's training step — drives the annual training
   *  target (Fitness/Growth) instead of each screen guessing independently */
  trainingDaysPerWeek: number;
  /** What FitnessScreen's exercise browser filters to by default */
  equipmentAccess: 'all' | 'bodyweight' | 'gym';
  /** Biases exercise ordering toward what's a good fit, doesn't hard-filter */
  fitnessLevel: 'beginner' | 'intermediate' | 'advanced';
  /** Per-routine heads-up notification, fired routinePreReminderMinutes before
   *  each enabled routine's preferredTime — separate from the morning/evening
   *  digest reminders above and from a routine's own alarmEnabled alarm. */
  routinePreReminderEnabled: boolean;
  routinePreReminderMinutes: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  stepGoal: 10000,
  waterGoal: 8,
  sleepGoalHours: 8,
  morningReminderEnabled: false,
  morningReminderHour: 7,
  morningReminderMinute: 0,
  eveningReminderEnabled: false,
  eveningReminderHour: 21,
  eveningReminderMinute: 0,
  plannerTipsEnabled: false,
  activityRemindersEnabled: false,
  notificationsEnabled: false,
  trainingDaysPerWeek: 4,
  equipmentAccess: 'all',
  fitnessLevel: 'intermediate',
  routinePreReminderEnabled: true,
  routinePreReminderMinutes: 10,
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.settings);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try { await AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings)); } catch {}
}

// ─── Score calculation ────────────────────────────────────────────────────────

export function calcScore(
  routineHits: number,
  totalRoutines: number,
  waterGlasses: number,
  waterGoal: number,
  steps: number,
  stepGoal: number,
  sleepHours: number,
  sleepGoalHours: number = 8,
): number {
  const routineScore = totalRoutines > 0 ? (routineHits / totalRoutines) * 100 : 0;
  const hydrationScore = Math.min((waterGlasses / waterGoal) * 100, 100);
  const fitnessScore = Math.min((steps / stepGoal) * 100, 100);
  if (sleepHours > 0) {
    const sleepScore = Math.min((sleepHours / sleepGoalHours) * 100, 100);
    return Math.round((routineScore + hydrationScore + fitnessScore + sleepScore) / 4);
  }
  return Math.round((routineScore + hydrationScore + fitnessScore) / 3);
}

// ─── Routine config ───────────────────────────────────────────────────────────

export interface RoutineDefinition {
  id: string;
  label: string;
  emoji: string;
  slot: 'MORNING' | 'NOON' | 'NIGHT';
  target: string;
  /** Minutes since midnight — a soft hint the AI scheduler uses to place this
   *  habit in the unified agenda. Not a fixed appointment; the scheduler will
   *  shift it around a real Planner event if the two land on the same time. */
  preferredTime?: number;
  /** Estimated minutes this habit takes, used for agenda placement */
  durationMinutes?: number;
  /** Disabled routines are hidden from the daily checklist and excluded
   *  from the AI-generated agenda, but remain configured for later re-enabling */
  enabled?: boolean;
  /** When true, preferredTime fires a loud, dismiss-to-confirm alarm instead
   *  of a quiet notification — for routines like waking up where you need to
   *  actually be interrupted, not just nudged. Requires preferredTime. */
  alarmEnabled?: boolean;
}

export const DEFAULT_ROUTINES: RoutineDefinition[] = [
  { id: 'm1', label: 'Cold Exposure',    emoji: 'snowflake', slot: 'MORNING', target: '5 min',  preferredTime: 360, durationMinutes: 5,  enabled: true },
  { id: 'm2', label: 'Hydration Load',   emoji: 'droplet',   slot: 'MORNING', target: '500ml',  preferredTime: 375, durationMinutes: 5,  enabled: true },
  { id: 'm3', label: 'Sun Protocol',     emoji: 'sunrise',   slot: 'MORNING', target: '10 min', preferredTime: 390, durationMinutes: 10, enabled: true },
  { id: 'm4', label: 'Journaling',       emoji: 'pen',       slot: 'MORNING', target: '5 min',  preferredTime: 420, durationMinutes: 5,  enabled: true },
  { id: 'n1', label: 'Movement Break',   emoji: 'runner',    slot: 'NOON',    target: '15 min', preferredTime: 810, durationMinutes: 15, enabled: true },
  { id: 'n2', label: 'Protein Intake',   emoji: 'bowl',      slot: 'NOON',    target: '50g',    preferredTime: 750, durationMinutes: 10, enabled: true },
  { id: 'n3', label: 'Mindful Pause',    emoji: 'lotus',     slot: 'NOON',    target: '5 min',  preferredTime: 840, durationMinutes: 5,  enabled: true },
  { id: 'e1', label: 'Digital Sunset',   emoji: 'signal',    slot: 'NIGHT',   target: '21:00',  preferredTime: 1260, durationMinutes: 5,  enabled: true },
  { id: 'e2', label: 'Sleep Prep',       emoji: 'moon',      slot: 'NIGHT',   target: '22:30',  preferredTime: 1350, durationMinutes: 15, enabled: true },
  { id: 'e3', label: 'Supplement Stack', emoji: 'brain',     slot: 'NIGHT',   target: 'Stack',  preferredTime: 1290, durationMinutes: 5,  enabled: true },
];

export async function getRoutineConfig(): Promise<RoutineDefinition[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.routinesConfig);
    return raw ? JSON.parse(raw) : [...DEFAULT_ROUTINES];
  } catch { return [...DEFAULT_ROUTINES]; }
}

export async function saveRoutineConfig(config: RoutineDefinition[]): Promise<void> {
  try { await AsyncStorage.setItem(KEYS.routinesConfig, JSON.stringify(config)); } catch {}
}

/** Today's (or any date's) hit/miss/pending state per routine id */
export async function getRoutineStates(dateKey: string): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.routines(dateKey));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/** Real clock time (ISO string) each routine was actually checked off on a
 *  given date — separate from the hit/pending state so the coach can compare
 *  "when you actually did it" against the routine's preferredTime. */
export async function getRoutineCompletionTimes(dateKey: string): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.routineTimes(dateKey));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/**
 * Marks a routine hit/pending for a date and maintains the global streak
 * counter. Shared by RoutinesScreen and the Planner's merged timeline so the
 * two surfaces never drift out of sync on how a habit gets checked off.
 */
export async function setRoutineHit(dateKey: string, routineId: string, hit: boolean): Promise<void> {
  const states = await getRoutineStates(dateKey);
  states[routineId] = hit ? 'hit' : 'pending';
  await AsyncStorage.setItem(KEYS.routines(dateKey), JSON.stringify(states));

  // Record the real-world clock time this was checked off — e.g. a routine
  // preferred for 7:00 AM but marked done at 8:04 AM tells the coach the
  // morning actually started an hour late, not just that it happened.
  const times = await getRoutineCompletionTimes(dateKey);
  if (hit) times[routineId] = new Date().toISOString();
  else delete times[routineId];
  await AsyncStorage.setItem(KEYS.routineTimes(dateKey), JSON.stringify(times));

  if (hit && dateKey === getTodayKey()) {
    const today = getTodayKey();
    const yesterday = getYesterdayKey();
    const streakLastDate = await AsyncStorage.getItem(KEYS.streakLastDate);
    if (streakLastDate !== today) {
      const streakRaw = await AsyncStorage.getItem(KEYS.streak);
      const current = streakRaw ? parseInt(streakRaw, 10) : 0;
      const newStreak = streakLastDate === yesterday ? current + 1 : 1;
      await AsyncStorage.setItem(KEYS.streak, String(newStreak));
      await AsyncStorage.setItem(KEYS.streakLastDate, today);
    }
  }
}

/** +1 glass for a date — the same write TodayScreen's water chip makes,
 *  factored out so the "Mark Done" notification action (App.tsx, no local
 *  screen state to update) can log a glass without duplicating the read
 *  parse-increment-write. Returns the new total. */
export async function addWaterGlass(dateKey: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.water(dateKey));
    const updated = (raw ? parseInt(raw, 10) : 0) + 1;
    await AsyncStorage.setItem(KEYS.water(dateKey), String(updated));
    return updated;
  } catch {
    return 0;
  }
}

/**
 * Marks a routine intentionally skipped for a date — for something you
 * genuinely couldn't get to (travel, illness, a schedule conflict), so it
 * stops sitting there looking like an unresolved miss without having to lie
 * that it was done. Neither helps nor breaks the streak (only a real hit
 * does that); see countRoutineHitsAndSkips() for how it's kept out of the
 * daily score instead of counting against it.
 */
export async function setRoutineSkipped(dateKey: string, routineId: string, skipped: boolean): Promise<void> {
  const states = await getRoutineStates(dateKey);
  states[routineId] = skipped ? 'skipped' : 'pending';
  await AsyncStorage.setItem(KEYS.routines(dateKey), JSON.stringify(states));

  const times = await getRoutineCompletionTimes(dateKey);
  if (times[routineId]) {
    delete times[routineId];
    await AsyncStorage.setItem(KEYS.routineTimes(dateKey), JSON.stringify(times));
  }
}

/**
 * Per-date time overrides — "just today" reschedules (e.g. Vitalis AI's
 * "reset my day" after waking up late) without touching the permanent daily
 * preferredTime on RoutineDefinition. Tomorrow reverts automatically since
 * there's simply no override stored for that date. Minutes since midnight,
 * same units as preferredTime; a routineId with no entry uses its normal time.
 */
export async function getRoutineTimeOverrides(dateKey: string): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.routineTimeOverrides(dateKey));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export async function setRoutineTimeOverride(dateKey: string, routineId: string, minutes: number | null): Promise<void> {
  const overrides = await getRoutineTimeOverrides(dateKey);
  if (minutes === null) delete overrides[routineId];
  else overrides[routineId] = minutes;
  await AsyncStorage.setItem(KEYS.routineTimeOverrides(dateKey), JSON.stringify(overrides));
}

/** The time to actually use for a routine on a given date — its override
 *  for that date if one exists, otherwise its normal preferredTime. */
export function effectivePreferredTime(routine: RoutineDefinition, overrides: Record<string, number>): number | undefined {
  return overrides[routine.id] ?? routine.preferredTime;
}

/** How many times a given task has been snoozed today, keyed by a stable
 *  composite id (e.g. `routine:${routineId}` or `planner:${eventId}:${dateKey}`)
 *  since routine/planner reminders don't otherwise have a single persistent
 *  row to attach a counter to. Backs the Snooze cap/escalation in
 *  services/reminders.ts. */
export async function getSnoozeCount(dateKey: string, taskKey: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.snoozeCounts(dateKey));
    const counts: Record<string, number> = raw ? JSON.parse(raw) : {};
    return counts[taskKey] ?? 0;
  } catch {
    return 0;
  }
}

export async function incrementSnoozeCount(dateKey: string, taskKey: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.snoozeCounts(dateKey));
    const counts: Record<string, number> = raw ? JSON.parse(raw) : {};
    counts[taskKey] = (counts[taskKey] ?? 0) + 1;
    await AsyncStorage.setItem(KEYS.snoozeCounts(dateKey), JSON.stringify(counts));
    return counts[taskKey];
  } catch {
    return 0;
  }
}

/** Hit/skipped counts for a day's routine states — skipped is excluded from
 *  calcScore's denominator entirely (neither a hit nor held against you). */
export function countRoutineHitsAndSkips(states: Record<string, string>): { hits: number; skipped: number } {
  let hits = 0, skipped = 0;
  for (const v of Object.values(states)) {
    if (v === 'hit') hits++;
    else if (v === 'skipped') skipped++;
  }
  return { hits, skipped };
}

// ─── Growth goals ─────────────────────────────────────────────────────────────

export interface GrowthGoal {
  id: string;
  label: string;
  emoji: string;
  target: number;
  unit: string;
  deadline: string;
  /** Manually-entered progress — only used for custom goals without an auto-computed metric */
  manualCurrent?: number;
}

export const DEFAULT_GROWTH_GOALS: GrowthGoal[] = [
  { id: 'g1', label: 'Body Recomposition',   emoji: 'scale',    target: 4.0,  unit: 'kg lost',     deadline: 'DEC 2026' },
  { id: 'g2', label: 'Annual Training Days', emoji: 'dumbbell', target: 200,  unit: 'sessions',    deadline: 'DEC 2026' },
  { id: 'g3', label: 'Hydration Streak',     emoji: 'droplet',  target: 30,   unit: 'days',        deadline: 'JUL 2026' },
  { id: 'g4', label: 'Sleep Consistency',    emoji: 'moon',     target: 90,   unit: '% on-target', deadline: 'SEP 2026' },
  { id: 'g5', label: 'Mindful Minutes',      emoji: 'lotus',    target: 3650, unit: 'min total',   deadline: 'DEC 2026' },
  { id: 'g6', label: 'Savings Progress',     emoji: 'wallet',   target: 100,  unit: '% saved',     deadline: 'ONGOING' },
];

export async function getGrowthGoals(): Promise<GrowthGoal[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.growthGoals);
    return raw ? JSON.parse(raw) : [...DEFAULT_GROWTH_GOALS];
  } catch { return [...DEFAULT_GROWTH_GOALS]; }
}

export async function saveGrowthGoals(goals: GrowthGoal[]): Promise<void> {
  try { await AsyncStorage.setItem(KEYS.growthGoals, JSON.stringify(goals)); } catch {}
}

// ─── Workout session ──────────────────────────────────────────────────────────

export interface SetLog { weightKg: number; reps: number; }
export interface LoggedExercise { exerciseId: string; sets: SetLog[]; feltTooHeavy?: boolean; }

export interface WorkoutSession {
  date: string;
  durationMinutes: number;
  exerciseIds: string[];
  completedIds: string[];
  category: 'upper' | 'lower' | 'cardio' | 'full';
  /** Actual weight/reps performed, present only when this session followed
   *  an active FitnessProgram (services/fitness.ts). Optional and additive
   *  so ad-hoc, program-less workouts are unaffected. */
  loggedExercises?: LoggedExercise[];
}

export async function saveWorkoutSession(session: WorkoutSession): Promise<void> {
  try { await AsyncStorage.setItem(KEYS.workoutSession(session.date), JSON.stringify(session)); } catch {}
}

export async function getWorkoutSession(date: string): Promise<WorkoutSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.workoutSession(date));
    return raw ? (JSON.parse(raw) as WorkoutSession) : null;
  } catch { return null; }
}
