import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { COLORS, RADII, SPACING } from '../theme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  accentColor?: string;
  padding?: number;
  noShadow?: boolean;
  topAccentBar?: boolean;
}

export function GlassCard({
  children,
  style,
  contentStyle,
  padding = SPACING.md,
  noShadow = false,
}: GlassCardProps) {
  return (
    <View style={[styles.card, !noShadow && styles.shadow, style]}>
      <View style={[{ padding }, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surfaceSolid,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderDim,
  },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
});
