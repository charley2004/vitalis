import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { COLORS, FONTS } from '../../theme';

interface TrendLineChartProps {
  points: number[];
  labels: string[];
  height?: number;
  /** true = smooth bezier for a continuous trend (e.g. balance over time);
   *  false = step-after line for discrete period totals (e.g. weekly spend) */
  smooth?: boolean;
  color?: string;
}

/** Smooth curve through points via quadratic beziers anchored at midpoints —
 *  same technique as GrowthScreen's buildSmoothPath, duplicated locally per
 *  the app's existing per-chart-component convention. */
function buildSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y} `;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    d += `Q ${p0.x} ${p0.y} ${midX} ${midY} `;
  }
  const last = pts[pts.length - 1];
  d += `T ${last.x} ${last.y}`;
  return d;
}

function buildStepPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y} `;
  for (let i = 1; i < pts.length; i++) {
    d += `L ${pts[i].x} ${pts[i - 1].y} L ${pts[i].x} ${pts[i].y} `;
  }
  return d.trim();
}

export function TrendLineChart({ points, labels, height = 130, smooth = true, color = COLORS.textPrimary }: TrendLineChartProps) {
  const [containerW, setContainerW] = useState(0);
  const W = containerW > 0 ? containerW : 300;
  const padL = 8, padB = labels.length > 0 ? 18 : 0, padT = 8;
  const plotW = W - padL - 8;
  const plotH = height - padB - padT;
  const max = Math.max(...points, 0);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;

  const pts = points.map((v, i) => ({
    x: padL + i * stepX,
    y: padT + plotH * (1 - (v - min) / range),
  }));
  const hasData = points.length > 1 && points.some((v) => v !== 0);
  const pathD = smooth ? buildSmoothPath(pts) : buildStepPath(pts);

  return (
    <View style={styles.wrap} onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
      <Svg width={W} height={height}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = padT + plotH * (1 - f);
          return <Line key={f} x1={padL} y1={y} x2={W - 8} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />;
        })}
        {hasData && <Path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
        {hasData && pts.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />)}
      </Svg>
      {labels.length > 0 && (
        <View style={styles.xLabels}>
          {labels.map((l, i) => <Text key={`${l}-${i}`} style={styles.xLabel}>{l}</Text>)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', width: '100%' },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  xLabel: { fontSize: 8, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined },
});
