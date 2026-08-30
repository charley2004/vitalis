import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { AnimatedMark } from '../components/AnimatedMark';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../theme';
import { setRoutineHit, getTodayKey } from '../services/storage';

const alarmSource = require('../assets/alarm.wav');

interface Props {
  routineId: string;
  routineLabel: string;
  onDismiss: () => void;
}

/**
 * Full-screen, impossible-to-miss alarm view. Opened from App.tsx when a
 * routine-alarm notification fires or gets tapped — see services/reminders.ts
 * for how that notification is scheduled. The looping sound plays on the
 * device's actual audio output (not the notification's own one-shot sound),
 * and dismissing is the only way to stop it — that action is also the
 * "when did you actually wake up" timestamp the rest of the app reasons about.
 */
export function AlarmRingScreen({ routineId, routineLabel, onDismiss }: Props) {
  const player = useAudioPlayer(alarmSource);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' }).catch(() => {});
    player.loop = true;
    player.volume = 1;
    player.play();
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(tick);
      player.pause();
      player.remove();
    };
  }, [player]);

  const handleDismiss = useCallback(() => {
    player.pause();
    setRoutineHit(getTodayKey(), routineId, true).catch(() => {});
    onDismiss();
  }, [player, routineId, onDismiss]);

  const timeLabel = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <View style={styles.overlay}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <AnimatedMark size={120} loop duration={900} />
          <Text style={styles.time}>{timeLabel}</Text>
          <Text style={styles.label}>{routineLabel.toUpperCase()}</Text>
          <Text style={styles.hint}>Dismissing marks this done, right now</Text>
        </View>
        <TouchableOpacity
          onPress={handleDismiss}
          style={styles.dismissBtn}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Dismiss alarm and mark done"
        >
          <Text style={styles.dismissText}>I'M UP</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.background, zIndex: 999, elevation: 999,
  },
  safe: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  time: { fontSize: FONT_SIZE.hero, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', marginTop: SPACING.lg },
  label: { fontSize: FONT_SIZE.lg, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 3, textAlign: 'center', paddingHorizontal: SPACING.xl },
  hint: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.body ?? undefined },
  dismissBtn: {
    backgroundColor: COLORS.textPrimary, borderRadius: RADII.full,
    paddingVertical: SPACING.lg, paddingHorizontal: SPACING.xxl * 1.5,
  },
  dismissText: { fontSize: FONT_SIZE.xl, color: COLORS.textInverse, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 2 },
});
