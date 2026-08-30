import { Platform } from 'react-native';

// ─── Color Palette ───────────────────────────────────────────────────────────

export const COLORS = {
  // Backgrounds
  background: '#0A0A0A',
  backgroundAlt: '#111111',
  backgroundDeep: '#000000',

  // Surfaces
  surface: 'rgba(255,255,255,0.04)',
  surfaceElevated: 'rgba(255,255,255,0.06)',
  surfaceSolid: '#141414',
  surfaceHover: 'rgba(255,255,255,0.07)',

  // Borders — single neutral system
  borderDim: 'rgba(255,255,255,0.06)',
  borderNeon: 'rgba(255,255,255,0.08)',
  borderBright: 'rgba(255,255,255,0.14)',
  borderSubtle: 'rgba(255,255,255,0.05)',

  // Primary accent — white (mapped from cyan for compatibility)
  cyan: '#FFFFFF',
  violet: '#CCCCCC',
  cyanDim: 'rgba(255,255,255,0.10)',
  cyanGlow: 'rgba(255,255,255,0.04)',
  cyanGlowStrong: 'rgba(255,255,255,0.07)',

  // Warning state
  amber: '#D97706',
  amberDim: 'rgba(217,119,6,0.12)',
  amberGlow: 'rgba(217,119,6,0.06)',

  // Danger state
  red: '#DC2626',
  redDim: 'rgba(220,38,38,0.12)',
  redGlow: 'rgba(220,38,38,0.06)',

  // Typography
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.50)',
  textMuted: 'rgba(255,255,255,0.28)',
  textAccent: '#FFFFFF',
  textInverse: '#0A0A0A',

  // Neutral (mapped from purple for compatibility)
  purple: '#666666',
  purpleLight: 'rgba(255,255,255,0.45)',
  purpleGlow: 'rgba(255,255,255,0.02)',
  purpleGlowStrong: 'rgba(255,255,255,0.04)',
  purpleDim: 'rgba(255,255,255,0.06)',

  // Utility
  white: '#FFFFFF',
  transparent: 'transparent',
  divider: 'rgba(255,255,255,0.06)',
  overlay: 'rgba(0,0,0,0.85)',
} as const;

// ─── Score / State Thresholds ────────────────────────────────────────────────

export const SCORE_THRESHOLDS = {
  optimal: 75,
  warning: 45,
} as const;

export type ScoreState = 'optimal' | 'warning' | 'danger';

export function getScoreState(score: number): ScoreState {
  if (score >= SCORE_THRESHOLDS.optimal) return 'optimal';
  if (score >= SCORE_THRESHOLDS.warning) return 'warning';
  return 'danger';
}

export function getScoreColor(score: number): string {
  const state = getScoreState(score);
  return {
    optimal: COLORS.white,
    warning: COLORS.amber,
    danger: COLORS.red,
  }[state];
}

export function getScoreGlow(score: number): string {
  const state = getScoreState(score);
  return {
    optimal: COLORS.cyanGlow,
    warning: COLORS.amberGlow,
    danger: COLORS.redGlow,
  }[state];
}

// ─── Typography ──────────────────────────────────────────────────────────────

export const FONTS = {
  heading: Platform.select({
    web: '"Space Grotesk", "Courier New", monospace',
    default: 'SpaceGrotesk-Bold',
  }),
  headingSemi: Platform.select({
    web: '"Space Grotesk", "Courier New", monospace',
    default: 'SpaceGrotesk-SemiBold',
  }),
  headingMedium: Platform.select({
    web: '"Space Grotesk", "Courier New", monospace',
    default: 'SpaceGrotesk-Medium',
  }),
  headingRegular: Platform.select({
    web: '"Space Grotesk", "Courier New", monospace',
    default: 'SpaceGrotesk-Regular',
  }),
  body: Platform.select({
    web: '"Inter", system-ui, sans-serif',
    default: 'Inter-Regular',
  }),
  bodyMedium: Platform.select({
    web: '"Inter", system-ui, sans-serif',
    default: 'Inter-Medium',
  }),
  bodySemi: Platform.select({
    web: '"Inter", system-ui, sans-serif',
    default: 'Inter-SemiBold',
  }),
  mono: Platform.select({
    web: '"Space Mono", "Courier New", monospace',
    default: 'SpaceMono-Regular',
  }),
} as const;

// ─── Spacing Scale ───────────────────────────────────────────────────────────

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  screenPad: 20,
} as const;

// ─── Border Radii ────────────────────────────────────────────────────────────

export const RADII = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  full: 9999,
} as const;

// ─── Typography Scale ────────────────────────────────────────────────────────

export const FONT_SIZE = {
  xxs: 9,
  xs: 10,
  sm: 12,
  base: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 36,
  display: 48,
  hero: 64,
} as const;

export const LINE_HEIGHT = {
  tight: 1.1,
  snug: 1.25,
  normal: 1.4,
  relaxed: 1.6,
} as const;

// ─── Responsive Breakpoints ──────────────────────────────────────────────────

export const BREAKPOINTS = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
} as const;

// ─── Shadow / Glow Presets ───────────────────────────────────────────────────

export const SHADOWS = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  glowCyan: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  glowAmber: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  glowRed: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  glowPurple: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  subtle: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.20,
    shadowRadius: 4,
    elevation: 2,
  },
} as const;

// ─── Gradient Definitions ────────────────────────────────────────────────────

export const GRADIENTS = {
  cyanViolet: ['#FFFFFF', '#AAAAAA'] as [string, string],
  cyanVioletFade: ['rgba(255,255,255,0.8)', 'rgba(200,200,200,0.3)'] as [string, string],
  amberFade: ['rgba(217,119,6,0.8)', 'rgba(217,119,6,0.1)'] as [string, string],
  redFade: ['rgba(220,38,38,0.8)', 'rgba(220,38,38,0.1)'] as [string, string],
  surfaceTop: ['rgba(22,22,22,0.98)', 'rgba(10,10,10,0.98)'] as [string, string],
  backgroundFade: [COLORS.background, COLORS.backgroundAlt] as [string, string],
  purpleFade: ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0)'] as [string, string],
  cyanPurple: ['#FFFFFF', '#888888'] as [string, string],
  headerGlow: ['rgba(255,255,255,0.03)', 'rgba(10,10,10,0)'] as [string, string],
} as const;

// ─── Animation Timing ────────────────────────────────────────────────────────

export const TIMING = {
  instant: 80,
  fast: 150,
  normal: 250,
  slow: 400,
  verySlow: 600,
} as const;
