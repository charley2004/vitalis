import React from 'react';
import Svg, { Circle } from 'react-native-svg';
import { COLORS } from '../../theme';

interface ProgressRingProps {
  /** 0-100+; values above 100 render as a full ring (e.g. over-budget) */
  pct: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
}

/** Static (non-animated) circular progress ring — for the many small inline
 *  indicators Finance needs (budget-used %, per-goal progress). The one
 *  animated hero ring (Dashboard's savings progress) uses ScoreRing's
 *  listener/setState technique directly instead of this. */
export function ProgressRing({
  pct, size = 40, strokeWidth = 4, color = COLORS.textPrimary, trackColor = 'rgba(255,255,255,0.08)',
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      <Circle
        cx={cx} cy={cy} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - clamped / 100)}
        strokeLinecap="round" transform={`rotate(-90, ${cx}, ${cy})`}
      />
    </Svg>
  );
}
