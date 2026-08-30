import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { GlassCard } from '../../../components/GlassCard';
import { COLORS, FONTS, FONT_SIZE, SPACING, RADII } from '../../../theme';
import { getReportSummary, currentMonthKey, fmtCurrency, type FinanceSettings, type ReportSummary } from '../../../services/finance';
import { exportReportPdf, exportReportCsv, exportReportImage } from '../../../services/financeExport';

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface ReportsSectionProps {
  settings: FinanceSettings;
}

type ExportKind = 'pdf' | 'csv' | 'image';

export function ReportsSection({ settings }: ReportsSectionProps) {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const cardRef = useRef<View>(null);

  useEffect(() => { getReportSummary(monthKey).then(setReport); }, [monthKey]);

  const handleExport = useCallback(async (kind: ExportKind) => {
    if (!report) return;
    setExporting(kind);
    let ok = false;
    if (kind === 'pdf') ok = await exportReportPdf(report, settings.currencyCode);
    else if (kind === 'csv') ok = await exportReportCsv(report, settings.currencyCode);
    else ok = await exportReportImage(cardRef);
    setExporting(null);
    if (!ok) Alert.alert('Export failed', 'Could not export the report — please try again.');
  }, [report, settings.currencyCode]);

  if (!report) return null;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.monthRow}>
        <TouchableOpacity onPress={() => setMonthKey((k) => shiftMonth(k, -1))} hitSlop={8}>
          <Text style={styles.monthArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel(monthKey).toUpperCase()}</Text>
        <TouchableOpacity onPress={() => setMonthKey((k) => shiftMonth(k, 1))} hitSlop={8}>
          <Text style={styles.monthArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View ref={cardRef} collapsable={false}>
        <GlassCard>
          <Text style={styles.reportTitle}>MONTHLY SUMMARY</Text>
          <View style={styles.statGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{fmtCurrency(report.totalIncome, settings.currencyCode)}</Text>
              <Text style={styles.statLbl}>TOTAL INCOME</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{fmtCurrency(report.totalExpense, settings.currencyCode)}</Text>
              <Text style={styles.statLbl}>TOTAL EXPENSES</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: report.netSavings >= 0 ? COLORS.textPrimary : COLORS.red }]}>
                {fmtCurrency(report.netSavings, settings.currencyCode)}
              </Text>
              <Text style={styles.statLbl}>NET SAVINGS</Text>
            </View>
          </View>

          <View style={styles.divider} />
          <Text style={styles.rowLabel}>HIGHEST SPENDING CATEGORY</Text>
          <Text style={styles.rowValue}>
            {report.highestSpendingCategory ? `${report.highestSpendingCategory.name} — ${fmtCurrency(report.highestSpendingCategory.amount, settings.currencyCode)}` : 'N/A'}
          </Text>

          <Text style={styles.rowLabel}>HIGHEST INCOME SOURCE</Text>
          <Text style={styles.rowValue}>
            {report.highestIncomeSource ? `${report.highestIncomeSource.label} — ${fmtCurrency(report.highestIncomeSource.amount, settings.currencyCode)}` : 'N/A'}
          </Text>

          {report.goalProgress.length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.rowLabel}>GOAL PROGRESS</Text>
              {report.goalProgress.map((g) => (
                <View key={g.label} style={styles.miniRow}>
                  <Text style={styles.miniLabel}>{g.label}</Text>
                  <Text style={styles.miniValue}>{g.pct}%</Text>
                </View>
              ))}
            </>
          )}

          {report.budgetPerformance.length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.rowLabel}>BUDGET PERFORMANCE</Text>
              {report.budgetPerformance.map((b) => (
                <View key={b.categoryName} style={styles.miniRow}>
                  <Text style={styles.miniLabel}>{b.categoryName}</Text>
                  <Text style={[styles.miniValue, { color: b.pct >= 100 ? COLORS.red : b.pct >= 90 ? COLORS.amber : COLORS.textSecondary }]}>
                    {b.pct}%
                  </Text>
                </View>
              ))}
            </>
          )}
        </GlassCard>
      </View>

      <View style={styles.exportRow}>
        <TouchableOpacity style={styles.exportBtn} onPress={() => handleExport('pdf')} disabled={exporting !== null} activeOpacity={0.7}>
          <Text style={styles.exportText}>{exporting === 'pdf' ? '…' : 'PDF'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exportBtn} onPress={() => handleExport('csv')} disabled={exporting !== null} activeOpacity={0.7}>
          <Text style={styles.exportText}>{exporting === 'csv' ? '…' : 'CSV'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exportBtn} onPress={() => handleExport('image')} disabled={exporting !== null} activeOpacity={0.7}>
          <Text style={styles.exportText}>{exporting === 'image' ? '…' : 'IMAGE'}</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.screenPad, gap: SPACING.md },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  monthArrow: { fontSize: 24, color: COLORS.textPrimary, lineHeight: 24 },
  monthLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, fontWeight: '700' },

  reportTitle: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 2, fontWeight: '700', marginBottom: SPACING.md },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginBottom: SPACING.sm },
  statItem: { minWidth: 90 },
  statVal: { fontSize: FONT_SIZE.lg, color: COLORS.textPrimary, fontFamily: FONTS.heading ?? undefined, fontWeight: '700' },
  statLbl: { fontSize: 9, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1, marginTop: 2 },

  divider: { height: 1, backgroundColor: COLORS.borderDim, marginVertical: SPACING.sm },
  rowLabel: { fontSize: FONT_SIZE.xxs, color: COLORS.textMuted, fontFamily: FONTS.mono ?? undefined, letterSpacing: 1.5, marginBottom: 2 },
  rowValue: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.body ?? undefined, marginBottom: SPACING.sm },

  miniRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  miniLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.body ?? undefined },
  miniValue: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontFamily: FONTS.mono ?? undefined, fontWeight: '600' },

  exportRow: { flexDirection: 'row', gap: SPACING.sm },
  exportBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: RADII.sm, paddingVertical: SPACING.sm, alignItems: 'center' },
  exportText: { fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontFamily: FONTS.mono ?? undefined, fontWeight: '700', letterSpacing: 1.5 },
});
