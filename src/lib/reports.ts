
export type ColType = 'text' | 'int' | 'money' | 'pct' | 'date';
export type ReportColumn = { key: string; label: string; type: ColType };
export type ReportRow = Record<string, string | number | null>;
export type ReportSummary = { label: string; value: number; type: ColType };
export type ReportResult = {
  title: string;
  from: string;
  to: string;
  available: boolean;
  message?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: ReportSummary[];
};
type Built = Omit<ReportResult, 'title' | 'from' | 'to'>;
type Row = Record<string, unknown>;

import { createServerFn } from '@tanstack/react-start';
import { getSessionServer } from './auth-rpc';

export const getReportFn = createServerFn({ method: 'POST' })
  .validator((d: { name: string; from: string; to: string }) => d)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
    // Loaded on demand, so the database driver never reaches the browser bundle.
    const { runReport } = await import('./reports.server');
    return runReport(data);
  });
