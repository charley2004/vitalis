import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Session } from '@supabase/supabase-js';
import { GlassCard } from '../components/GlassCard';
import {
  COLORS, FONTS, FONT_SIZE, SPACING, RADII,
} from '../theme';
import {
  AppSettings, DEFAULT_SETTINGS, getSettings, saveSettings, KEYS,
} from '../services/storage';
import { syncReminders } from '../services/reminders';
import { isSupabaseConfigured, signOut, getSession, onAuthStateChange } from '../services/auth';
import { syncNow, getLastSyncedAt } from '../services/sync';
import { AccountAuthForm } from '../components/AccountAuthForm';

// ─── Notification scheduling ─────────────────────────────────────────────────
// Scheduling itself lives in services/reminders.ts (syncReminders), shared
// with PlannerScreen — see that file for why this can't be done separately
// per screen (cancelAllScheduledNotificationsAsync is global and destructive).

async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch { return false; }
}

// ─── Row components ───────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <Text style={sectionStyles.label}>{label}</Text>;
}

const sectionStyles = StyleSheet.create({
  label: {
    fontSize: FONT_SIZE.xxs,
    color: COLORS.textMuted,
    fontFamily: FONTS.mono ?? undefined,
    letterSpacing: 2.5,
    fontWeight: '600',
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
});

function Stepper({
  label, value, unit, onDecrement, onIncrement, minValue = 0,
}: {
  label: string; value: number; unit: string;
  onDecrement: () => void; onIncrement: () => void; minValue?: number;
}) {
  return (
    <View style={stepperStyles.row}>
      <Text style={stepperStyles.label}>{label}</Text>
      <View style={stepperStyles.controls}>
        <TouchableOpacity
          onPress={onDecrement}
          style={[stepperStyles.btn, { opacity: value <= minValue ? 0.3 : 1 }]}
          disabled={value <= minValue}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Text style={stepperStyles.btnText}>−</Text>
        </TouchableOpacity>
        <Text style={stepperStyles.value}>{value.toLocaleString()} <Text style={stepperStyles.unit}>{unit}</Text></Text>
        <TouchableOpacity
          onPress={onIncrement}
          style={stepperStyles.btn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Text style={[stepperStyles.btnText, { color: COLORS.textPrimary }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderDim,
  },
  label: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
    fontFamily: FONTS.bodyMedium ?? undefined,
    fontWeight: '500',
  },
  controls: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  btn: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: COLORS.borderNeon,
    borderRadius: RADII.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontSize: FONT_SIZE.md, color: COLORS.textMuted, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  value: {
    fontSize: FONT_SIZE.base,
    color: COLORS.textPrimary,
    fontFamily: FONTS.heading ?? undefined,
    fontWeight: '700',
    minWidth: 80,
    textAlign: 'center',
  },
  unit: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined },
});

function TimeControl({
  label, enabled, hour, minute, onToggle, onHourChange, onMinuteChange,
}: {
  label: string;
  enabled: boolean;
  hour: number;
  minute: number;
  onToggle: (val: boolean) => void;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
}) {
  const fmt = (n: number) => String(n).padStart(2, '0');
  return (
    <View style={timeStyles.container}>
      <View style={timeStyles.topRow}>
        <Text style={timeStyles.label}>{label}</Text>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: COLORS.borderNeon, true: COLORS.textSecondary }}
          thumbColor={enabled ? COLORS.white : COLORS.textMuted}
        />
      </View>
      {enabled && (
        <View style={timeStyles.pickerRow}>
          <View style={timeStyles.field}>
            <Text style={timeStyles.fieldLabel}>HOUR</Text>
            <View style={timeStyles.fieldControls}>
              <TouchableOpacity
                onPress={() => onHourChange((hour + 1) % 24)}
                style={timeStyles.arrowBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${label} hour up`}
              >
                <Text style={timeStyles.arrow}>▲</Text>
              </TouchableOpacity>
              <Text style={timeStyles.timeVal}>{fmt(hour)}</Text>
              <TouchableOpacity
                onPress={() => onHourChange((hour + 23) % 24)}
                style={timeStyles.arrowBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${label} hour down`}
              >
                <Text style={timeStyles.arrow}>▼</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={timeStyles.colon}>:</Text>
          <View style={timeStyles.field}>
            <Text style={timeStyles.fieldLabel}>MIN</Text>
            <View style={timeStyles.fieldControls}>
              <TouchableOpacity
                onPress={() => onMinuteChange((minute + 15) % 60)}
                style={timeStyles.arrowBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${label} minute up`}
              >
                <Text style={timeStyles.arrow}>▲</Text>
              </TouchableOpacity>
              <Text style={timeStyles.timeVal}>{fmt(minute)}</Text>
              <TouchableOpacity
                onPress={() => onMinuteChange((minute + 45) % 60)}
                style={timeStyles.arrowBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${label} minute down`}
              >
                <Text style={timeStyles.arrow}>▼</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={timeStyles.timeDisplay}>{fmt(hour)}:{fmt(minute)}</Text>
        </View>
      )}
    </View>
  );
}

