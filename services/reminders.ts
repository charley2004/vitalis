import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  getEvents, getStatusMap, occurrencesForDateSync,
  addDaysKey, fmtTime, parseDateKey,
} from './calendar';
import { getTodayKey, getSettings, getRoutineConfig } from './storage';

/** Android channel for routine alarms — loud sound, max importance, bypasses
 *  Do Not Disturb. Notifications on the default channel are ordinary nudges;
 *  this one is for the small set of routines flagged as real wake-up alarms. */
export const ALARM_CHANNEL_ID = 'routine-alarms';
export const ALARM_SOUND = 'alarm.wav';

// Heads-up notification fired a few minutes before a routine's preferredTime —
// deliberately a different channel/sound from the alarm above so the two are
// distinguishable by ear alone: a chime means "coming up", the alarm means
// "this one needs a dismiss".
export const PRE_REMINDER_CHANNEL_ID = 'routine-pre-reminders';
export const PRE_REMINDER_SOUND = 'chime.wav';

// Quiet "it's time" nudge for routines that aren't flagged alarmEnabled —
// left on the system default sound (no `sound` field set on the channel) so
// it's audibly distinct from both the chime and the alarm without needing a
// third custom asset.
export const DUE_CHANNEL_ID = 'routine-due';

// A "Mark Done" quick action, attached to Planner event reminders and quiet
// routine due-nudges so a task can be closed out straight from the
// notification tray — deliberately excluded from alarm/pre-reminder/digest
// notifications, which aren't "one specific task" in the same sense.
// opensAppToForeground: false keeps it silent while the app is backgrounded;
// per Expo's docs, if the app has been fully killed (not just backgrounded)
// the tap won't reach JS at all — a platform limit, not something this app
// can work around without a native background task.
export const TASK_ACTION_CATEGORY = 'task-reminder';
export const MARK_DONE_ACTION = 'MARK_DONE';

async function ensureTaskActionCategory(): Promise<void> {
  const setCategory = (Notifications as any).setNotificationCategoryAsync;
  if (!setCategory) return;
  await setCategory(TASK_ACTION_CATEGORY, [
    { identifier: MARK_DONE_ACTION, buttonTitle: 'Mark Done', options: { opensAppToForeground: false } },
  ]);
}

async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const setChannel = (Notifications as any).setNotificationChannelAsync;
  if (!setChannel) return;
  const importance = (Notifications as any).AndroidImportance?.MAX ?? 5;
  const visibility = (Notifications as any).AndroidNotificationVisibility?.PUBLIC ?? 1;
  await setChannel(ALARM_CHANNEL_ID, {
    name: 'Routine Alarms',
    description: 'Loud, dismiss-to-confirm alarms for routines you flag as wake-up style',
    importance,
    sound: ALARM_SOUND,
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    enableVibrate: true,
    lockscreenVisibility: visibility,
    bypassDnd: true,
  });
  await setChannel(PRE_REMINDER_CHANNEL_ID, {
    name: 'Routine Heads-Up',
    description: 'A soft chime a few minutes before a routine is due',
    importance: (Notifications as any).AndroidImportance?.DEFAULT ?? 3,
    sound: PRE_REMINDER_SOUND,
    vibrationPattern: [0, 150, 100, 150],
    enableVibrate: true,
  });
  await setChannel(DUE_CHANNEL_ID, {
    name: 'Routine Due',
    description: 'Routine start-time nudge, for routines without a loud alarm',
    importance: (Notifications as any).AndroidImportance?.DEFAULT ?? 3,
    vibrationPattern: [0, 200],
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
      await Notifications.scheduleNotificationAsync({
        content: { title: 'VITALIS — MORNING', body: 'Start your morning routines. Check in on Vitalis.' },
        trigger: dailyTriggerFor(settings.morningReminderHour, settings.morningReminderMinute) as any,
      });
    }
    if (settings.eveningReminderEnabled) {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'VITALIS — EVENING', body: 'Log your evening routines before winding down.' },
        trigger: dailyTriggerFor(settings.eveningReminderHour, settings.eveningReminderMinute) as any,
      });
    }

    // ── Routine alarms (loud, per-routine, opt-in) ─────────────────────────
    // Separate from the two nudges above — a routine flagged alarmEnabled
    // gets a loud, dismiss-to-confirm alarm instead of a quiet notification.
    // Tapping it (handled in App.tsx) opens a full-screen ringing view whose
    // dismissal records the real completion time via setRoutineHit.
    const routines = await getRoutineConfig();
    for (const r of routines) {
      if (!r.alarmEnabled || r.enabled === false || r.preferredTime === undefined) continue;
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

        const preTotal = ((r.preferredTime - preMin) % 1440 + 1440) % 1440;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'VITALIS — UP NEXT',
            body: `${r.label} in ${preMin} min`,
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
              body: `Time for ${r.label}`,
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
            trigger: triggerFor(new Date(fireAt)) as any,
          });
        }
      }
    }
  } catch {
    // Expo Go stub or permission failure — in-app banner still covers reminders
  }
}
