import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { GlassCard } from './GlassCard';
import { COLORS, FONTS, FONT_SIZE, SPACING, getScoreColor } from '../theme';

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  target?: string | number;
  targetLabel?: string;
  sparkData?: number[];
  accentColor?: string;
  score?: number;
  delta?: string;
  deltaPositive?: boolean;
  compact?: boolean;
}

const SPARK_W = 120;
const SPARK_H = 32;
const SPARK_PAD = 2;

function buildPath(data: number[]): { line: string; area: string } {
  if (data.length < 2) return { line: '', area: '' };
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max === min ? 1 : max - min;
  const pts = data.map((v, i) => {
    const x = SPARK_PAD + (i / (data.length - 1)) * (SPARK_W - SPARK_PAD * 2);
    const y = SPARK_H - SPARK_PAD - ((v - min) / range) * (SPARK_H - SPARK_PAD * 2);
    return { x: parseFloat(x.toFixed(2)), y: parseFloat(y.toFixed(2)) };
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].x},${SPARK_H} L${pts[0].x},${SPARK_H} Z`;
  return { line, area };
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const { line, area } = useMemo(() => buildPath(data), [data]);
  if (!line) return null;
  return (
    <Svg width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}>
      <Path d={area} fill={`${color}18`} />
      <Path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function MetricCard({
  label,
  value,
  unit = '',
  target,
  targetLabel = 'TARGET',
  sparkData = [],
  accentColor,
  score,
  delta,
  deltaPositive,
  compact = false,
}: MetricCardProps) {
  const color = accentColor ?? (score !== undefined ? getScoreColor(score) : COLORS.textPrimary);

  return (
    <GlassCard padding={compact ? SPACING.sm : SPACING.md} style={styles.card}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label.toUpperCase()}</Text>
        {delta !== undefined && (
          <Text style={[styles.delta, { color: deltaPositive ? COLORS.textSecondary : COLORS.red }]}>
            {delta}
          </Text>
        )}
      </View>

      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: COLORS.textPrimary }]}>{value}</Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>

      {target !== undefined && (
        <Text style={styles.target}>
          <Text style={styles.targetSlash}>/ </Text>
          <Text style={styles.targetVal}>{target}</Text>
          <Text style={styles.targetLabel}> {targetLabel}</Text>
        </Text>
      )}

      {sparkData.length >= 2 && (
        <View style={styles.sparkRow}>
          <Sparkline data={sparkData} color={color} />
        </View>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZE.xxs,
    color: COLORS.textMuted,
    fontFamily: FONTS.mono ?? undefined,
    letterSpacing: 1.5,
  },
  delta: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONTS.headingMedium ?? undefined,
    fontWeight: '600',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.xs,
    marginBottom: SPACING.xxs,
  },
  value: {
    fontSize: FONT_SIZE.xxl,
    fontFamily: FONTS.heading ?? undefined,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: FONT_SIZE.xxl * 1.1,
  },
  unit: {
    fontSize: FONT_SIZE.base,
    color: COLORS.textMuted,
    fontFamily: FONTS.headingMedium ?? undefined,
    marginBottom: 2,
  },
  target: {
    marginBottom: SPACING.xs,
  },
  targetSlash: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.mono ?? undefined,
  },
  targetVal: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONTS.bodyMedium ?? undefined,
    fontWeight: '500',
  },
  targetLabel: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.xxs,
    fontFamily: FONTS.mono ?? undefined,
    letterSpacing: 1,
  },
  sparkRow: {
    marginTop: SPACING.xs,
    overflow: 'hidden',
  },
});