const timeStyles = StyleSheet.create({
  container: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderDim,
    gap: SPACING.sm,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
    fontFamily: FONTS.bodyMedium ?? undefined,
    fontWeight: '500',
  },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingLeft: SPACING.xs },
  field: { alignItems: 'center', gap: SPACING.xs },
  fieldLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },
  fieldControls: { alignItems: 'center', gap: 4 },
  arrowBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  arrow: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined },
  timeVal: {
    fontSize: FONT_SIZE.xl,
    color: COLORS.textPrimary,
    fontFamily: FONTS.heading ?? undefined,
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'center',
  },
  colon: { fontSize: FONT_SIZE.xl, color: COLORS.textSecondary, fontFamily: FONTS.heading ?? undefined, marginTop: 18 },
  timeDisplay: {
    fontSize: FONT_SIZE.base,
    color: COLORS.textSecondary,
    fontFamily: FONTS.mono ?? undefined,
    letterSpacing: 2,
    marginLeft: SPACING.md,
    marginTop: 18,
  },
});

const preReminderStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderDim,
  },
  labelCol: { flex: 1, gap: 2 },
  label: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
    fontFamily: FONTS.bodyMedium ?? undefined,
    fontWeight: '500',
  },
  sub: {
    fontSize: FONT_SIZE.xxs,
    color: COLORS.textMuted,
    fontFamily: FONTS.body ?? undefined,
  },
});

// ─── Account & sync ───────────────────────────────────────────────────────────
// Self-contained: owns its own session/form state so it can be dropped into
// Settings without the parent screen needing to know about auth at all.

function fmtSyncedAt(iso: string | null): string {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

function AccountSyncSection() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refreshSyncedAt = useCallback(() => {
    getLastSyncedAt().then(setLastSyncedAt);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) { setCheckingSession(false); return; }
    getSession().then((s) => { setSession(s); setCheckingSession(false); });
    refreshSyncedAt();
    return onAuthStateChange((s) => setSession(s));
  }, [refreshSyncedAt]);

  const handleSignedIn = useCallback(async () => {
    refreshSyncedAt();
  }, [refreshSyncedAt]);

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    const result = await syncNow();
    setSyncing(false);
    if (result.status === 'error') Alert.alert('Sync failed', result.message);
    refreshSyncedAt();
  }, [refreshSyncedAt]);

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign out', 'Your data stays on this device — signing out just disconnects cloud sync.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <>
        <SectionLabel label="ACCOUNT & SYNC" />
        <GlassCard>
          <View style={[dataStyles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={dataStyles.infoLabel}>Cloud sync</Text>
            <Text style={dataStyles.infoVal}>Not configured</Text>
          </View>
        </GlassCard>
      </>
    );
  }

  if (checkingSession) return null;

  if (session) {
    return (
      <>
        <SectionLabel label="ACCOUNT & SYNC" />
        <GlassCard>
          <View style={dataStyles.infoRow}>
            <Text style={dataStyles.infoLabel}>Signed in as</Text>
            <Text style={dataStyles.infoVal}>{session.user.email}</Text>
          </View>
          <View style={[dataStyles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={dataStyles.infoLabel}>Last synced</Text>
            <Text style={dataStyles.infoVal}>{fmtSyncedAt(lastSyncedAt)}</Text>
          </View>
        </GlassCard>
        <TouchableOpacity onPress={handleSyncNow} style={authStyles.primaryBtn} activeOpacity={0.7} disabled={syncing}>
          {syncing ? <ActivityIndicator color={COLORS.textInverse} /> : <Text style={authStyles.primaryBtnText}>SYNC NOW</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSignOut} style={styles.resetBtn} activeOpacity={0.7}>
          <Text style={styles.resetText}>SIGN OUT</Text>
        </TouchableOpacity>
      </>
    );
  }

  return (
    <>
      <SectionLabel label="ACCOUNT & SYNC" />
      <AccountAuthForm onSignedIn={handleSignedIn} />
    </>
  );
}

const authStyles = StyleSheet.create({
  primaryBtn: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.textPrimary,
    borderRadius: RADII.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textInverse,
    fontFamily: FONTS.mono ?? undefined,
    fontWeight: '700',
    letterSpacing: 2,
  },
});

