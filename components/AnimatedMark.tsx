import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { COLORS } from '../theme';

interface AnimatedMarkProps {
  size?: number;
  strokeWidth?: number;
  color?: string;
  /** true = sweeps in, erases, repeats (a loading state of unknown length).
   * false = sweeps in once and holds (a brief, known-length wait, e.g. app boot). */
  loop?: boolean;
  duration?: number;
}

/**
 * The Arc mark, animated like a speedometer needle sweeping from empty to
 * full — the same 300°-arc-plus-reading-dot geometry as the static mark and
 * ScoreRing, just drawn progressively instead of to a fixed score.
 */
export function AnimatedMark({
  size = 64,
  strokeWidth,
  color = COLORS.textPrimary,
  loop = true,
  duration = 1100,
}: AnimatedMarkProps) {
  const sw = strokeWidth ?? size * 0.07;
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - sw * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (300 / 360) * circumference;
  const dotR = sw * (11 / 14);
  // The dot sits at the sweep's leading edge — 60° past the gap in the same
  // rotate(120)-from-3-o'clock convention as the static mark (see
  // vitalis-brand-identity specimen for the full derivation).
  const dotAngle = (60 * Math.PI) / 180;
  const dotX = cx + radius * Math.cos(dotAngle);
  const dotY = cy + radius * Math.sin(dotAngle);

  const progress = useRef(new Animated.Value(0)).current;
  const [dashOffset, setDashOffset] = useState(arcLength);
  const [dotOpacity, setDotOpacity] = useState(0);

  useEffect(() => {
    // Drive SVG props via listener + setState rather than an
    // Animated.createAnimatedComponent(Circle) — matches ScoreRing's
    // pattern, which avoids a useNativeDriver conflict under Fabric.
    const id = progress.addListener(({ value }) => {
      setDashOffset(arcLength * (1 - value));
      setDotOpacity(value > 0.82 ? Math.min(1, (value - 0.82) / 0.18) : 0);
    });

    const sweepIn = Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    });

    const anim = loop
      ? Animated.loop(
          Animated.sequence([
            sweepIn,
            Animated.timing(progress, {
              toValue: 0,
              duration,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: false,
            }),
          ])
        )
      : sweepIn;
    anim.start();

    return () => {
      anim.stop();
      progress.removeListener(id);
    };
  }, [progress, loop, duration, arcLength]);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(120, ${cx}, ${cy})`}
        />
        <Circle cx={dotX} cy={dotY} r={dotR} fill={color} opacity={dotOpacity} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
});
