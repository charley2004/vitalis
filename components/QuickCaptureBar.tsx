import React, { useRef, useCallback } from 'react';
import {
  ScrollView,
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  Animated,
  ViewStyle,
} from 'react-native';
import { COLORS, FONTS, FONT_SIZE, RADII, SPACING } from '../theme';
import { AppIcon } from './icons';

export interface QuickAction {
  id: string;
  emoji: string;
  label: string;
  accentColor?: string;
}

interface QuickCaptureBarProps {
  actions: QuickAction[];
  onAction: (action: QuickAction) => void;
  style?: ViewStyle;
}

export const DEFAULT_ACTIONS: QuickAction[] = [
  { id: 'hydrate',  emoji: 'droplet',  label: 'Hydrate'  },
  { id: 'train',    emoji: 'dumbbell', label: 'Train'    },
  { id: 'sleep',    emoji: 'moon',     label: 'Sleep'    },
  { id: 'meal',     emoji: 'bowl',     label: 'Meal'     },
  { id: 'meditate', emoji: 'lotus',    label: 'Meditate' },
  { id: 'steps',    emoji: 'runner',   label: 'Steps'    },
  { id: 'journal',  emoji: 'pen',      label: 'Journal'  },
  { id: 'caffeine', emoji: 'coffee',   label: 'Coffee'   },
];

function ActionButton({
  action,
  onPress,
}: {
  action: QuickAction;
  onPress: (a: QuickAction) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: 0.94,
      useNativeDriver: true,
      tension: 300,
      friction: 15,
    }).start();
  }, []);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 200,
      friction: 12,
    }).start();
    onPress(action);
  }, [action, onPress]);

  return (
    <Animated.View style={[styles.buttonOuter, { transform: [{ scale }] }]}>
      <TouchableOpacity
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={styles.buttonInner}
      >
        <AppIcon id={action.emoji} size={16} color={COLORS.textSecondary} />
        <Text style={styles.label}>+{action.label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function QuickCaptureBar({
  actions = DEFAULT_ACTIONS,
  onAction,
  style,
}: QuickCaptureBarProps) {
  return (
    <View style={[styles.wrapper, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
      >
        {actions.map((action) => (
          <ActionButton key={action.id} action={action} onPress={onAction} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonOuter: {
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: COLORS.borderNeon,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    gap: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontFamily: FONTS.headingMedium ?? undefined,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
