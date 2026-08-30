import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { COLORS, FONTS, FONT_SIZE, getScoreColor, getScoreState } from '../theme';

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  showGlow?: boolean;
}

export function ScoreRing({
  score,
  size = 180,
  strokeWidth = 10,
  label = 'VITALIS INDEX',
}: ScoreRingProps) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const color = getScoreColor(clampedScore);
  const state = getScoreState(clampedScore);
  const isCompact = size < 80;

  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  const scoreFontSize = Math.max(Math.round(size * 0.28), 18);

  const animatedScore = useRef(new Animated.Value(0)).current;
  const [dashOffset, setDashOffset] = useState(circumference);

  useEffect(() => {
    // Drive dashOffset via listener so we never pass an Animated.Value
    // directly to a Fabric SVG prop (avoids useNativeDriver conflict).
    const id = animatedScore.addListener(({ value }) => {
      setDashOffset(circumference * (1 - value / 100));
    });

    const anim = Animated.timing(animatedScore, {
      toValue: clampedScore,
      duration: 800,
      useNativeDriver: false,
    });
    anim.start();

    return () => {
      anim.stop();
      animatedScore.removeListener(id);
    };
  }, [clampedScore]);

  const scoreY = cy + scoreFontSize * 0.36;
  const labelY = scoreY + scoreFontSize * 0.40;
  const stateY = labelY + 14;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Track ring */}
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={strokeWidth}
        />

        {/* Progress arc */}
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90, ${cx}, ${cy})`}
        />

        {/* Score number */}
        <SvgText
          x={cx}
          y={scoreY}
          textAnchor="middle"
          fill={COLORS.textPrimary}
          fontSize={scoreFontSize}
          fontFamily={FONTS.heading ?? undefined}
          fontWeight="700"
        >
          {clampedScore}
        </SvgText>

        {/* Label */}
        {!isCompact && label.length > 0 && (
          <SvgText
            x={cx}
            y={labelY}
            textAnchor="middle"
            fill={COLORS.textMuted}
            fontSize={FONT_SIZE.xxs}
            fontFamily={FONTS.mono ?? undefined}
            letterSpacing={1.5}
          >
            {label}
          </SvgText>
        )}

        {/* State */}
        {!isCompact && (
          <SvgText
            x={cx}
            y={stateY}
            textAnchor="middle"
            fill={color}
            fontSize={FONT_SIZE.xs}
            fontFamily={FONTS.headingMedium ?? undefined}
            letterSpacing={1}
          >
            {state === 'optimal' ? 'OPTIMAL' : state === 'warning' ? 'WARNING' : 'CRITICAL'}
          </SvgText>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
