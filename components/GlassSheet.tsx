import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, RADII } from '../theme';

interface GlassSheetProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Bottom-sheet backdrop — real blur (iOS renders it natively; Android uses
 *  expo-blur's experimental BlurView, since the default there is a flat
 *  fallback tint with no blur at all). A bright hairline edge on top keeps it
 *  reading as a distinct pane rather than smudged background. */
export function GlassSheet({ children, style }: GlassSheetProps) {
  return (
    <View style={[glassStyles.container, style]}>
      <BlurView
        intensity={40}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View style={glassStyles.tint} pointerEvents="none" />
      {children}
    </View>
  );
}

const glassStyles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,20,20,0.45)',
  },
});
