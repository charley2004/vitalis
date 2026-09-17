import React from 'react';
import Svg, { Path, Circle, Line } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

export function BoltIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M13 2L7 13h5l-2 9 8-12h-6L13 2z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function FlameIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2c0 5-6 7-6 12a6 6 0 0012 0c0-4-3-6-3-10-1 3-3 4.5-3 7a3 3 0 006 0c0-2.5-2-3.5-2-6"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SnowflakeIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="12" y1="2" x2="12" y2="22" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="2" y1="12" x2="22" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="5.64" y1="5.64" x2="18.36" y2="18.36" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="18.36" y1="5.64" x2="5.64" y2="18.36" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M9 3l3 3 3-3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M9 21l3-3 3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 9l3 3-3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 9l-3 3 3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function MoonIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SunriseIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M17 19a5 5 0 00-10 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="12" y1="7" x2="12" y2="4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="6.34" y1="9.34" x2="4.22" y2="7.22" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="17.66" y1="9.34" x2="19.78" y2="7.22" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="3" y1="14" x2="5.5" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="21" y1="14" x2="18.5" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="2" y1="19" x2="22" y2="19" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function DropletIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2L5.5 12.5A6.5 6.5 0 0012 21a6.5 6.5 0 006.5-8.5L12 2z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function DumbbellIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="8" y1="12" x2="16" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="5" y1="8" x2="5" y2="16" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="3" y1="9.5" x2="3" y2="14.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="19" y1="8" x2="19" y2="16" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="21" y1="9.5" x2="21" y2="14.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function ScaleIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="12" y1="3" x2="12" y2="21" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="3" y1="9" x2="21" y2="9" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M7 9L4.5 17h5L7 9z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <Path d="M17 9l-2.5 8h5L17 9z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </Svg>
  );
}

export function RunnerIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="14" cy="4" r="1.5" stroke={color} strokeWidth="1.5" />
      <Path
        d="M14 6l-2.5 4 3 2-3.5 6"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14 9.5l3.5 2.5M11.5 10L8 12"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function LotusIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="6" r="2" stroke={color} strokeWidth="1.5" />
      <Path
        d="M7 20c0-3.5 2.2-6 5-6s5 2.5 5 6"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <Line x1="4" y1="20" x2="20" y2="20" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M7 14L4 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M17 14l3-1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function PenIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CoffeeIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17 8h1a4 4 0 010 8h-1"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="6" y1="2" x2="6" y2="4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="10" y1="1" x2="10" y2="4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="14" y1="2" x2="14" y2="4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function BowlIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="2" y1="11" x2="22" y2="11" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Path
        d="M5 11a7 7 0 0014 0"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <Line x1="12" y1="18" x2="12" y2="21" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="9" y1="21" x2="15" y2="21" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M9 5l1 4M12 4v4M15 5l-1 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function SignalIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="2" fill={color} opacity="0.5" />
      <Path
        d="M16.24 7.76a6 6 0 010 8.49M7.76 7.76a6 6 0 000 8.49"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <Path
        d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function BrainIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2L4.5 7v10L12 22l7.5-5V7L12 2z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="12" r="2" fill={color} opacity="0.6" />
      <Line x1="12" y1="8" x2="12" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="15.46" y1="9.77" x2="13.73" y2="11" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="15.46" y1="14.23" x2="13.73" y2="13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="12" y1="16" x2="12" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="8.54" y1="14.23" x2="10.27" y2="13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="8.54" y1="9.77" x2="10.27" y2="11" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function CheckCircleIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" />
      <Path
        d="M8 12l3 3 5-6"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function WarningIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="12" y1="9" x2="12" y2="13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="12" y1="17" x2="12.01" y2="17" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function AlertCircleIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" />
      <Line x1="12" y1="8" x2="12" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="12" y1="16" x2="12.01" y2="16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function CalendarIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2H5z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="3" y1="10" x2="21" y2="10" stroke={color} strokeWidth="1.5" />
      <Line x1="8" y1="3" x2="8" y2="7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="16" y1="3" x2="16" y2="7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function BellIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 10a6 6 0 1112 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M10 19a2 2 0 004 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function ShieldIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function LockIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 11V8a6 6 0 1112 0v3"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <Path
        d="M5 11h14v9a2 2 0 01-2 2H7a2 2 0 01-2-2v-9z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function WalletIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M16 12h3a1 1 0 011 1v2a1 1 0 01-1 1h-3a2 2 0 010-4z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <Line x1="3" y1="9" x2="14" y2="9" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function CashIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 6a2 2 0 002 2h14a2 2 0 002-2"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0"
      />
      <Path d="M2 6h20v12H2z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.5" />
      <Line x1="5" y1="9" x2="5" y2="9.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="19" y1="15" x2="19" y2="15.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function ReceiptIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 2v20l2.5-1.5L10 22l2-1.5 2 1.5 2.5-1.5L19 22V2l-2.5 1.5L14 2l-2 1.5L10 2 7.5 3.5 5 2z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="8" y1="8" x2="16" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="8" y1="12" x2="16" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="8" y1="16" x2="13" y2="16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function PieChartIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2a10 10 0 110 20 10 10 0 010-20z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <Path d="M12 2v10l7 7" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function TrendingUpIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 17l6-6 4 4 8-8" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M15 7h6v6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function TrendingDownIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 7l6 6 4-4 8 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M15 17h6v-6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function TransferIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 8h14M13 4l4 4-4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 16H7M11 12l-4 4 4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function TagIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20.59 13.41L11 3.83A2 2 0 009.59 3.24L3 3v6.59a2 2 0 00.59 1.41l9.59 9.59a2 2 0 002.82 0l4.59-4.59a2 2 0 000-2.59z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="8" cy="8" r="1.5" fill={color} />
    </Svg>
  );
}

