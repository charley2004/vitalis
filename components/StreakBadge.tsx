import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS, FONT_SIZE, RADII, SPACING } from '../theme';
import { FlameIcon, SnowflakeIcon } from './icons';

type BadgeSize = 'sm' | 'md' | 'lg';

interface StreakBadgeProps {
  count: number;
  size?: BadgeSize;
  active?: boolean;
}

const SIZE_MAP = {
  sm: { container: 48, font: FONT_SIZE.sm,  subFont: FONT_SIZE.xxs, padding: SPACING.xs, iconSize: 18 },
  md: { container: 60, font: FONT_SIZE.md,  subFont: FONT_SIZE.xs,  padding: SPACING.sm, iconSize: 22 },
  lg: { container: 76, font: FONT_SIZE.xl,  subFont: FONT_SIZE.sm,  padding: SPACING.md, iconSize: 28 },
};

export function StreakBadge({ count, size = 'md', active = true }: StreakBadgeProps) {
  const dims = SIZE_MAP[size];

  return (
    <View
      style={[
        styles.container,
        {
          width: dims.container,
          height: dims.container,
          borderRadius: dims.container / 2,
          borderColor: active ? COLORS.borderBright : COLORS.borderDim,
        },
      ]}
    >
      {active
        ? <FlameIcon size={dims.iconSize} color={COLORS.amber} />
        : <SnowflakeIcon size={dims.iconSize} color={COLORS.textMuted} />
      }
      <Text
        style={[
          styles.count,
          {
            fontSize: dims.subFont,
            color: active ? COLORS.textPrimary : COLORS.textMuted,
            fontFamily: FONTS.heading ?? undefined,
          },
        ]}
      >
        {count}d
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  count: {
    marginTop: -2,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
});
