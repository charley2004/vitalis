import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import {
  getSettings, getRoutineConfig, getRoutineStates, getRoutineCompletionTimes,
  getLast7DayKeys, getDayAbbr, formatDateKey, calcScore, countRoutineHitsAndSkips, KEYS,
} from './storage';
import { fmtTime, fmtDuration } from './calendar';

/**
 * Compact plain-text snapshot of the same data Growth's CoachSection rule-based
 * insights already compute — routine timing/lateness, hydration, movement,
 * sleep, streak, and a 7-day trend — kept small on purpose to stay cheap
 * per request.
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
  const [todayStates, todayTimes, streakRaw] = await Promise.all([
    getRoutineStates(todayKey),
    getRoutineCompletionTimes(todayKey),
    AsyncStorage.getItem(KEYS.streak),
  ]);

  const routineLines = enabledRoutines.map((r) => {
    const plannedText = r.preferredTime !== undefined ? fmtTime(r.preferredTime) : 'no fixed time';
    if (todayStates[r.id] === 'skipped') return `- ${r.label}: intentionally skipped today`;
    if (todayStates[r.id] !== 'hit') return `- ${r.label} (planned ${plannedText}): not done yet today`;

    const iso = todayTimes[r.id];
    if (!iso || formatDateKey(new Date(iso)) !== todayKey) return `- ${r.label}: done today (no time recorded)`;

    const d = new Date(iso);
    const mins = d.getHours() * 60 + d.getMinutes();
    const delta = r.preferredTime !== undefined ? mins - r.preferredTime : null;
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

  return [
    `Current streak: ${streak} days.`,
    `Today's routines:`,
    ...routineLines,
    `Last 7 days:`,
    ...weekLines,
  ].join('\n');
}

export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
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
    return { reply: (data?.reply as string) ?? 'No response from the coach.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'The coach request failed.' };
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
