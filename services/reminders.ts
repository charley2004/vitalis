import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  getEvents, getStatusMap, occurrencesForDateSync,
  addDaysKey, fmtTime, parseDateKey,
} from './calendar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getTodayKey, getSettings, getRoutineConfig, getRoutineTimeOverrides, effectivePreferredTime, KEYS,
  incrementSnoozeCount,
} from './storage';

// Android locks a channel's sound/importance/vibration the moment it's first
// created — calling setNotificationChannelAsync again with the same id
// silently no-ops on all of that (the OS only lets the *user* change it from
// then on). So every channel id below carries a version suffix: bump it
// whenever the channel's sound/importance/vibration needs to actually change
// on devices that already created the old one, since that's the only way to
// force Android to hand back a fresh channel instead of the stale one.
// (This is exactly why "Mark Done" notifications were silent — the
// `routine-due`/`routine-pre-reminders`/`routine-alarms` channels were first
// created early in development, before sound was wired up correctly, and
// every later code fix was quietly ignored by the OS.)

/** Android channel for routine alarms — loud sound, max importance, bypasses
 *  Do Not Disturb. Notifications on the default channel are ordinary nudges;
 *  this one is for the small set of routines flagged as real wake-up alarms. */
export const ALARM_CHANNEL_ID = 'routine-alarms-v2';
export const ALARM_SOUND = 'alarm.wav';

// Heads-up notification fired a few minutes before a routine's preferredTime —
// deliberately a different channel/sound from the alarm above so the two are
// distinguishable by ear alone: a chime means "coming up", the alarm means
// "this one needs a dismiss".
export const PRE_REMINDER_CHANNEL_ID = 'routine-pre-reminders-v2';
export const PRE_REMINDER_SOUND = 'chime.wav';

// "It's time" nudge for routines that aren't flagged alarmEnabled — default
// system sound (no `sound` field set) so it's audibly distinct from both the
// chime and the alarm without needing a third custom asset, but HIGH
// importance so it still pops up as a heads-up banner instead of sitting
// silently in the shade.
export const DUE_CHANNEL_ID = 'routine-due-v2';

// Planner event reminders previously had no dedicated channel at all — they
// rode on whatever default channel Android/Expo auto-creates, which is why
// they looked like a "plain popup" with no real presence. Own channel, own
// heads-up treatment.
export const PLANNER_CHANNEL_ID = 'planner-tasks-v1';

// A "Mark Done" quick action, attached to Planner event reminders and quiet
// routine due-nudges so a task can be closed out straight from the
// notification tray — deliberately excluded from alarm/pre-reminder/digest
// notifications, which aren't "one specific task" in the same sense.
//
// opensAppToForeground is false for both actions below — the tap should
// never visibly open the app. This alone used to reach no JS once Android
// had killed the process (a false-foreground tap only runs a plain
// in-JS-runtime listener, which needs a live JS engine); that's now covered
// by the BACKGROUND_NOTIFICATION_TASK registered in App.tsx, which
// expo-notifications' native side runs independently of process/foreground
// state on every notification response — see the comment there for how.
//
// No '-' or ':' allowed in a category identifier — Expo's own docs warn
// these "might not work as expected" (in practice: the action button never
// renders, with no error surfaced anywhere).
export const TASK_ACTION_CATEGORY = 'taskreminder';
export const MARK_DONE_ACTION = 'MARK_DONE';
// A second quick action alongside Mark Done — fires a fresh one-off copy of
// the same notification `minutes` later, entirely independent of the actual
// permanent schedule (unlike "Reset My Day", this never touches routine
// overrides — it's just "remind me again shortly", not a schedule change).
export const SNOOZE_ACTION = 'SNOOZE_10';
const SNOOZE_MINUTES = 10;
// Past this many snoozes on the same task in one day, Snooze stops being
// offered entirely — an unlimited free defer is exactly the loophole this
// whole notification system was built to close. water-task reminders are
// exempt (see snoozeNotification below): they're anonymous, interchangeable,
// and already self-limit via the remaining-glasses recompute.
const SNOOZE_CAP = 2;
// No Snooze action — used once a task has hit SNOOZE_CAP for the day, so
// there's no more room to defer, only to finish it or drop it.
export const TASK_ACTION_CATEGORY_FINAL = 'taskreminderfinal';

