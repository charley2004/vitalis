import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../theme';
import { BoltIcon } from '../components/icons';
import { GoalsSection } from './growth/GoalsSection';
import { CoachSection } from './growth/CoachSection';

type GrowthTab = 'goals' | 'coach';

const TABS: { id: GrowthTab; label: string }[] = [
  { id: 'goals', label: 'GOALS' },
  { id: 'coach', label: 'COACH' },
];

// Coach used to be its own bottom tab — merged in here since both screens
// exist to answer "how am I actually doing," just at different time
// horizons (quarter-long targets vs. day-to-day verdict/chat). Splitting
// them across tabs meant comparing them manually; a pill switcher keeps
// them adjacent instead.
export function GrowthScreen() {
  const navigation = useNavigation();
  const [tab, setTab] = useState<GrowthTab>('goals');

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <Text style={s.screenTitle}>GROWTH</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings' as never)} activeOpacity={0.7}>
          <View style={s.avatar}><BoltIcon size={16} color={COLORS.textPrimary} /></View>
        </TouchableOpacity>
      </View>

      <View style={s.tabsRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[s.tab, tab === t.id && s.tabActive]}
            onPress={() => setTab(t.id)}
            activeOpacity={0.8}
          >
            <Text style={[s.tabText, tab === t.id && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'goals' ? <GoalsSection /> : <CoachSection />}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.sm, paddingBottom: SPACING.xs,
  },
  screenTitle: { fontSize: FONT_SIZE.xl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 3 },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1, borderColor: COLORS.borderBright, backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },

  tabsRow: {
    flexDirection: 'row', gap: SPACING.xs,
    paddingHorizontal: SPACING.screenPad, paddingBottom: SPACING.sm,
  },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: SPACING.sm,
    borderRadius: RADII.full, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.borderDim,
  },
  tabActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  tabText: { fontSize: 10, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700' },
  tabTextActive: { color: COLORS.textInverse },
});
