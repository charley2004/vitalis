import AsyncStorage from '@react-native-async-storage/async-storage';
import { KEYS, type LoggedExercise } from './storage';
import { getExercisesByBodyPart, type BodyPart, type Exercise } from './exercises';

// AI-generated goal + program, tracked deterministically week to week. The AI
// (Vitalis AI / services/coach.ts) only ever proposes a program or an
// adjustment via tool use — this file is the only code that writes it, and
// suggestNextWeight() is plain arithmetic, not an AI call, so progression
// decisions are instant and free. See the plan this was built from:
// a goal-driven split + progressive overload, confirmed by the user each
// step rather than silently auto-applied.

export interface FitnessGoal {
  id: string;
  description: string;
  targetDate: string;
  startWeightKg?: number;
  notes?: string;
  createdAt: number;
}

export interface ProgramExercise {
  exerciseId: string;
  name: string;
  bodyPart: BodyPart;
  targetSets: number;
  targetReps: string;       // e.g. "8-10"
  currentWeightKg: number;
  /** How much to move by when progression suggests a bump. Defaults to 2.5
   *  if unset — the AI sets a larger value (e.g. 5) for big compound lifts. */
  incrementKg?: number;
}

export interface SplitDay {
  weekday: number;          // 0=Sun..6=Sat
  label: string;            // "Push", "Legs", "Rest", etc.
  bodyParts: BodyPart[];
  exercises: ProgramExercise[];
}

export interface FitnessProgram {
  id: string;
  goalId: string;
  createdAt: number;
  days: SplitDay[];         // 7 entries, one per weekday
  notes?: string;
}

export function newFitnessId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export async function getFitnessGoal(): Promise<FitnessGoal | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.fitnessGoal);
    return raw ? (JSON.parse(raw) as FitnessGoal) : null;
  } catch { return null; }
}

export async function saveFitnessGoal(goal: FitnessGoal): Promise<void> {
  try { await AsyncStorage.setItem(KEYS.fitnessGoal, JSON.stringify(goal)); } catch {}
}

export async function clearFitnessGoal(): Promise<void> {
  try { await AsyncStorage.multiRemove([KEYS.fitnessGoal, KEYS.fitnessProgram]); } catch {}
}

export async function getFitnessProgram(): Promise<FitnessProgram | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.fitnessProgram);
    return raw ? (JSON.parse(raw) as FitnessProgram) : null;
  } catch { return null; }
}

export async function saveFitnessProgram(program: FitnessProgram): Promise<void> {
  try { await AsyncStorage.setItem(KEYS.fitnessProgram, JSON.stringify(program)); } catch {}
}

/** Today's (or any date's) assigned split day, or null if no program is active. */
export function getSplitDayFor(program: FitnessProgram | null, date: Date): SplitDay | null {
  if (!program) return null;
  return program.days.find((d) => d.weekday === date.getDay()) ?? null;
}

// ─── Exercise resolution ───────────────────────────────────────────────────────

/** Matches an AI-suggested exercise name against the real local catalog for
 *  a given body part, so a program always points at a real, known exercise
 *  (with a real image/instructions) instead of a name the AI made up. Falls
 *  back to the first exercise in that body part, then to a synthetic id, so
 *  a program is never left half-built by one unmatched name. */
export function resolveExercise(name: string, bodyPart: BodyPart): Exercise | null {
  const candidates = getExercisesByBodyPart(bodyPart);
  if (candidates.length === 0) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = norm(name);
  let best = candidates.find((c) => norm(c.name) === target);
  if (!best) best = candidates.find((c) => norm(c.name).includes(target) || target.includes(norm(c.name)));
  if (!best) {
    const words: string[] = target.match(/[a-z0-9]+/g) ?? [];
    best = candidates.find((c) => {
      const cWords: string[] = norm(c.name).match(/[a-z0-9]+/g) ?? [];
      return words.some((w) => w.length > 3 && cWords.includes(w));
    });
  }
  return best ?? candidates[0];
}

// ─── Progression ────────────────────────────────────────────────────────────────

function parseRepRangeMin(targetReps: string): number {
  const m = /(\d+)/.exec(targetReps);
  return m ? Number(m[1]) : 0;
}

export interface WeightSuggestion {
  suggestedKg: number;
  direction: 'up' | 'hold' | 'down';
  reason: string;
}

/**
 * Compares what was actually logged against an exercise's current target.
 * Every set met the target's low end -> suggest moving up by incrementKg.
 * Any set fell short -> hold at the current weight.
 * feltTooHeavy (explicit user flag) overrides both and steps down instead.
 * Never applies itself — services/fitness.ts's callers always confirm with
 * the user before persisting a new currentWeightKg.
 */
export function suggestNextWeight(exercise: ProgramExercise, log: LoggedExercise): WeightSuggestion {
  const increment = exercise.incrementKg ?? 2.5;
  const current = exercise.currentWeightKg;

  if (log.feltTooHeavy) {
    return {
      suggestedKg: Math.max(0, current - increment),
      direction: 'down',
      reason: `Flagged as too heavy at ${current}kg — back off to ${Math.max(0, current - increment)}kg next time.`,
    };
  }

  const minReps = parseRepRangeMin(exercise.targetReps);
  const allSetsMet = log.sets.length > 0 && log.sets.every((s) => s.reps >= minReps);

  if (allSetsMet) {
    return {
      suggestedKg: current + increment,
      direction: 'up',
      reason: `Hit all ${log.sets.length} sets at ${current}kg for ${exercise.targetReps} reps — move up to ${current + increment}kg next time?`,
    };
  }

  return {
    suggestedKg: current,
    direction: 'hold',
    reason: `Didn't quite hit ${exercise.targetReps} reps across all sets at ${current}kg — stay here and try again next time.`,
  };
}

/** Applies a confirmed suggestion into the program (does NOT auto-decide —
 *  callers pass the user's actual choice, which may differ from the
 *  suggestion, e.g. they choose to stay even after an "up" suggestion). */
export async function applyWeightChange(exerciseId: string, newWeightKg: number): Promise<void> {
  const program = await getFitnessProgram();
  if (!program) return;
  const days = program.days.map((d) => ({
    ...d,
    exercises: d.exercises.map((e) => e.exerciseId === exerciseId ? { ...e, currentWeightKg: newWeightKg } : e),
  }));
  await saveFitnessProgram({ ...program, days });
}

// ─── Growth integration (matches the clean getSavingsProgressPct pattern) ──────

/** % of this program's exercises where at least one session has been logged
 *  with loggedExercises for that exerciseId, across the given sessions —
 *  callers already have the session list (Fitness/Growth), so this stays a
 *  pure function rather than re-scanning AsyncStorage itself. */
export function getProgramAdherencePct(program: FitnessProgram | null, recentLogged: LoggedExercise[]): number {
  if (!program) return 0;
  const allExerciseIds = new Set(program.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
  if (allExerciseIds.size === 0) return 0;
  const loggedIds = new Set(recentLogged.map((l) => l.exerciseId));
  const hit = [...allExerciseIds].filter((id) => loggedIds.has(id)).length;
  return Math.round((hit / allExerciseIds.size) * 100);
}