async function ensureTaskActionCategory(): Promise<void> {
  const setCategory = (Notifications as any).setNotificationCategoryAsync;
  if (!setCategory) return;
  await setCategory(TASK_ACTION_CATEGORY, [
    { identifier: MARK_DONE_ACTION, buttonTitle: 'Mark Done', options: { opensAppToForeground: false } },
    { identifier: SNOOZE_ACTION, buttonTitle: `Snooze ${SNOOZE_MINUTES}min`, options: { opensAppToForeground: false } },
  ]);
  await setCategory(TASK_ACTION_CATEGORY_FINAL, [
    { identifier: MARK_DONE_ACTION, buttonTitle: 'Mark Done', options: { opensAppToForeground: false } },
  ]);
}

/** A stable id for a task-shaped reminder within one day, used to count
 *  snoozes per task rather than per notification instance. `null` for kinds
 *  that don't have one stable identity to attach a counter to (water-task). */
function snoozeTaskKey(data: { kind?: string; routineId?: string; eventId?: string; dateKey?: string } | undefined): string | null {
  if (data?.kind === 'routine-task' && data.routineId) return `routine:${data.routineId}`;
  if (data?.kind === 'planner-task' && data.eventId && data.dateKey) return `planner:${data.eventId}:${data.dateKey}`;
  return null;
}

/** Re-fires one notification `SNOOZE_MINUTES` later — used when the user
 *  taps the Snooze quick action straight from the tray. Kept here (not
 *  App.tsx) so trigger-shape/channel logic for one-off notifications stays
 *  in this one scheduling authority. Past SNOOZE_CAP snoozes for the same
 *  task in one day, this escalates instead of quietly repeating: a more
 *  direct message, on a category with no Snooze action left. */
export async function snoozeNotification(content: { title?: string | null; body?: string | null; data?: unknown }): Promise<void> {
  try {
    const data = content.data as { kind?: string; routineId?: string; eventId?: string; dateKey?: string } | undefined;
    const kind = data?.kind;
    const channelId = kind === 'planner-task' ? PLANNER_CHANNEL_ID : DUE_CHANNEL_ID;
    const fireAt = new Date(Date.now() + SNOOZE_MINUTES * 60_000);

    const taskKey = snoozeTaskKey(data);
    let title = content.title ?? 'VITALIS';
    let body = content.body ?? undefined;
    let categoryIdentifier = TASK_ACTION_CATEGORY;

    if (taskKey) {
      const count = await incrementSnoozeCount(getTodayKey(), taskKey);
      if (count > SNOOZE_CAP) {
        title = 'VITALIS — OVERDUE';
        body = `You've pushed "${content.body ?? 'this'}" back ${count} times. Mark it done, or let it go.`;
        categoryIdentifier = TASK_ACTION_CATEGORY_FINAL;
      }
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: content.data as Record<string, unknown> | undefined,
        categoryIdentifier,
      },
      trigger: { ...(triggerFor(fireAt) as any), channelId },
    });
  } catch {
    // best-effort — no in-app fallback for a snooze that fails to schedule
  }
}

async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const setChannel = (Notifications as any).setNotificationChannelAsync;
  if (!setChannel) return;
  const maxImportance = (Notifications as any).AndroidImportance?.MAX ?? 7;
  const highImportance = (Notifications as any).AndroidImportance?.HIGH ?? 6;
  const visibility = (Notifications as any).AndroidNotificationVisibility?.PUBLIC ?? 1;
  await setChannel(ALARM_CHANNEL_ID, {
    name: 'Routine Alarms',
    description: 'Loud, dismiss-to-confirm alarms for routines you flag as wake-up style',
    importance: maxImportance,
    sound: ALARM_SOUND,
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    enableVibrate: true,
    lockscreenVisibility: visibility,
    bypassDnd: true,
  });
  await setChannel(PRE_REMINDER_CHANNEL_ID, {
    name: 'Routine Heads-Up',
    description: 'A soft chime a few minutes before a routine is due',
    importance: highImportance,
    sound: PRE_REMINDER_SOUND,
    vibrationPattern: [0, 150, 100, 150],
    enableVibrate: true,
  });
  await setChannel(DUE_CHANNEL_ID, {
    name: 'Routine Due',
    description: 'Routine start-time nudge, for routines without a loud alarm',
    importance: highImportance,
    vibrationPattern: [0, 200],
    enableVibrate: true,
  });
  await setChannel(PLANNER_CHANNEL_ID, {
    name: 'Planner Reminders',
    description: 'Upcoming and starting Planner events',
    importance: highImportance,
    vibrationPattern: [0, 250, 150, 250],
    enableVibrate: true,
  });
}

