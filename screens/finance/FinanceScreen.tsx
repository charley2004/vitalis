import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { COLORS, FONTS, FONT_SIZE, SPACING } from '../../theme';
import { AnimatedMark } from '../../components/AnimatedMark';
import { FinanceSectionTabs, type FinanceSection } from '../../components/finance/FinanceSectionTabs';
import { getFinanceSettings, type FinanceSettings } from '../../services/finance';
import { FinanceOnboarding } from './FinanceOnboarding';
import { FinanceLockGate } from './FinanceLockGate';
import { DashboardSection } from './sections/DashboardSection';
import { CalculatorSection } from './sections/CalculatorSection';
import { TransactionsSection } from './sections/TransactionsSection';
import { BudgetsSection } from './sections/BudgetsSection';
import { GoalsSection } from './sections/GoalsSection';
import { AnalyticsSection } from './sections/AnalyticsSection';
import { HistorySection } from './sections/HistorySection';
import { ReportsSection } from './sections/ReportsSection';
import { SettingsSection } from './sections/SettingsSection';
import { TransactionFormModal } from './modals/TransactionFormModal';
import type { AllocationCalculation } from '../../services/finance';

const SECTIONS: FinanceSection[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'calculator', label: 'Calculator' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'goals', label: 'Goals' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'history', label: 'History' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
];

export function FinanceScreen() {
  const route = useRoute<any>();
  const [section, setSection] = useState<string>(route.params?.initialSection ?? 'dashboard');
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingCalc, setPendingCalc] = useState<AllocationCalculation | null>(null);
  const [locked, setLocked] = useState(true);

  const handleReloadCalc = useCallback((calc: AllocationCalculation) => {
    setPendingCalc(calc);
    setSection('calculator');
  }, []);

  const refetchSettings = useCallback(() => {
    getFinanceSettings().then(setSettings);
  }, []);

  useFocusEffect(useCallback(() => { refetchSettings(); }, [refetchSettings]));

  // Re-lock every time Finance regains focus or the app comes back to the
  // foreground while this screen is mounted — a fresh `settings` reference
  // (from refetchSettings above) is what re-triggers this, not a poll.
  useEffect(() => {
    if (settings && settings.lockMode !== 'none') setLocked(true);
  }, [settings]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && settings && settings.lockMode !== 'none') setLocked(true);
    });
    return () => sub.remove();
  }, [settings]);

  const handleDataChanged = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Settings mutates `settings` itself (currency/lockMode/template/onboarded
  // via Reset) — sibling sections need both a fresh settings object and a
  // remount to pick up category/currency changes.
  const handleSettingsChanged = useCallback(() => {
    refetchSettings();
    setRefreshKey((k) => k + 1);
  }, [refetchSettings]);

  if (settings === null) {
    return (
      <SafeAreaView style={styles.loading} edges={['top', 'bottom']}>
        <AnimatedMark size={56} />
      </SafeAreaView>
    );
  }

  if (!settings.onboarded) {
    return <FinanceOnboarding onComplete={refetchSettings} />;
  }

  if (settings.lockMode !== 'none' && locked) {
    return <FinanceLockGate lockMode={settings.lockMode} onUnlock={() => setLocked(false)} />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>FINANCE</Text>
      </View>

      <View style={styles.tabsWrap}>
        <FinanceSectionTabs sections={SECTIONS} active={section} onChange={setSection} />
      </View>

      <View style={{ flex: 1 }}>
        {section === 'dashboard' && <DashboardSection key={refreshKey} settings={settings} onNavigate={setSection} />}
        {section === 'calculator' && <CalculatorSection key={refreshKey} settings={settings} onChanged={handleDataChanged} preload={pendingCalc} />}
        {section === 'transactions' && <TransactionsSection key={refreshKey} settings={settings} onChanged={handleDataChanged} />}
        {section === 'budgets' && <BudgetsSection key={refreshKey} settings={settings} onChanged={handleDataChanged} />}
        {section === 'goals' && <GoalsSection key={refreshKey} settings={settings} onChanged={handleDataChanged} />}
        {section === 'analytics' && <AnalyticsSection key={refreshKey} settings={settings} />}
        {section === 'history' && <HistorySection key={refreshKey} settings={settings} onReload={handleReloadCalc} onChanged={handleDataChanged} />}
        {section === 'reports' && <ReportsSection key={refreshKey} settings={settings} />}
        {section === 'settings' && <SettingsSection key={refreshKey} settings={settings} onChanged={handleSettingsChanged} />}
      </View>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setAddModalVisible(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <TransactionFormModal
        visible={addModalVisible}
        initial={null}
        onClose={() => setAddModalVisible(false)}
        onSaved={handleDataChanged}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACING.screenPad, paddingTop: SPACING.sm, paddingBottom: SPACING.xs },
  headerTitle: { fontSize: FONT_SIZE.xl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: 1 },
  tabsWrap: { paddingLeft: SPACING.screenPad },
  fab: {
    position: 'absolute', bottom: 24, right: SPACING.screenPad,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: COLORS.textPrimary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 6,
  },
  fabText: { fontSize: 26, color: COLORS.textInverse, fontWeight: '400', lineHeight: 30 },
});
