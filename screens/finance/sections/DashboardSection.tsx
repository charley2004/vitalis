import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { GlassCard } from '../../../components/GlassCard';
import { AppIcon } from '../../../components/icons';
import { DonutChart } from '../../../components/finance/DonutChart';
import { BalanceHeroCard } from '../../../components/finance/BalanceHeroCard';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../../theme';
import {
  getTotalBalance, getMonthSummary, getSavingsProgressPct, getTransactions, getCategories,
  getUpcomingBills, currentMonthKey, fmtCurrency, fmtCompactCurrency,
  type FinanceSettings, type FinanceTransaction, type FinanceCategory, type UpcomingBill,
} from '../../../services/finance';
import { fmtDateHuman } from '../../../services/calendar';
import { getFinanceInsights } from '../../../services/financeInsights';

interface DashboardSectionProps {
  settings: FinanceSettings;
  onNavigate: (section: string) => void;
}

/** Same listener/setState technique as ScoreRing — generalized off the
 *  health-score color mapping since this ring shows a savings % instead. */
function AnimatedSavingsRing({ pct, size = 150 }: { pct: number; size?: number }) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2, cy = size / 2;
  const clamped = Math.max(0, Math.min(100, pct));
  const animated = useRef(new Animated.Value(0)).current;
  const [dashOffset, setDashOffset] = useState(circumference);

  useEffect(() => {
    const id = animated.addListener(({ value }) => setDashOffset(circumference * (1 - value / 100)));
    const anim = Animated.timing(animated, { toValue: clamped, duration: 800, useNativeDriver: false });
    anim.start();
    return () => { anim.stop(); animated.removeListener(id); };
  }, [clamped]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={strokeWidth} />
        <Circle
          cx={cx} cy={cy} r={radius} fill="none" stroke={COLORS.textPrimary} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round"
          transform={`rotate(-90, ${cx}, ${cy})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.ringOverlay]}>
        <Text style={styles.ringValue}>{Math.round(clamped)}%</Text>
        <Text style={styles.ringLabel}>SAVINGS PROGRESS</Text>
      </View>
    </View>
  );
}

export function DashboardSection({ settings, onNavigate }: DashboardSectionProps) {
  const [totalBalance, setTotalBalance] = useState(0);
  const [monthSummary, setMonthSummary] = useState({ income: 0, expense: 0, net: 0 });
  const [savingsPct, setSavingsPct] = useState(0);
  const [recent, setRecent] = useState<FinanceTransaction[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [bills, setBills] = useState<UpcomingBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<string[] | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const handleFetchInsights = async () => {
    setInsightsLoading(true);
    setInsightsError(null);
    const result = await getFinanceInsights();
    if ('error' in result) setInsightsError(result.error);
    else setInsights(result.insights);
    setInsightsLoading(false);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const monthKey = currentMonthKey();
      const [balance, summary, pct, transactions, cats, upcoming] = await Promise.all([
        getTotalBalance(), getMonthSummary(monthKey), getSavingsProgressPct(),
        getTransactions(), getCategories(), getUpcomingBills(7),
      ]);
      if (!active) return;
      setTotalBalance(balance);
      setMonthSummary(summary);
      setSavingsPct(pct);
      setRecent([...transactions].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5));
      setCategories(cats);
      setBills(upcoming);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>LOADING…</Text>
      </View>
    );
  }

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <BalanceHeroCard label="TOTAL AVAILABLE BALANCE" value={fmtCurrency(totalBalance, settings.currencyCode)} />

      <View style={styles.statRow}>
        <GlassCard style={styles.statCard}>
          <Text style={styles.statLabel}>INCOME THIS MONTH</Text>
          <Text style={[styles.statValue, { color: COLORS.textPrimary }]}>{fmtCompactCurrency(monthSummary.income, settings.currencyCode)}</Text>
        </GlassCard>
        <GlassCard style={styles.statCard}>
          <Text style={styles.statLabel}>EXPENSES THIS MONTH</Text>
          <Text style={[styles.statValue, { color: COLORS.textSecondary }]}>{fmtCompactCurrency(monthSummary.expense, settings.currencyCode)}</Text>
        </GlassCard>
      </View>

      <GlassCard style={styles.remainingCard}>
        <Text style={styles.statLabel}>REMAINING BALANCE (THIS MONTH)</Text>
        <Text style={[styles.balanceValue, styles.remainingValue, { color: monthSummary.net >= 0 ? COLORS.textPrimary : COLORS.red }]}>
          {fmtCurrency(monthSummary.net, settings.currencyCode)}
        </Text>
      </GlassCard>

      <GlassCard style={styles.ringCard}>
        <AnimatedSavingsRing pct={savingsPct} />
      </GlassCard>

      <GlassCard>
        <View style={styles.cardHeadRow}>
          <Text style={styles.cardTitle}>SMART INSIGHTS</Text>
          <TouchableOpacity onPress={handleFetchInsights} disabled={insightsLoading}>
            <Text style={styles.seeAll}>{insightsLoading ? 'THINKING…' : insights ? 'REFRESH' : 'GENERATE'}</Text>
          </TouchableOpacity>
        </View>
        {insightsError && <Text style={styles.insightError}>{insightsError}</Text>}
        {!insightsError && insights === null && !insightsLoading && (
          <Text style={styles.emptyText}>Get factual observations about your spending, budgets, and goals.</Text>
        )}
        {insights && insights.length === 0 && !insightsError && (
          <Text style={styles.emptyText}>Not enough data yet — add a few transactions first.</Text>
        )}
        {insights?.map((line, i) => (
          <View key={i} style={styles.insightRow}>
            <View style={styles.insightDot} />
            <Text style={styles.insightText}>{line}</Text>
          </View>
        ))}
      </GlassCard>

      {bills.length > 0 && (
        <GlassCard>
          <Text style={styles.cardTitle}>UPCOMING BILLS</Text>
          {bills.slice(0, 4).map((b) => (
            <View key={`${b.event.id}-${b.dateKey}`} style={styles.billRow}>
              <Text style={styles.billTitle} numberOfLines={1}>{b.event.title}</Text>
              <Text style={styles.billDate}>{fmtDateHuman(b.dateKey)}</Text>
            </View>
          ))}
        </GlassCard>
      )}

      <GlassCard>
        <View style={styles.cardHeadRow}>
          <Text style={styles.cardTitle}>RECENT TRANSACTIONS</Text>
          <TouchableOpacity onPress={() => onNavigate('transactions')}>
            <Text style={styles.seeAll}>SEE ALL →</Text>
          </TouchableOpacity>
        </View>
        {recent.length === 0 ? (
          <Text style={styles.emptyText}>No transactions yet — tap + to add one.</Text>
        ) : recent.map((t) => {
          const cat = t.categoryId ? categoryMap.get(t.categoryId) : undefined;
          const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
          const color = t.type === 'income' ? COLORS.textPrimary : t.type === 'expense' ? COLORS.textSecondary : COLORS.amber;
          return (
            <View key={t.id} style={styles.txRow}>
              <View style={[styles.txIconBox, { borderColor: cat?.color ?? COLORS.borderNeon }]}>
                <AppIcon id={cat?.emoji ?? (t.type === 'transfer' ? 'transfer' : 'tag')} size={16} color={cat?.color ?? COLORS.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txName} numberOfLines={1}>{cat?.name ?? (t.type === 'transfer' ? 'Transfer' : 'Uncategorized')}</Text>
                <Text style={styles.txDate}>{t.date}{t.notes ? ` · ${t.notes}` : ''}</Text>
              </View>
              <Text style={[styles.txAmount, { color }]}>{sign}{fmtCurrency(t.amount, settings.currencyCode)}</Text>
            </View>
          );
        })}
      </GlassCard>

      {categories.length > 0 && (
        <GlassCard>
          <View style={styles.cardHeadRow}>
            <Text style={styles.cardTitle}>MONTHLY ALLOCATION SUMMARY</Text>
            <TouchableOpacity onPress={() => onNavigate('calculator')}>
              <Text style={styles.seeAll}>CALCULATOR →</Text>
            </TouchableOpacity>
          </View>
          <DonutChart
            data={categories.map((c) => ({ label: c.name, value: c.percentage, color: c.color }))}
            centerLabel="ALLOCATED"
            centerValue="100%"
          />
        </GlassCard>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2 },
  content: { padding: SPACING.screenPad, gap: SPACING.md },

  statLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginBottom: SPACING.xs },
  balanceValue: { fontSize: FONT_SIZE.xxxl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700', letterSpacing: -0.5 },
  remainingValue: { fontSize: FONT_SIZE.xl },

  statRow: { flexDirection: 'row', gap: SPACING.sm },
  statCard: { flex: 1 },
  statValue: { fontSize: FONT_SIZE.lg, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },

  remainingCard: {},
  ringCard: { alignItems: 'center' },
  ringOverlay: { alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontSize: FONT_SIZE.xxl, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  ringLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginTop: 4 },

  cardTitle: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700', marginBottom: SPACING.sm },
  cardHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  seeAll: { fontSize: FONT_SIZE.xxs, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1 },
  emptyText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontFamily: FONTS.body ?? undefined },

  insightError: { fontSize: FONT_SIZE.sm, color: COLORS.amber, fontFamily: FONTS.body ?? undefined },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },
  insightDot: { width: 5, height: 5, borderRadius: RADII.full, backgroundColor: COLORS.textPrimary, marginTop: 7 },
  insightText: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.body ?? undefined, lineHeight: FONT_SIZE.sm * 1.5 },

  billRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.xs, borderBottomWidth: 1, borderBottomColor: COLORS.borderDim },
  billTitle: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.body ?? undefined },
  billDate: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined },

  txRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs, borderBottomWidth: 1, borderBottomColor: COLORS.borderDim },
  txIconBox: { width: 32, height: 32, borderRadius: RADII.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  txName: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.bodyMedium ?? undefined },
  txDate: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, marginTop: 2 },
  txAmount: { fontSize: FONT_SIZE.sm, fontFamily: FONTS.mono ?? undefined, fontWeight: '700' },
});
