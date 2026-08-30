import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { NavigationContainer, Theme } from '@react-navigation/native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';
import { AppNavigator } from './navigation/AppNavigator';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { AlarmRingScreen } from './screens/AlarmRingScreen';
import { AnimatedMark } from './components/AnimatedMark';
import { COLORS } from './theme';
import { syncNow } from './services/sync';
import { setOccurrenceStatus } from './services/calendar';
import { setRoutineHit, getTodayKey } from './services/storage';
import { syncReminders, MARK_DONE_ACTION } from './services/reminders';

interface RingingAlarm { routineId: string; routineLabel: string }

function alarmFromNotificationData(data: unknown): RingingAlarm | null {
  const d = data as { kind?: string; routineId?: string; routineLabel?: string } | undefined;
  if (d?.kind === 'routine-alarm' && typeof d.routineId === 'string') {
    return { routineId: d.routineId, routineLabel: d.routineLabel ?? 'Routine' };
  }
  return null;
}

// "Mark Done" tapped straight from the notification tray — closes out the
// task without opening the app. Re-syncs reminders afterward so any other
// already-scheduled notification for the same task (e.g. a closer-to-start
// reminder queued in the same batch) gets cancelled instead of firing late
// for something that's already done.
async function handleMarkDoneAction(data: unknown): Promise<boolean> {
  const d = data as { kind?: string; eventId?: string; dateKey?: string; routineId?: string } | undefined;
  if (d?.kind === 'planner-task' && typeof d.eventId === 'string' && typeof d.dateKey === 'string') {
    await setOccurrenceStatus(d.eventId, d.dateKey, 'completed');
    await syncReminders();
    return true;
  }
  if (d?.kind === 'routine-task' && typeof d.routineId === 'string') {
    await setRoutineHit(getTodayKey(), d.routineId, true);
    await syncReminders();
    return true;
  }
  return false;
}

// Cloud sync is opt-in (Settings -> Account & Sync); syncNow() itself is a
// no-op when Supabase isn't configured or nobody's signed in, so it's safe
// to fire on every foreground without checking auth state here.
const FOREGROUND_SYNC_MIN_INTERVAL_MS = 2 * 60 * 1000;

// ─── Navigation theme (React Navigation v7 shape) ────────────────────────────

const NAV_THEME: Theme = {
  dark: true,
  colors: {
    primary: COLORS.cyan,
    background: COLORS.background,
    card: '#0C0E14',
    text: COLORS.textPrimary,
    border: COLORS.borderNeon,
    notification: COLORS.red,
  },
  fonts: {
    regular:  { fontFamily: 'Inter-Regular',         fontWeight: '400' },
    medium:   { fontFamily: 'Inter-Medium',          fontWeight: '500' },
    bold:     { fontFamily: 'SpaceGrotesk-Bold',     fontWeight: '700' },
    heavy:    { fontFamily: 'SpaceGrotesk-Bold',     fontWeight: '900' },
  },
};

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [fontsLoaded] = useFonts({
    'SpaceGrotesk-Regular':  SpaceGrotesk_400Regular,
    'SpaceGrotesk-Medium':   SpaceGrotesk_500Medium,
    'SpaceGrotesk-SemiBold': SpaceGrotesk_600SemiBold,
    'SpaceGrotesk-Bold':     SpaceGrotesk_700Bold,
    'Inter-Regular':         Inter_400Regular,
    'Inter-Medium':          Inter_500Medium,
    'Inter-SemiBold':        Inter_600SemiBold,
    'SpaceMono-Regular':     SpaceMono_400Regular,
  });

  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('@vitalis/onboarded').then((val) => {
      setOnboarded(val === 'true');
    }).catch(() => setOnboarded(true));
  }, []);

  const handleOnboardingComplete = useCallback(async () => {
    await AsyncStorage.setItem('@vitalis/onboarded', 'true').catch(() => {});
    setOnboarded(true);
  }, []);

  const lastSyncAttempt = useRef(0);
  useEffect(() => {
    const trySync = () => {
      const now = Date.now();
      if (now - lastSyncAttempt.current < FOREGROUND_SYNC_MIN_INTERVAL_MS) return;
      lastSyncAttempt.current = now;
      syncNow().catch(() => {});
    };
    trySync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') trySync();
    });
    return () => sub.remove();
  }, []);

  // Routine alarms (see services/reminders.ts) ring inside the app, not from
  // the notification itself — the notification's only job is to wake/open
  // the app. Covers three cases: fires while foregrounded, gets tapped from
  // background, or the tap is what launched the app from cold (checked via
  // getLastNotificationResponseAsync since the listener below can't have
  // been attached yet for that one).
  const [ringingAlarm, setRingingAlarm] = useState<RingingAlarm | null>(null);
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      if (response.actionIdentifier === MARK_DONE_ACTION) {
        handleMarkDoneAction(response.notification.request.content.data).catch(() => {});
        return;
      }
      const alarm = alarmFromNotificationData(response.notification.request.content.data);
      if (alarm) setRingingAlarm(alarm);
    }).catch(() => {});

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const alarm = alarmFromNotificationData(notification.request.content.data);
      if (alarm) setRingingAlarm(alarm);
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.actionIdentifier === MARK_DONE_ACTION) {
        handleMarkDoneAction(response.notification.request.content.data).catch(() => {});
        return;
      }
      const alarm = alarmFromNotificationData(response.notification.request.content.data);
      if (alarm) setRingingAlarm(alarm);
    });
    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  // Fonts + onboarding check are near-instant on a warm start but can take
  // a beat on a cold one — show the mark sweeping rather than a blank frame.
  const content = !fontsLoaded || onboarded === null ? (
    <View style={styles.loading}>
      <AnimatedMark size={72} />
    </View>
  ) : !onboarded ? (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <OnboardingScreen onComplete={handleOnboardingComplete} />
    </SafeAreaProvider>
  ) : (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer theme={NAV_THEME}>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );

  return (
    <>
      {content}
      {ringingAlarm && (
        <AlarmRingScreen
          routineId={ringingAlarm.routineId}
          routineLabel={ringingAlarm.routineLabel}
          onDismiss={() => setRingingAlarm(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