// Single scheduling authority for every local notification the app sends —
// both recurring Routine reminders (Settings) and Planner event reminders.
// `scheduleNotificationAsync` calls are additive but
// `cancelAllScheduledNotificationsAsync` is destructive and global, so if two
// separate places each cancel-then-reschedule their own subset, whichever
// runs last silently wipes the other's notifications. Routing everything
// through this one function avoids that.
//
// NOTE: expo-notifications is stubbed to no-ops in Expo Go (see stubs/ and
// metro.config.js), so scheduled OS notifications only fire in a real build.
// The PlannerScreen additionally shows an in-app "UP NEXT" banner so
// reminders are still visible while using Expo Go.

const HORIZON_DAYS = 3; // schedule Planner event notifications this many days ahead

function triggerFor(date: Date): unknown {
  // SDK 54 wants { type: 'date', date }; the stub ignores it entirely
  const types = (Notifications as any).SchedulableTriggerInputTypes;
  return { type: types?.DATE ?? 'date', date };
}

function dailyTriggerFor(hour: number, minute: number): unknown {
  const types = (Notifications as any).SchedulableTriggerInputTypes;
  return { type: types?.DAILY ?? 'daily', hour, minute };
}

function weeklyTriggerFor(weekday: number, hour: number, minute: number): unknown {
  // weekday is 1-7, 1 = Sunday, per Expo's WeeklyTriggerInput convention.
  const types = (Notifications as any).SchedulableTriggerInputTypes;
  return { type: types?.WEEKLY ?? 'weekly', weekday, hour, minute };
}

/**
 * Re-sync every scheduled notification — Routine morning/evening reminders
 * plus Planner event reminders — with current settings and the calendar.
 * Cancels everything once, then reschedules the full set. Call after any
 * settings change, event mutation, or on app/screen mount.
 */
