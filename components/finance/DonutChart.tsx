import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../theme';

export interface DonutDatum { label: string; value: number; color: string; }

interface DonutChartProps {
  data: DonutDatum[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
  showLegend?: boolean;
}

/** 1.5deg angular gap between segments — the dataviz skill's "surface gap
 *  between fills" spacer rule, applied to a donut instead of stacked bars. */
const GAP_DEG = 1.5;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

/** Built from SVG arc (A) path commands per segment rather than stacked
 *  <Circle> + strokeDasharray — avoids anti-aliasing seams between segments. */
export function DonutChart({ data, size = 160, strokeWidth = 18, centerLabel, centerValue, showLegend = true }: DonutChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - strokeWidth) / 2;
  const total = data.reduce((sum, d) => sum + Math.max(d.value, 0), 0);

  let cursor = 0;
  const segments = total > 0 ? data
    .filter((d) => d.value > 0)
    .map((d) => {
      const span = (d.value / total) * 360;
      const gap = data.filter((x) => x.value > 0).length > 1 ? GAP_DEG : 0;
      const start = cursor + gap / 2;
      const end = cursor + Math.max(span - gap, 0);
      cursor += span;
      return { ...d, start, end: Math.max(end, start) };
    }) : [];

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
          {segments.map((s) => (
            <Path
              key={s.label}
              d={describeArc(cx, cy, radius, s.start, s.end)}
              fill="none"
              stroke={s.color}
              strokeWidth={strokeWidth}
              strokeLinecap={s.end - s.start > 3 ? 'round' : 'butt'}
            />
          ))}
        </Svg>
        {(centerLabel || centerValue) && (
          <View style={styles.centerOverlay} pointerEvents="none">
            {centerValue ? <Text style={styles.centerValue}>{centerValue}</Text> : null}
            {centerLabel ? <Text style={styles.centerLabel}>{centerLabel}</Text> : null}
          </View>
        )}
      </View>
      {showLegend && data.length > 0 && (
        <View style={styles.legend}>
          {data.map((d) => (
            <View key={d.label} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: d.color }]} />
              <Text style={styles.legendLabel} numberOfLines={1}>{d.label}</Text>
              <Text style={styles.legendPct}>{total > 0 ? Math.round((d.value / total) * 100) : 0}%</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: SPACING.md },
  centerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  centerValue: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  centerLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginTop: 2 },
  legend: { width: '100%', gap: SPACING.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  legendDot: { width: 8, height: 8, borderRadius: RADII.full },
  legendLabel: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.body ?? undefined },
  legendPct: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined, fontWeight: '600' },
});
