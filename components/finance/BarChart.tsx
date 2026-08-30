import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { COLORS, FONTS } from '../../theme';

export interface BarDatum { label: string; value: number; color?: string; }

interface BarChartProps {
  data: BarDatum[];
  height?: number;
  showAverage?: boolean;
  valueFormatter?: (v: number) => string;
}

const BAR_GAP = 6;

/** Width-responsive <Rect> bar chart, cloned from Growth's CoachSection WeeklyChart
 *  technique — generalized to arbitrary values/colors instead of a fixed
 *  0-100 score scale. */
export function BarChart({ data, height = 100, showAverage = false, valueFormatter = (v) => String(Math.round(v)) }: BarChartProps) {
  const [containerW, setContainerW] = useState(0);
  const W = containerW > 0 ? containerW : 280;
  const n = Math.max(data.length, 1);
  const barW = (W - BAR_GAP * (n - 1)) / n;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const avg = data.length ? data.reduce((sum, d) => sum + d.value, 0) / data.length : 0;

  return (
    <View style={styles.wrap} onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
      <Svg width={W} height={height + 28} viewBox={`0 0 ${W} ${height + 28}`}>
        {data.map((d, i) => {
          const barH = max > 0 ? Math.round((Math.abs(d.value) / max) * height) : 0;
          const x = i * (barW + BAR_GAP);
          const y = height - barH;
          const color = d.color ?? COLORS.textPrimary;
          return (
            <React.Fragment key={`${d.label}-${i}`}>
              <Rect x={x} y={0} width={barW} height={height} rx={3} fill="rgba(255,255,255,0.03)" />
              <Rect x={x} y={y} width={barW} height={barH} rx={3} fill={color} />
              {d.value !== 0 && (
                <SvgText x={x + barW / 2} y={y - 4} textAnchor="middle" fill={COLORS.textMuted} fontSize={8} fontFamily={FONTS.mono ?? undefined}>
                  {valueFormatter(d.value)}
                </SvgText>
              )}
              <SvgText x={x + barW / 2} y={height + 16} textAnchor="middle" fill={COLORS.textMuted} fontSize={9} fontFamily={FONTS.mono ?? undefined}>
                {d.label}
              </SvgText>
            </React.Fragment>
          );
        })}
        {showAverage && avg > 0 && (() => {
          const avgY = height - (avg / max) * height;
          return (
            <>
              <Line x1={0} y1={avgY} x2={W} y2={avgY} stroke={`${COLORS.textMuted}50`} strokeWidth={1} strokeDasharray="4 4" />
              <SvgText x={W - 2} y={avgY - 4} textAnchor="end" fill={COLORS.textMuted} fontSize={8} fontFamily={FONTS.mono ?? undefined}>
                AVG {valueFormatter(avg)}
              </SvgText>
            </>
          );
        })()}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', width: '100%' },
});
