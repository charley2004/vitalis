import type { RefObject } from 'react';
import type { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as DocumentPicker from 'expo-document-picker';
import { captureRef } from 'react-native-view-shot';
import { fmtCurrency, type ReportSummary } from './finance';

async function shareFile(uri: string): Promise<boolean> {
  try {
    const available = await Sharing.isAvailableAsync();
    if (!available) return false;
    await Sharing.shareAsync(uri);
    return true;
  } catch { return false; }
}

function buildReportHtml(report: ReportSummary, currencyCode: string): string {
  const budgetRows = report.budgetPerformance
    .map((b) => `<tr><td>${b.categoryName}</td><td>${fmtCurrency(b.budgeted, currencyCode)}</td><td>${fmtCurrency(b.spent, currencyCode)}</td><td>${b.pct}%</td></tr>`)
    .join('');
  const goalRows = report.goalProgress
    .map((g) => `<tr><td>${g.label}</td><td>${g.pct}%</td></tr>`)
    .join('');
  return `
    <html><head><meta charset="utf-8"/><style>
      body { font-family: -apple-system, sans-serif; padding: 24px; color: #111; }
      h1 { font-size: 20px; } h2 { font-size: 14px; margin-top: 24px; color: #555; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      td, th { border-bottom: 1px solid #ddd; padding: 6px 8px; font-size: 12px; text-align: left; }
      .stat { display: inline-block; margin-right: 24px; }
      .stat .val { font-size: 18px; font-weight: 700; }
      .stat .lbl { font-size: 10px; color: #888; text-transform: uppercase; }
    </style></head><body>
      <h1>Vitalis Finance Report — ${report.monthKey}</h1>
      <div class="stat"><div class="val">${fmtCurrency(report.totalIncome, currencyCode)}</div><div class="lbl">Total Income</div></div>
      <div class="stat"><div class="val">${fmtCurrency(report.totalExpense, currencyCode)}</div><div class="lbl">Total Expenses</div></div>
      <div class="stat"><div class="val">${fmtCurrency(report.netSavings, currencyCode)}</div><div class="lbl">Net Savings</div></div>
      <h2>Highest Spending Category</h2>
      <p>${report.highestSpendingCategory ? `${report.highestSpendingCategory.name} — ${fmtCurrency(report.highestSpendingCategory.amount, currencyCode)}` : 'N/A'}</p>
      <h2>Highest Income Source</h2>
      <p>${report.highestIncomeSource ? `${report.highestIncomeSource.label} — ${fmtCurrency(report.highestIncomeSource.amount, currencyCode)}` : 'N/A'}</p>
      <h2>Budget Performance</h2>
      <table><tr><th>Category</th><th>Budgeted</th><th>Spent</th><th>%</th></tr>${budgetRows || '<tr><td colspan="4">No budgets set</td></tr>'}</table>
      <h2>Goal Progress</h2>
      <table><tr><th>Goal</th><th>Progress</th></tr>${goalRows || '<tr><td colspan="2">No goals set</td></tr>'}</table>
    </body></html>
  `;
}

export async function exportReportPdf(report: ReportSummary, currencyCode: string): Promise<boolean> {
  try {
    const html = buildReportHtml(report, currencyCode);
    const { uri } = await Print.printToFileAsync({ html });
    return await shareFile(uri);
  } catch { return false; }
}

export async function exportReportCsv(report: ReportSummary, currencyCode: string): Promise<boolean> {
  try {
    const lines: string[] = [
      'Vitalis Finance Report', report.monthKey, '',
      'Metric,Value',
      `Total Income,${report.totalIncome}`,
      `Total Expenses,${report.totalExpense}`,
      `Net Savings,${report.netSavings}`,
      `Highest Spending Category,${report.highestSpendingCategory?.name ?? ''}`,
      `Highest Income Source,${report.highestIncomeSource?.label ?? ''}`,
      '',
      'Budget Performance',
      'Category,Budgeted,Spent,Percent',
      ...report.budgetPerformance.map((b) => `${b.categoryName},${b.budgeted},${b.spent},${b.pct}`),
      '',
      'Goal Progress',
      'Goal,Percent',
      ...report.goalProgress.map((g) => `${g.label},${g.pct}`),
    ];
    const file = new File(Paths.cache, `vitalis-report-${report.monthKey}.csv`);
    file.write(lines.join('\n'));
    return await shareFile(file.uri);
  } catch { return false; }
}

export async function exportReportImage(viewRef: RefObject<View | null>): Promise<boolean> {
  try {
    const uri = await captureRef(viewRef, { format: 'png', quality: 0.9 });
    return await shareFile(uri);
  } catch { return false; }
}

const FINANCE_PREFIX = '@vitalis/finance_';

/** Exports every @vitalis/finance_* key as a single shareable JSON file —
 *  the manual counterpart to Supabase sync, for offline backup/transfer. */
export async function exportFinanceBackup(): Promise<boolean> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const financeKeys = keys.filter((k) => k.startsWith(FINANCE_PREFIX));
    const pairs = await AsyncStorage.multiGet(financeKeys);
    const backup: Record<string, string> = {};
    for (const [k, v] of pairs) if (v !== null) backup[k] = v;
    const file = new File(Paths.cache, `vitalis-finance-backup-${Date.now()}.json`);
    file.write(JSON.stringify(backup, null, 2));
    return await shareFile(file.uri);
  } catch { return false; }
}

/** Restores a previously exported backup, ignoring any key outside the
 *  finance prefix so a mismatched file can't clobber unrelated app data. */
export async function restoreFinanceBackup(): Promise<boolean> {
  try {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
    if (result.canceled || !result.assets?.[0]) return false;
    const file = new File(result.assets[0].uri);
    const text = await file.text();
    const data = JSON.parse(text) as Record<string, string>;
    const entries = Object.entries(data).filter(([k]) => k.startsWith(FINANCE_PREFIX));
    if (entries.length === 0) return false;
    await AsyncStorage.multiSet(entries);
    return true;
  } catch { return false; }
}
