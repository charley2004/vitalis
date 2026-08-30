import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  Switch,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../theme';
import {
  BoltIcon, SignalIcon, CalendarIcon, RunnerIcon, DropletIcon, MoonIcon,
  BellIcon, ShieldIcon, LockIcon, AppIcon,
} from '../components/icons';
import { AccountAuthForm } from '../components/AccountAuthForm';
import {
  getSettings, saveSettings, saveRoutineConfig, DEFAULT_ROUTINES,
  getGrowthGoals, saveGrowthGoals, KEYS,
  type RoutineDefinition, type AppSettings,
} from '../services/storage';
import { syncReminders } from '../services/reminders';
import { fmtTime } from '../services/calendar';
import { isSupabaseConfigured } from '../services/auth';

type Step = 'welcome' | 'goals' | 'schedule' | 'training' | 'habits' | 'permissions' | 'account';
type EquipmentAccess = AppSettings['equipmentAccess'];
type FitnessLevel = AppSettings['fitnessLevel'];

const FEATURES = [
  { Icon: BoltIcon,   title: 'TRACK', body: 'Monitor every biometric signal and daily habit in real-time.' },
  { Icon: SignalIcon, title: 'TRAIN', body: 'Adaptive workout protocols tailored to your recovery state.' },
  { Icon: CalendarIcon, title: 'PLANNER', body: 'A smart calendar that aligns your goals with your reality.' },
];

const STEP_OPTS = { min: 2000, max: 20000, step: 500 };
const WATER_OPTS = { min: 500, max: 4000, step: 250 };
const SLEEP_OPTS = { min: 5, max: 10, step: 0.5 };
// DEFAULT_ROUTINES' morning block was designed around a 6:00 AM wake time,
// with the first routine (Cold Exposure) starting right at the anchor. The
// seeded Wake Up routine sits at the stated wake time itself, so the anchor
// used for shifting is offset 5 minutes earlier — otherwise Wake Up and the
// first routine would land on the exact same minute.
const MORNING_ANCHOR_MINUTES = 6 * 60 - 5;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function fmtWeeklySteps(dailyStep: number): string {
  return `${(dailyStep * 7 / 1000).toFixed(1)}k`;
}
function fmtWeeklyWater(dailyMl: number): string {
  return `${(dailyMl * 7 / 1000).toFixed(1)}L`;
}
function fmtWeeklySleep(dailyHrs: number): string {
  return `${Math.round(dailyHrs * 7)}h`;
}