// ─── SettingsScreen ───────────────────────────────────────────────────────────

export function SettingsScreen() {
  const navigation = useNavigation();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getSettings().then((s) => { if (active) setSettings(s); });
      return () => { active = false; };
    }, [])
  );

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
    if ('morningReminderEnabled' in patch || 'eveningReminderEnabled' in patch ||
        'morningReminderHour' in patch || 'morningReminderMinute' in patch ||
        'eveningReminderHour' in patch || 'eveningReminderMinute' in patch ||
        'routinePreReminderEnabled' in patch || 'routinePreReminderMinutes' in patch) {
      await syncReminders();
    }
  }, [settings]);

  const handleToggleReminder = useCallback(async (type: 'morning' | 'evening', val: boolean) => {
    if (val) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert('Permission required', 'Enable notifications in your device settings to use reminders.');
        return;
      }
    }
    if (type === 'morning') update({ morningReminderEnabled: val });
    else update({ eveningReminderEnabled: val });
  }, [update]);

  const handleTogglePreReminder = useCallback(async (val: boolean) => {
    if (val) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert('Permission required', 'Enable notifications in your device settings to use reminders.');
        return;
      }
    }
    update({ routinePreReminderEnabled: val });
  }, [update]);

  const handleResetData = useCallback(() => {
    Alert.alert(
      'RESET ALL DATA',
      'This will permanently delete all your logs, routines, scores, and settings. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'RESET',
          style: 'destructive',
          onPress: async () => {
            try {
              const keys = await AsyncStorage.getAllKeys();
              const vitalisKeys = keys.filter((k) => k.startsWith('@vitalis/'));
              await AsyncStorage.multiRemove(vitalisKeys);
              setSettings({ ...DEFAULT_SETTINGS });
              Alert.alert('Data cleared', 'All Vitalis data has been removed.');
            } catch {
              Alert.alert('Error', 'Could not reset data. Please try again.');
            }
          },
        },
      ]
    );
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>SETTINGS</Text>
          <Text style={styles.screenSub}>SYSTEM CONFIGURATION</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionLabel label="FINANCE" />
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => (navigation as any).navigate('Finance', { initialSection: 'settings' })}
        >
          <GlassCard>
            <View style={styles.financeRow}>
              <Text style={styles.financeRowLabel}>Finance Settings</Text>
              <Text style={styles.financeRowArrow}>›</Text>
            </View>
          </GlassCard>
        </TouchableOpacity>

        <SectionLabel label="DAILY GOALS" />
        <GlassCard>
          <Stepper
            label="Water Goal"
            value={settings.waterGoal}
            unit="glasses"
            minValue={1}
            onDecrement={() => update({ waterGoal: Math.max(1, settings.waterGoal - 1) })}
            onIncrement={() => update({ waterGoal: settings.waterGoal + 1 })}
          />
          <Stepper
            label="Step Goal"
            value={settings.stepGoal}
            unit="steps"
            minValue={1000}
            onDecrement={() => update({ stepGoal: Math.max(1000, settings.stepGoal - 1000) })}
            onIncrement={() => update({ stepGoal: settings.stepGoal + 1000 })}
          />
        </GlassCard>

        <SectionLabel label="REMINDERS" />
        <GlassCard>
          <TimeControl
            label="Morning Reminder"
            enabled={settings.morningReminderEnabled}
            hour={settings.morningReminderHour}
            minute={settings.morningReminderMinute}
            onToggle={(val) => handleToggleReminder('morning', val)}
            onHourChange={(h) => update({ morningReminderHour: h })}
            onMinuteChange={(m) => update({ morningReminderMinute: m })}
          />
          <TimeControl
            label="Evening Reminder"
            enabled={settings.eveningReminderEnabled}
            hour={settings.eveningReminderHour}
            minute={settings.eveningReminderMinute}
            onToggle={(val) => handleToggleReminder('evening', val)}
            onHourChange={(h) => update({ eveningReminderHour: h })}
            onMinuteChange={(m) => update({ eveningReminderMinute: m })}
          />
          <View style={preReminderStyles.row}>
            <View style={preReminderStyles.labelCol}>
              <Text style={preReminderStyles.label}>Routine Heads-Up</Text>
              <Text style={preReminderStyles.sub}>Chime before, nudge when it's due — every routine with a time set</Text>
            </View>
            <Switch
              value={settings.routinePreReminderEnabled}
              onValueChange={handleTogglePreReminder}
              trackColor={{ false: COLORS.borderNeon, true: COLORS.textSecondary }}
              thumbColor={settings.routinePreReminderEnabled ? COLORS.white : COLORS.textMuted}
            />
          </View>
          {settings.routinePreReminderEnabled && (
            <Stepper
              label="Heads-Up Lead Time"
              value={settings.routinePreReminderMinutes}
              unit="min"
              minValue={5}
              onDecrement={() => update({ routinePreReminderMinutes: Math.max(5, settings.routinePreReminderMinutes - 1) })}
              onIncrement={() => update({ routinePreReminderMinutes: Math.min(10, settings.routinePreReminderMinutes + 1) })}
            />
          )}
        </GlassCard>

        <AccountSyncSection />

        <SectionLabel label="DATA" />
        <GlassCard>
          <View style={dataStyles.infoRow}>
            <Text style={dataStyles.infoLabel}>Storage</Text>
            <Text style={dataStyles.infoVal}>On-device, always · Cloud sync is opt-in</Text>
          </View>
          <View style={[dataStyles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={dataStyles.infoLabel}>Privacy</Text>
            <Text style={dataStyles.infoVal}>No tracking · No third parties</Text>
          </View>
        </GlassCard>

        <TouchableOpacity onPress={handleResetData} style={styles.resetBtn} activeOpacity={0.7}>
          <Text style={styles.resetText}>RESET ALL DATA</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>VITALIS v1.0 · SDK 54</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const dataStyles = StyleSheet.create({
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderDim,
  },
  infoLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.bodyMedium ?? undefined },
  infoVal: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING.screenPad,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderDim,
  },
  screenTitle: { fontSize: FONT_SIZE.xl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 3 },
  screenSub: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginTop: 2 },
  scroll: { padding: SPACING.screenPad, paddingBottom: SPACING.xxl, gap: SPACING.sm },
  financeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  financeRowLabel: { fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.bodyMedium ?? undefined },
  financeRowArrow: { fontSize: FONT_SIZE.lg, color: COLORS.textMuted },
  resetBtn: {
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.red,
    borderRadius: RADII.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  resetText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.red,
    fontFamily: FONTS.mono ?? undefined,
    fontWeight: '700',
    letterSpacing: 2,
  },
  versionText: {
    textAlign: 'center',
    fontSize: FONT_SIZE.xxs,
    color: COLORS.textMuted,
    fontFamily: FONTS.mono ?? undefined,
    letterSpacing: 1,
    marginTop: SPACING.md,
  },
});