export function TargetIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" />
      <Circle cx="12" cy="12" r="5" stroke={color} strokeWidth="1.5" />
      <Circle cx="12" cy="12" r="1.5" fill={color} />
    </Svg>
  );
}

export function CameraIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8a2 2 0 012-2h1.5l1-2h7l1 2H18a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="13" r="3.5" stroke={color} strokeWidth="1.5" />
    </Svg>
  );
}

export function MicIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M6 11v1a6 6 0 0012 0v-1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M12 18v3M9 21h6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function DownloadIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3v12M7 10l5 5 5-5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4 19h16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function PiggyBankIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12a6 6 0 016-6h4a5 5 0 015 5v1l2 1-2 1v1a2 2 0 01-2 2h-1v2h-3v-2H9a5 5 0 01-5-5v-0z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="16" cy="11" r="0.75" fill={color} />
      <Line x1="6" y1="17" x2="6" y2="19" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M8 6l-1-2M14 6l1-2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function FingerprintIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3a7 7 0 00-7 7v2c0 2.5.6 4.5 1.5 6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M12 3a7 7 0 017 7v2c0 1-.1 2-.3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M8 10a4 4 0 018 0v2c0 3.5-1 6-2.5 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M12 10v3c0 3-.7 5.3-2 7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M16 10v2c0 2-.3 3.7-1 5.2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function AppIcon({ id, size = 20, color = '#fff' }: { id: string; size?: number; color?: string }) {
  switch (id) {
    case 'bolt':         return <BoltIcon size={size} color={color} />;
    case 'flame':        return <FlameIcon size={size} color={color} />;
    case 'snowflake':    return <SnowflakeIcon size={size} color={color} />;
    case 'moon':         return <MoonIcon size={size} color={color} />;
    case 'sunrise':      return <SunriseIcon size={size} color={color} />;
    case 'droplet':      return <DropletIcon size={size} color={color} />;
    case 'dumbbell':     return <DumbbellIcon size={size} color={color} />;
    case 'scale':        return <ScaleIcon size={size} color={color} />;
    case 'runner':       return <RunnerIcon size={size} color={color} />;
    case 'lotus':        return <LotusIcon size={size} color={color} />;
    case 'pen':          return <PenIcon size={size} color={color} />;
    case 'coffee':       return <CoffeeIcon size={size} color={color} />;
    case 'bowl':         return <BowlIcon size={size} color={color} />;
    case 'signal':       return <SignalIcon size={size} color={color} />;
    case 'brain':        return <BrainIcon size={size} color={color} />;
    case 'check-circle': return <CheckCircleIcon size={size} color={color} />;
    case 'warning':      return <WarningIcon size={size} color={color} />;
    case 'alert-circle': return <AlertCircleIcon size={size} color={color} />;
    case 'calendar':     return <CalendarIcon size={size} color={color} />;
    case 'bell':         return <BellIcon size={size} color={color} />;
    case 'shield':       return <ShieldIcon size={size} color={color} />;
    case 'lock':         return <LockIcon size={size} color={color} />;
    case 'wallet':       return <WalletIcon size={size} color={color} />;
    case 'cash':         return <CashIcon size={size} color={color} />;
    case 'receipt':      return <ReceiptIcon size={size} color={color} />;
    case 'pie-chart':    return <PieChartIcon size={size} color={color} />;
    case 'trending-up':  return <TrendingUpIcon size={size} color={color} />;
    case 'trending-down':return <TrendingDownIcon size={size} color={color} />;
    case 'transfer':     return <TransferIcon size={size} color={color} />;
    case 'tag':          return <TagIcon size={size} color={color} />;
    case 'target':       return <TargetIcon size={size} color={color} />;
    case 'camera':       return <CameraIcon size={size} color={color} />;
    case 'mic':          return <MicIcon size={size} color={color} />;
    case 'download':     return <DownloadIcon size={size} color={color} />;
    case 'piggy-bank':   return <PiggyBankIcon size={size} color={color} />;
    case 'fingerprint':  return <FingerprintIcon size={size} color={color} />;
    default:             return <BoltIcon size={size} color={color} />;
  }
}