export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const btnScale = useRef(new Animated.Value(1)).current;
  const handlePressIn  = () => Animated.spring(btnScale, { toValue: 0.96, useNativeDriver: true, speed: 24, bounciness: 2 }).start();
  const handlePressOut = () => Animated.spring(btnScale, { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 4 }).start();

  // Goal setup state
  const [stepGoal, setStepGoal] = useState(8000);
  const [waterMl,  setWaterMl]  = useState(2000);
  const [sleepGoal, setSleepGoal] = useState(7.5);

  // Schedule state
  const [wakeTime, setWakeTime] = useState(420); // 7:00 AM
  const [wantsAlarm, setWantsAlarm] = useState(true);

  // Training profile state
  const [currentWeight, setCurrentWeight] = useState('');
  const [goalWeight, setGoalWeight] = useState('');
  const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState(4);
  const [equipmentAccess, setEquipmentAccess] = useState<EquipmentAccess>('all');
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>('intermediate');

  // Habits state — every default routine starts selected
  const [selectedRoutineIds, setSelectedRoutineIds] = useState<Set<string>>(
    () => new Set(DEFAULT_ROUTINES.map((r) => r.id))
  );

  // Permissions state
  const [plannerEnabled, setPlannerEnabled]     = useState(false);
  const [activityEnabled, setActivityEnabled]   = useState(false);
  const [notifEnabled, setNotifEnabled]         = useState(false);

  const bedtimeMinutes = clamp(wakeTime - Math.round(sleepGoal * 60), 0, 23 * 60 + 59);

  const buildFinalRoutineConfig = useCallback((): RoutineDefinition[] => {
    const delta = wakeTime - MORNING_ANCHOR_MINUTES;
    const shifted = DEFAULT_ROUTINES.map((r) => {
      const enabled = selectedRoutineIds.has(r.id);
      if (r.slot !== 'MORNING' || r.preferredTime === undefined) return { ...r, enabled };
      return { ...r, enabled, preferredTime: clamp(r.preferredTime + delta, 0, 23 * 60 + 59) };
    });
    const wakeRoutine: RoutineDefinition = {
      id: 'wake_up', label: 'Wake Up', emoji: 'sunrise', slot: 'MORNING',
      target: 'Rise & shine', preferredTime: wakeTime, durationMinutes: 1,
      enabled: true, alarmEnabled: wantsAlarm,
    };
    return [wakeRoutine, ...shifted];
  }, [wakeTime, wantsAlarm, selectedRoutineIds]);

  // Runs once, at the very end of onboarding regardless of which permissions
  // path the user takes — everything collected across goals/schedule/
  // training/habits gets persisted together here.
  const finishSetup = useCallback(async () => {
    try {
      const current = await getSettings();
      await saveSettings({
        ...current,
        stepGoal,
        waterGoal: Math.round(waterMl / 250),
        sleepGoalHours: sleepGoal,
        trainingDaysPerWeek,
        equipmentAccess,
        fitnessLevel,
        morningReminderHour: Math.floor(wakeTime / 60),
        morningReminderMinute: wakeTime % 60,
        eveningReminderHour: Math.floor(bedtimeMinutes / 60),
        eveningReminderMinute: bedtimeMinutes % 60,
      });

      await saveRoutineConfig(buildFinalRoutineConfig());

      const curWeight = parseFloat(currentWeight);
      const goalW = parseFloat(goalWeight);
      const hasWeight = !isNaN(curWeight) && curWeight > 0;
      if (hasWeight) {
        await AsyncStorage.setItem(KEYS.weight, String(curWeight));
        await AsyncStorage.setItem(KEYS.weightStart, String(curWeight));
      }

      const goals = await getGrowthGoals();
      const updatedGoals = goals.map((g) => {
        if (g.id === 'g2') return { ...g, target: trainingDaysPerWeek * 52 };
        if (g.id === 'g1' && hasWeight && !isNaN(goalW) && goalW > 0 && goalW !== curWeight) {
          const losing = goalW < curWeight;
          return { ...g, label: losing ? 'Weight Loss' : 'Weight Gain', unit: losing ? 'kg lost' : 'kg gained', target: Math.abs(curWeight - goalW) };
        }
        return g;
      });
      await saveGrowthGoals(updatedGoals);
    } catch {}
  }, [stepGoal, waterMl, sleepGoal, trainingDaysPerWeek, equipmentAccess, fitnessLevel, wakeTime, bedtimeMinutes, buildFinalRoutineConfig, currentWeight, goalWeight]);

  const handleToggleNotifications = useCallback(async (value: boolean) => {
    if (!value) { setNotifEnabled(false); return; }
    try {
      const res = await Notifications.requestPermissionsAsync();
      setNotifEnabled(!!res.granted);
    } catch {
      setNotifEnabled(false);
    }
  }, []);

  const persistPermissions = useCallback(async (overrides?: { planner?: boolean; activity?: boolean; notif?: boolean }) => {
    try {
      const current = await getSettings();
      const planner = overrides?.planner ?? plannerEnabled;
      const activity = overrides?.activity ?? activityEnabled;
      const notif = overrides?.notif ?? notifEnabled;
      await saveSettings({
        ...current,
        plannerTipsEnabled: planner,
        activityRemindersEnabled: activity,
        notificationsEnabled: notif,
        morningReminderEnabled: notif || current.morningReminderEnabled,
        eveningReminderEnabled: notif || current.eveningReminderEnabled,
      });
    } catch {}
  }, [plannerEnabled, activityEnabled, notifEnabled]);

  const handleAllowAllAndFinish = useCallback(async () => {
    setPlannerEnabled(true);
    setActivityEnabled(true);
    let granted = false;
    try {
      const res = await Notifications.requestPermissionsAsync();
      granted = !!res.granted;
    } catch {}
    setNotifEnabled(granted);
    await finishSetup();
    await persistPermissions({ planner: true, activity: true, notif: granted });
    if (granted) await syncReminders();
    setStep('account');
  }, [finishSetup, persistPermissions]);

  const handleDecideLater = useCallback(async () => {
    await finishSetup();
    await persistPermissions();
    if (notifEnabled) await syncReminders();
    setStep('account');
  }, [finishSetup, persistPermissions, notifEnabled]);

  if (step === 'welcome') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.logoBox}><BoltIcon size={18} color={COLORS.textPrimary} /></View>
          <Text style={styles.menuDots}>⋮</Text>
        </View>
        <ScrollView contentContainerStyle={styles.welcomeScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.versionLabel}>INTRODUCING VERSION 1.0</Text>
          <Text style={styles.heroTitle}>
            VITALIS:{'\n'}
            <Text style={{ color: COLORS.textMuted }}>YOUR</Text>{'\n'}
            OPERATING SYSTEM.
          </Text>
          <Text style={styles.heroSub}>
            The comprehensive platform for health, performance, and life management.
          </Text>

          <View style={styles.featureList}>
            {FEATURES.map((f, i) => (
              <View key={i} style={[styles.featureRow, i > 0 && styles.featureRowBorder]}>
                <View style={styles.featureIconWrap}><f.Icon size={18} color={COLORS.textSecondary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureBody}>{f.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={styles.welcomeFooter}>
          <View style={styles.dotsRow}>
            <View style={[styles.dot, styles.dotActive]} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
          <Animated.View style={{ transform: [{ scale: btnScale }] }}>
            <TouchableOpacity
              onPress={() => setStep('goals')}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              activeOpacity={1}
              style={styles.ctaBtn}
            >
              <Text style={styles.ctaBtnText}>Get started</Text>
              <Text style={styles.ctaBtnArrow}>→</Text>
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.ctaCaption}>DESIGNED FOR OPTIMAL HUMAN PERFORMANCE</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'goals') {
    return (
      <SafeAreaView style={styles.safe}>
        <StepHeader title="GOAL SETUP" stepNum={2} onBack={() => setStep('welcome')} />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.headline}>DEFINE YOUR BASELINE</Text>
          <Text style={styles.subhead}>
            VITALIS optimizes your daily routine based on your minimum functional requirements.
          </Text>

          <GoalCard
            Icon={RunnerIcon} label="DAILY STEPS" value={stepGoal.toLocaleString()} unit="STEPS"
            sub="Active movement threshold"
            onMinus={() => setStepGoal((v) => clamp(v - STEP_OPTS.step, STEP_OPTS.min, STEP_OPTS.max))}
            onPlus={() => setStepGoal((v) => clamp(v + STEP_OPTS.step, STEP_OPTS.min, STEP_OPTS.max))}
          />
          <GoalCard
            Icon={DropletIcon} label="HYDRATION" value={String(waterMl)} unit="ML"
            sub="Essential metabolic fluid intake"
            onMinus={() => setWaterMl((v) => clamp(v - WATER_OPTS.step, WATER_OPTS.min, WATER_OPTS.max))}
            onPlus={() => setWaterMl((v) => clamp(v + WATER_OPTS.step, WATER_OPTS.min, WATER_OPTS.max))}
          />
          <GoalCard
            Icon={MoonIcon} label="SLEEP WINDOW" value={String(sleepGoal)} unit="HRS"
            sub="Optimal circadian recovery period"
            onMinus={() => setSleepGoal((v) => clamp(Math.round((v - SLEEP_OPTS.step) * 10) / 10, SLEEP_OPTS.min, SLEEP_OPTS.max))}
            onPlus={() => setSleepGoal((v) => clamp(Math.round((v + SLEEP_OPTS.step) * 10) / 10, SLEEP_OPTS.min, SLEEP_OPTS.max))}
          />

          <View style={styles.impactCard}>
            <View style={styles.impactTopRow}>
              <Text style={styles.impactTitle}>↗ WEEKLY IMPACT</Text>
              <Text style={styles.impactInfo}>ⓘ</Text>
            </View>
            <View style={styles.impactStatsRow}>
              <View>
                <Text style={styles.impactStatLabel}>ACTIVITY</Text>
                <Text style={styles.impactStatValue}>{fmtWeeklySteps(stepGoal)}</Text>
              </View>
              <View>
                <Text style={styles.impactStatLabel}>HYDRATION</Text>
                <Text style={styles.impactStatValue}>{fmtWeeklyWater(waterMl)}</Text>
              </View>
              <View>
                <Text style={styles.impactStatLabel}>RECOVERY</Text>
                <Text style={styles.impactStatValue}>{fmtWeeklySleep(sleepGoal)}</Text>
              </View>
            </View>
            <View style={styles.impactNote}>
              <Text style={styles.impactNoteText}>
                These targets set your starting baseline — Vitalis tracks your progress against them from day one.
              </Text>
            </View>
          </View>

          <View style={{ height: SPACING.xl }} />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity onPress={() => setStep('schedule')} style={styles.primaryBtn} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'schedule') {
    return (
      <SafeAreaView style={styles.safe}>
        <StepHeader title="SCHEDULE" stepNum={3} onBack={() => setStep('goals')} />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.headline}>WHEN DO YOU WAKE UP?</Text>
          <Text style={styles.subhead}>
            Vitalis times your morning routines — and your wake-up alarm — around this.
          </Text>

          <View style={styles.timeCard}>
            <Text style={styles.timeCardLabel}>WAKE TIME</Text>
            <View style={styles.timeStepperRow}>
              <TouchableOpacity onPress={() => setWakeTime((v) => clamp(v - 60, 0, 23 * 60 + 59))} style={styles.timeStepBtn} activeOpacity={0.7}>
                <Text style={styles.timeStepBtnText}>-1H</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setWakeTime((v) => clamp(v - 15, 0, 23 * 60 + 59))} style={styles.timeStepBtn} activeOpacity={0.7}>
                <Text style={styles.timeStepBtnText}>-15</Text>
              </TouchableOpacity>
              <Text style={styles.timeStepValue}>{fmtTime(wakeTime)}</Text>
              <TouchableOpacity onPress={() => setWakeTime((v) => clamp(v + 15, 0, 23 * 60 + 59))} style={styles.timeStepBtn} activeOpacity={0.7}>
                <Text style={styles.timeStepBtnText}>+15</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setWakeTime((v) => clamp(v + 60, 0, 23 * 60 + 59))} style={styles.timeStepBtn} activeOpacity={0.7}>
                <Text style={styles.timeStepBtnText}>+1H</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.timeCardHint}>
              Based on your {sleepGoal}h sleep goal, that puts bedtime around {fmtTime(bedtimeMinutes)}.
            </Text>
          </View>

          <View style={[styles.field, styles.enabledRow]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>WAKE-UP ALARM</Text>
              <Text style={styles.fieldHint}>
                A loud, dismiss-to-confirm alarm at {fmtTime(wakeTime)} — dismissing marks it done at that exact moment.
              </Text>
            </View>
            <Switch
              value={wantsAlarm}
              onValueChange={setWantsAlarm}
              trackColor={{ false: COLORS.borderNeon, true: COLORS.amber }}
              thumbColor={COLORS.textInverse}
              ios_backgroundColor={COLORS.borderNeon}
            />
          </View>

          <View style={{ height: SPACING.xl }} />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity onPress={() => setStep('training')} style={styles.primaryBtn} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'training') {
    return (
      <SafeAreaView style={styles.safe}>
        <StepHeader title="TRAINING PROFILE" stepNum={4} onBack={() => setStep('schedule')} />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.headline}>PERSONALIZE YOUR TRAINING</Text>
          <Text style={styles.subhead}>
            Drives your workout recommendations and Growth targets. Weight is optional.
          </Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>WEIGHT (KG) — OPTIONAL</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={currentWeight}
                onChangeText={setCurrentWeight}
                keyboardType="numeric"
                placeholder="Current"
                placeholderTextColor={COLORS.textMuted}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={goalWeight}
                onChangeText={setGoalWeight}
                keyboardType="numeric"
                placeholder="Goal"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
            <Text style={styles.fieldHint}>Leave blank if you'd rather not share — nothing is required here.</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>TRAINING DAYS / WEEK</Text>
            <View style={styles.timeStepperRow}>
              <TouchableOpacity onPress={() => setTrainingDaysPerWeek((v) => clamp(v - 1, 1, 7))} style={styles.timeStepBtn} activeOpacity={0.7}>
                <Text style={styles.timeStepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.timeStepValue}>{trainingDaysPerWeek}</Text>
              <TouchableOpacity onPress={() => setTrainingDaysPerWeek((v) => clamp(v + 1, 1, 7))} style={styles.timeStepBtn} activeOpacity={0.7}>
                <Text style={styles.timeStepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>EQUIPMENT ACCESS</Text>
            <View style={styles.choiceRow}>
              {(['bodyweight', 'gym', 'all'] as EquipmentAccess[]).map((opt) => (
                <ChoiceChip
                  key={opt}
                  label={opt === 'all' ? 'ALL' : opt === 'bodyweight' ? 'BODYWEIGHT' : 'GYM'}
                  active={equipmentAccess === opt}
                  onPress={() => setEquipmentAccess(opt)}
                />
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>EXPERIENCE LEVEL</Text>
            <View style={styles.choiceRow}>
              {(['beginner', 'intermediate', 'advanced'] as FitnessLevel[]).map((opt) => (
                <ChoiceChip
                  key={opt}
                  label={opt.toUpperCase()}
                  active={fitnessLevel === opt}
                  onPress={() => setFitnessLevel(opt)}
                />
              ))}
            </View>
          </View>

          <View style={{ height: SPACING.xl }} />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity onPress={() => setStep('habits')} style={styles.primaryBtn} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'habits') {
    const bySlot = (slot: RoutineDefinition['slot']) => DEFAULT_ROUTINES.filter((r) => r.slot === slot);
    return (
      <SafeAreaView style={styles.safe}>
        <StepHeader title="ROUTINES" stepNum={5} onBack={() => setStep('training')} />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.headline}>CHOOSE YOUR ROUTINES</Text>
          <Text style={styles.subhead}>
            Everything below is on by default — turn off anything that doesn't fit your life. Add or edit these anytime in Routines.
          </Text>

          {(['MORNING', 'NOON', 'NIGHT'] as const).map((slot) => (
            <View key={slot} style={{ marginBottom: SPACING.md }}>
              <Text style={styles.slotSectionLabel}>{slot}</Text>
              {bySlot(slot).map((r) => (
                <View key={r.id} style={styles.habitRow}>
                  <View style={styles.habitIconBox}><AppIcon id={r.emoji} size={16} color={COLORS.textSecondary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.habitLabel}>{r.label}</Text>
                    <Text style={styles.habitSub}>{r.target}</Text>
                  </View>
                  <Switch
                    value={selectedRoutineIds.has(r.id)}
                    onValueChange={(v) => setSelectedRoutineIds((prev) => {
                      const next = new Set(prev);
                      if (v) next.add(r.id); else next.delete(r.id);
                      return next;
                    })}
                    trackColor={{ false: COLORS.borderNeon, true: COLORS.textPrimary }}
                    thumbColor={COLORS.textInverse}
                    ios_backgroundColor={COLORS.borderNeon}
                  />
                </View>
              ))}
            </View>
          ))}

          <View style={{ height: SPACING.xl }} />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity onPress={() => setStep('permissions')} style={styles.primaryBtn} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Continue to Permissions</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'permissions') {
  return (
    <SafeAreaView style={styles.safe}>
      <StepHeader title="ACCESS" stepNum={6} onBack={() => setStep('habits')} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepOfLabel}>STEP 6 OF 7</Text>
        <Text style={styles.headlineLg}>System Permissions</Text>
        <Text style={styles.subhead}>Enable integration to unlock the full VITALIS ecosystem.</Text>

        <PermissionRow
          Icon={CalendarIcon}
          title="Calendar Access"
          body="Use Vitalis's built-in smart planner to auto-generate productivity windows and workout slots."
          value={plannerEnabled}
          onChange={setPlannerEnabled}
        />
        <PermissionRow
          Icon={SignalIcon}
          title="Motion & Health"
          tag="PREFERENCE"
          body="Get gentle reminders to log steps and hydration toward your daily activity targets."
          value={activityEnabled}
          onChange={setActivityEnabled}
        />
        <PermissionRow
          Icon={BellIcon}
          title="Smart Notifications"
          body="Get gentle nudges for water intake, workout reminders, and sleep schedule alerts — including your wake-up alarm, if enabled."
          value={notifEnabled}
          onChange={handleToggleNotifications}
        />

        <View style={styles.privacyCard}>
          <View style={styles.privacyTopRow}>
            <ShieldIcon size={16} color={COLORS.textSecondary} />
            <Text style={styles.privacyTitle}>PRIVACY PROTOCOL V1.2</Text>
          </View>
          <Text style={styles.privacyBody}>
            VITALIS is built on an <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>on-device-first</Text> architecture.
            Your health metrics stay on this device and are never sold.
          </Text>
          <View style={styles.privacyBadge}>
            <LockIcon size={11} color={COLORS.textMuted} />
            <Text style={styles.privacyBadgeText}>STORED LOCALLY ONLY</Text>
          </View>
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity onPress={handleAllowAllAndFinish} style={styles.primaryBtn} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Allow All & Continue</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDecideLater} activeOpacity={0.7} style={{ paddingTop: SPACING.sm }}>
          <Text style={styles.decideLaterText}>Decide later</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
  }

  // step === 'account' (final step — falls through if none of the above matched)
  return (
    <SafeAreaView style={styles.safe}>
      <StepHeader title="SYNC" stepNum={7} onBack={() => setStep('permissions')} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepOfLabel}>STEP 7 OF 7</Text>
        <Text style={styles.headlineLg}>Sync Across Devices?</Text>
        <Text style={styles.subhead}>
          Optional. Vitalis works fully offline on this device either way — create an account only if you want your data backed up and available on another device.
        </Text>

        {isSupabaseConfigured ? (
          <AccountAuthForm onSignedIn={onComplete} />
        ) : (
          <View style={styles.privacyCard}>
            <View style={styles.privacyTopRow}>
              <ShieldIcon size={16} color={COLORS.textSecondary} />
              <Text style={styles.privacyTitle}>CLOUD SYNC UNAVAILABLE</Text>
            </View>
            <Text style={styles.privacyBody}>
              This build isn't connected to cloud sync — everything still works fully on-device.
            </Text>
          </View>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity onPress={onComplete} style={styles.primaryBtn} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Shared step header ─────────────────────────────────────────────────────

function StepHeader({ title, stepNum, onBack }: { title: string; stepNum: number; onBack: () => void }) {
  return (
    <View style={styles.stepHeader}>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={10}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Text style={styles.backArrow}>‹</Text>
      </TouchableOpacity>
      <Text style={styles.stepHeaderTitle}>{title}</Text>
      <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>STEP 0{stepNum}/07</Text></View>
    </View>
  );
}

// ─── Choice chip (equipment / experience) ───────────────────────────────────

function ChoiceChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.choiceChip, active && styles.choiceChipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.choiceChipText, active && { color: COLORS.textInverse }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Goal card (steps / hydration / sleep) ────────────────────────────────────

function GoalCard({ Icon, label, value, unit, sub, onMinus, onPlus }: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string; value: string; unit: string; sub: string;
  onMinus: () => void; onPlus: () => void;
}) {
  return (
    <View style={styles.goalCard}>
      <View style={styles.goalTopRow}>
        <View style={styles.goalIconBox}><Icon size={16} color={COLORS.textSecondary} /></View>
        <Text style={styles.goalLabel}>{label}</Text>
        <View style={{ flex: 1 }} />
        <View style={styles.activePill}><Text style={styles.activePillText}>Target Active</Text></View>
      </View>
      <View style={styles.goalValueRow}>
        <Text style={styles.goalValue}>{value}</Text>
        <Text style={styles.goalUnit}>{unit}</Text>
      </View>
      <Text style={styles.goalSub}>{sub}</Text>
      <View style={styles.goalControls}>
        <TouchableOpacity
          onPress={onMinus}
          style={styles.goalBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Text style={styles.goalBtnText}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onPlus}
          style={styles.goalBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Text style={styles.goalBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Permission row ────────────────────────────────────────────────────────────

function PermissionRow({ Icon, title, tag, body, value, onChange }: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string; tag?: string; body: string;
  value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.permRow}>
      <View style={styles.permIconBox}><Icon size={18} color={COLORS.textSecondary} /></View>
      <View style={{ flex: 1 }}>
        <View style={styles.permTitleRow}>
          <Text style={styles.permTitle}>{title}</Text>
          {tag && <View style={styles.permTag}><Text style={styles.permTagText}>{tag}</Text></View>}
        </View>
        <Text style={styles.permBody}>{body}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: COLORS.borderNeon, true: COLORS.textPrimary }}
        thumbColor={COLORS.textInverse}
        ios_backgroundColor={COLORS.borderNeon}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },

  // Shared header (goal setup / schedule / training / habits / permissions)
  stepHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenPad, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderDim,
  },
  backArrow: { fontSize: 28, color: COLORS.textSecondary, lineHeight: 30 },
  stepHeaderTitle: {
    fontSize: FONT_SIZE.sm, color: COLORS.textPrimary,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 2,
  },
  stepBadge: { borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.sm, paddingHorizontal: SPACING.sm, paddingVertical: 4 },
  stepBadgeText: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },
  menuDots: { fontSize: FONT_SIZE.xl, color: COLORS.textMuted },

  scroll: { paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.lg },
  headline: {
    fontSize: FONT_SIZE.xxl, color: COLORS.textPrimary,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 0.5, marginBottom: SPACING.xs,
  },
  headlineLg: {
    fontSize: FONT_SIZE.xxxl, color: COLORS.textPrimary,
    fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: -0.5, marginTop: SPACING.xs,
  },
  stepOfLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700' },
  subhead: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, lineHeight: 20, marginBottom: SPACING.lg, marginTop: SPACING.xs },

  // Goal cards
  goalCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.lg, padding: SPACING.md, marginBottom: SPACING.md,
  },
  goalTopRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  goalIconBox: {
    width: 30, height: 30, borderRadius: RADII.sm,
    borderWidth: 1, borderColor: COLORS.borderDim, backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  goalLabel: { fontSize: 9, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },
  activePill: { borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.full, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  activePillText: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5 },
  goalValueRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginTop: SPACING.md },
  goalValue: { fontSize: FONT_SIZE.display, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: -1 },
  goalUnit: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined },
  goalSub: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', marginTop: 4, marginBottom: SPACING.md },
  goalControls: { flexDirection: 'row', gap: SPACING.sm },
  goalBtn: {
    flex: 1, backgroundColor: COLORS.surfaceElevated, borderRadius: RADII.md,
    paddingVertical: SPACING.sm + 2, alignItems: 'center',
  },
  goalBtnText: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontWeight: '700' },

  // Weekly impact
  impactCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.lg, padding: SPACING.md, marginTop: SPACING.xs,
  },
  impactTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  impactTitle: { fontSize: 9, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },
  impactInfo: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  impactStatsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md },
  impactStatLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, marginBottom: 3 },
  impactStatValue: { fontSize: FONT_SIZE.md, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  impactNote: { borderTopWidth: 1, borderTopColor: COLORS.borderDim, paddingTop: SPACING.sm },
  impactNoteText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, lineHeight: 17 },

  // Schedule step
  timeCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.lg, padding: SPACING.md, marginBottom: SPACING.md, alignItems: 'center',
  },
  timeCardLabel: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700', marginBottom: SPACING.sm, alignSelf: 'flex-start' },
  timeStepperRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  timeStepBtn: {
    minWidth: 44, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surfaceElevated, borderRadius: RADII.sm, alignItems: 'center',
  },
  timeStepBtnText: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined, fontWeight: '700' },
  timeStepValue: {
    fontSize: FONT_SIZE.xxl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined,
    fontWeight: '700', minWidth: 96, textAlign: 'center',
  },
  timeCardHint: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginTop: SPACING.md, textAlign: 'center' },

  field: { gap: SPACING.xs, marginBottom: SPACING.md },
  fieldLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5 },
  fieldHint: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, lineHeight: 15 },
  enabledRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  row: { flexDirection: 'row', gap: SPACING.sm },
  input: {
    borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2,
    fontSize: FONT_SIZE.base, color: COLORS.textPrimary, fontFamily: FONTS.body ?? undefined,
    backgroundColor: COLORS.surface,
  },

  // Choice chips (equipment / experience)
  choiceRow: { flexDirection: 'row', gap: SPACING.sm },
  choiceChip: {
    flex: 1, borderWidth: 1, borderColor: COLORS.borderNeon, borderRadius: RADII.sm,
    paddingVertical: SPACING.sm, alignItems: 'center', backgroundColor: COLORS.surface,
  },
  choiceChipActive: { borderColor: COLORS.textPrimary, backgroundColor: COLORS.textPrimary },
  choiceChipText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 0.5 },

  // Habits step
  slotSectionLabel: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700', marginBottom: SPACING.sm },
  habitRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.md, padding: SPACING.sm, marginBottom: SPACING.xs,
  },
  habitIconBox: {
    width: 32, height: 32, borderRadius: RADII.sm,
    borderWidth: 1, borderColor: COLORS.borderDim, backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  habitLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.bodySemi ?? undefined, fontWeight: '600' },
  habitSub: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, marginTop: 1 },

  // Permissions
  permRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderDim,
    borderRadius: RADII.lg, padding: SPACING.md, marginBottom: SPACING.sm,
  },
  permIconBox: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 1, borderColor: COLORS.borderDim, backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  permTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: 3 },
  permTitle: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.bodySemi ?? undefined, fontWeight: '600' },
  permTag: { borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.xs, paddingHorizontal: 5, paddingVertical: 1 },
  permTagText: { fontSize: 7, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 0.5 },
  permBody: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, lineHeight: 15 },

  // Privacy card
  privacyCard: {
    borderWidth: 1, borderColor: COLORS.borderDim, borderRadius: RADII.lg,
    padding: SPACING.md, marginTop: SPACING.md,
  },
  privacyTopRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.sm },
  privacyTitle: { fontSize: 9, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },
  privacyBody: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, lineHeight: 18, marginBottom: SPACING.sm },
  privacyBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  privacyBadgeText: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },

  // Shared footer / buttons
  footer: {
    paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.md, paddingBottom: SPACING.md,
    borderTopWidth: 1, borderTopColor: COLORS.borderDim, backgroundColor: COLORS.background,
  },
  primaryBtn: { backgroundColor: COLORS.white, borderRadius: RADII.full, paddingVertical: SPACING.md, alignItems: 'center' },
  primaryBtnText: { fontSize: FONT_SIZE.base, color: COLORS.textInverse, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  decideLaterText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, textAlign: 'center' },

  // Welcome step
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.sm,
  },
  logoBox: {
    width: 36, height: 36, borderRadius: RADII.sm,
    borderWidth: 1, borderColor: COLORS.borderBright, backgroundColor: COLORS.surfaceSolid,
    alignItems: 'center', justifyContent: 'center',
  },
  welcomeScroll: { paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.xl },
  versionLabel: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700', marginBottom: SPACING.sm },
  heroTitle: {
    fontSize: 34, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined,
    fontWeight: '700', letterSpacing: -0.5, lineHeight: 38,
  },
  heroSub: { fontSize: FONT_SIZE.base, color: COLORS.textSecondary, lineHeight: 22, marginTop: SPACING.md },
  featureList: { marginTop: SPACING.xl },
  featureRow: { flexDirection: 'row', gap: SPACING.md, alignItems: 'center', paddingVertical: SPACING.md },
  featureRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.borderDim },
  featureIconWrap: {
    width: 40, height: 40, borderRadius: RADII.md,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderNeon,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  featureTitle: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700', marginBottom: 2 },
  featureBody: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.bodyMedium ?? undefined, lineHeight: 19 },
  welcomeFooter: { paddingHorizontal: SPACING.screenPad, paddingBottom: SPACING.md, gap: SPACING.md },
  dotsRow: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.borderNeon },
  dotActive: { width: 20, backgroundColor: COLORS.textPrimary },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    borderRadius: RADII.full, paddingVertical: SPACING.md, backgroundColor: COLORS.white,
  },
  ctaBtnText: { fontSize: FONT_SIZE.base, color: COLORS.textInverse, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  ctaBtnArrow: { fontSize: FONT_SIZE.base, color: COLORS.textInverse, fontWeight: '700' },
  ctaCaption: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, textAlign: 'center' },
});
