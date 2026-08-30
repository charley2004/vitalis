import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../theme';

interface BalanceHeroCardProps {
  label: string;
  value: string;
  style?: StyleProp<ViewStyle>;
}

/** Dashboard's one glass treatment, trialled alongside the bottom-sheet
 *  modals — everything else on Dashboard stays the flat GlassCard look.
 *  A diagonal highlight (LinearGradient) does the "glass catching light"
 *  work here, since the blur itself has nothing behind this card to
 *  actually blur — it's the first thing in the scroll, not a floating
 *  overlay like the modals are. */
export function BalanceHeroCard({ label, value, style }: BalanceHeroCardProps) {
  return (
    <View style={[styles.card, style]}>
      <BlurView intensity={35} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <View style={styles.tint} pointerEvents="none" />
      <LinearGradient
        colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']}
        locations={[0, 0.4, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.content}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    alignItems: 'flex-start',
  },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,20,20,0.35)' },
  content: { padding: SPACING.md },
  label: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginBottom: SPACING.xs },
  value: { fontSize: FONT_SIZE.xxxl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: -0.5 },
});