export async function syncReminders(): Promise<void> {
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted) {
      const req = await Notifications.requestPermissionsAsync();
      if (!req.granted) return;
    }

    await Notifications.cancelAllScheduledNotificationsAsync();
    await ensureNotificationChannels();
    await ensureTaskActionCategory();

    // ── Routine reminders (recurring daily) ───────────────────────────────
    const settings = await getSettings();
    if (settings.morningReminderEnabled) {
      // Vitalis AI writes this once a day (services/coach.ts's
      // refreshMorningDigest, kicked off from App.tsx on foreground) and
      // caches it here — falls back to the static line when there's no
      // cloud sync, no signed-in user, or the AI call hasn't landed yet.
      const digest = await AsyncStorage.getItem(KEYS.morningDigest(getTodayKey()));
      await Notifications.scheduleNotificationAsync({
        content: { title: 'VITALIS — MORNING', body: digest || 'Start your morning routines. Check in on Vitalis.' },
        trigger: { ...(dailyTriggerFor(settings.morningReminderHour, settings.morningReminderMinute) as any), channelId: PRE_REMINDER_CHANNEL_ID },
      });
    }
    if (settings.eveningReminderEnabled) {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'VITALIS — EVENING', body: 'Log your evening routines before winding down.' },
        trigger: { ...(dailyTriggerFor(settings.eveningReminderHour, settings.eveningReminderMinute) as any), channelId: PRE_REMINDER_CHANNEL_ID },
      });
    }

    // ── Weekly accountability review (Sundays) ─────────────────────────────
    // Vitalis AI writes this once a week (services/coach.ts's
    // refreshWeeklyReview, kicked off from App.tsx on foreground, same
    // caching approach as the morning digest) — names specific chronically-
    // missed routines instead of a generic recap. Not gated on the evening
    // toggle since it's a different, independent thing; offset +30 minutes
    // from the evening reminder time so the two never collide on a Sunday.
    {
      const weeklyText = await AsyncStorage.getItem(KEYS.weeklyReview);
      const weeklyTotalMinutes = ((settings.eveningReminderHour * 60 + settings.eveningReminderMinute + 30) % 1440 + 1440) % 1440;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'VITALIS — WEEKLY REVIEW',
          body: weeklyText || "Your weekly Vitalis review is ready — open the app to see what's working and what's not.",
        },
        trigger: {
          ...(weeklyTriggerFor(1, Math.floor(weeklyTotalMinutes / 60), weeklyTotalMinutes % 60) as any),
          channelId: PRE_REMINDER_CHANNEL_ID,
        },
      });
    }

    // ── Routine alarms (loud, per-routine, opt-in) ─────────────────────────
    // Separate from the two nudges above — a routine flagged alarmEnabled
    // gets a loud, dismiss-to-confirm alarm instead of a quiet notification.
    // Tapping it (handled in App.tsx) opens a full-screen ringing view whose
    // dismissal records the real completion time via setRoutineHit.
    const routines = await getRoutineConfig();
    const todayKey = getTodayKey();
    const todayOverrides = await getRoutineTimeOverrides(todayKey);
    const nowMinutesForOverrides = new Date().getHours() * 60 + new Date().getMinutes();
    const streakRaw = await AsyncStorage.getItem(KEYS.streak);
    const streak = streakRaw ? parseInt(streakRaw, 10) : 0;
    const streakSuffix = streak > 0 ? ` — streak ${streak}` : '';

    // ── Hydration reminders (evenly spaced across the rest of today) ───────
    // Not a routine and not behind its own toggle — driven straight off the
    // water goal in Settings, like the task said it should be. Recomputed
    // fresh on every sync (a one-off DATE trigger per remaining glass, not a
    // fixed daily one) rather than scheduled once for the whole goal, so
    // logging a glass — manually in Today, or via this notification's own
    // Mark Done — immediately shrinks how many are left, instead of nagging
    // past a goal already hit. The wake/bedtime window reuses the morning/
    // evening reminder times already in Settings rather than asking for a
    // third schedule input.
    const loggedWaterRaw = await AsyncStorage.getItem(KEYS.water(todayKey));
    const glassesLogged = loggedWaterRaw ? parseInt(loggedWaterRaw, 10) : 0;
    const glassesRemaining = Math.max(0, settings.waterGoal - glassesLogged);
    const wakeMinutes = settings.morningReminderHour * 60 + settings.morningReminderMinute;
    const bedMinutes = settings.eveningReminderHour * 60 + settings.eveningReminderMinute;
    const hydrationWindowStart = Math.max(nowMinutesForOverrides, wakeMinutes);
    if (glassesRemaining > 0 && bedMinutes > hydrationWindowStart) {
      const span = bedMinutes - hydrationWindowStart;
      for (let i = 1; i <= glassesRemaining; i++) {
        const at = hydrationWindowStart + Math.round((span * i) / (glassesRemaining + 1));
        const fireDate = new Date();
        fireDate.setHours(Math.floor(at / 60), at % 60, 0, 0);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'VITALIS — HYDRATE',
            body: `Drink a glass of water — ${glassesLogged + i}/${settings.waterGoal} today`,
            data: { kind: 'water-task' },
            categoryIdentifier: TASK_ACTION_CATEGORY,
          },
          trigger: { ...(triggerFor(fireDate) as any), channelId: DUE_CHANNEL_ID },
        });
      }
    }

    for (const r of routines) {
      if (!r.alarmEnabled || r.enabled === false || r.preferredTime === undefined) continue;
      const overridden = todayOverrides[r.id];
      if (overridden !== undefined) {
        // "Reset My Day" moved this routine — fire once, today only, at the
        // new time, instead of the normal daily-recurring alarm.
        if (overridden <= nowMinutesForOverrides) continue;
        const fireDate = new Date();
        fireDate.setHours(Math.floor(overridden / 60), overridden % 60, 0, 0);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `VITALIS ALARM — ${r.label.toUpperCase()}`,
            body: 'Tap to stop the alarm and mark this done.',
            data: { kind: 'routine-alarm', routineId: r.id, routineLabel: r.label },
            sound: ALARM_SOUND,
          },
          trigger: { ...(triggerFor(fireDate) as any), channelId: ALARM_CHANNEL_ID },
        });
        continue;
      }
      const hour = Math.floor(r.preferredTime / 60);
      const minute = r.preferredTime % 60;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `VITALIS ALARM — ${r.label.toUpperCase()}`,
          body: 'Tap to stop the alarm and mark this done.',
          data: { kind: 'routine-alarm', routineId: r.id, routineLabel: r.label },
          sound: ALARM_SOUND,
        },
        trigger: { ...(dailyTriggerFor(hour, minute) as any), channelId: ALARM_CHANNEL_ID },
      });
    }

    // ── Routine pre-reminders + due-now nudges (every properly-set routine) ─
    // "Properly set" = enabled with a preferredTime. Two notifications per
    // routine: a chime routinePreReminderMinutes beforehand, then — for
    // routines that aren't alarmEnabled (those already got a loud alarm
    // above) — a quiet default-sound nudge exactly at preferredTime.
    if (settings.routinePreReminderEnabled) {
      const preMin = settings.routinePreReminderMinutes;
      for (const r of routines) {
        if (r.enabled === false || r.preferredTime === undefined) continue;
        const overridden = todayOverrides[r.id];

        if (overridden !== undefined) {
          // Today-only one-off versions at the reset time, instead of the
          // normal daily-recurring pre-reminder/due nudge.
          const preAt = overridden - preMin;
          if (preAt > nowMinutesForOverrides) {
            const preDate = new Date();
            preDate.setHours(Math.floor(preAt / 60), ((preAt % 60) + 60) % 60, 0, 0);
            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'VITALIS — UP NEXT',
                body: `${r.label}${r.target ? ` · ${r.target}` : ''} in ${preMin} min`,
                sound: PRE_REMINDER_SOUND,
              },
              trigger: { ...(triggerFor(preDate) as any), channelId: PRE_REMINDER_CHANNEL_ID },
            });
          }
          if (!r.alarmEnabled && overridden > nowMinutesForOverrides) {
            const dueDate = new Date();
            dueDate.setHours(Math.floor(overridden / 60), overridden % 60, 0, 0);
            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'VITALIS — ROUTINE TIME',
                body: `Time for ${r.label}${r.target ? ` — ${r.target}` : ''}${streakSuffix}`,
                data: { kind: 'routine-task', routineId: r.id },
                categoryIdentifier: TASK_ACTION_CATEGORY,
              },
              trigger: { ...(triggerFor(dueDate) as any), channelId: DUE_CHANNEL_ID },
            });
          }
          continue;
        }

        const preTotal = ((r.preferredTime - preMin) % 1440 + 1440) % 1440;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'VITALIS — UP NEXT',
            body: `${r.label}${r.target ? ` · ${r.target}` : ''} in ${preMin} min`,
            sound: PRE_REMINDER_SOUND,
          },
          trigger: {
            ...(dailyTriggerFor(Math.floor(preTotal / 60), preTotal % 60) as any),
            channelId: PRE_REMINDER_CHANNEL_ID,
          },
        });

        if (!r.alarmEnabled) {
          const hour = Math.floor(r.preferredTime / 60);
          const minute = r.preferredTime % 60;
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'VITALIS — ROUTINE TIME',
              body: `Time for ${r.label}${r.target ? ` — ${r.target}` : ''}${streakSuffix}`,
              data: { kind: 'routine-task', routineId: r.id },
              categoryIdentifier: TASK_ACTION_CATEGORY,
            },
            trigger: { ...(dailyTriggerFor(hour, minute) as any), channelId: DUE_CHANNEL_ID },
          });
        }
      }
    }

    // ── Planner event reminders (one-off, within the horizon) ─────────────
    const [events, statusMap] = await Promise.all([getEvents(), getStatusMap()]);
    const now = Date.now();
    const today = getTodayKey();

    for (let i = 0; i < HORIZON_DAYS; i++) {
      const dateKey = addDaysKey(today, i);
      const occs = occurrencesForDateSync(events, statusMap, dateKey);
      for (const occ of occs) {
        if (occ.status !== 'pending' || occ.start === null) continue;
        const base = parseDateKey(dateKey);
        base.setHours(0, 0, 0, 0);
        const startMs = base.getTime() + occ.start * 60_000;

        for (const offset of occ.event.reminders) {
          const fireAt = startMs - offset * 60_000;
          if (fireAt <= now) continue;
          const body = offset === 0
            ? `${occ.event.title} starts now (${fmtTime(occ.start)})`
            : offset >= 1440
              ? `${occ.event.title} is tomorrow at ${fmtTime(occ.start)}`
              : `${occ.event.title} starts in ${offset >= 60 ? `${Math.round(offset / 60)} hour${offset >= 120 ? 's' : ''}` : `${offset} minutes`}`;
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'VITALIS PLANNER',
              body,
              data: { kind: 'planner-task', eventId: occ.event.id, dateKey: occ.dateKey },
              categoryIdentifier: TASK_ACTION_CATEGORY,
            },
            trigger: { ...(triggerFor(new Date(fireAt)) as any), channelId: PLANNER_CHANNEL_ID },
          });
        }
      }
    }
  } catch {
    // Expo Go stub or permission failure — in-app banner still covers reminders
  }
}
