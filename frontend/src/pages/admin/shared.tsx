// Small presentational pieces shared by the admin pages.
//
// Components only — the constants and helpers live in ./constants so that this
// module exports nothing but components, which keeps React Fast Refresh working.
//
// Everything here is deliberately library-free apart from framer-motion, which
// the rest of the app already uses. A charting or table dependency would add
// bundle weight to a clinical tool for a handful of rows and one bar chart.

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: string;
}) {
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wide border ${tone}`}
    >
      {children}
    </span>
  );
}

/**
 * A single labelled bar in a small distribution chart.
 *
 * Bars are scaled against the largest value so relative weight reads
 * correctly, and the count is always printed, so the chart never depends on
 * colour or length alone.
 */
export function DistributionBars({
  rows,
  emptyLabel,
}: {
  rows: { label: string; count: number; tone: string }[];
  emptyLabel: string;
}) {
  const peak = rows.reduce((m, r) => Math.max(m, r.count), 0);
  if (rows.length === 0 || peak === 0) {
    return <p className="text-slate-400 font-bold text-sm py-4">{emptyLabel}</p>;
  }
  return (
    <div className="space-y-3.5">
      {rows.map((r, i) => (
        <div key={r.label}>
          <div className="flex justify-between text-sm font-bold text-slate-700 mb-1.5">
            <span className="truncate">{r.label}</span>
            <span className="text-slate-400 tabular-nums">{r.count}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(r.count / peak) * 100}%` }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className={`h-2.5 rounded-full ${r.tone}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatTile({
  label,
  value,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  tone: string;
  loading?: boolean;
}) {
  return (
    <div className="bg-white p-6 rounded-[1.75rem] border border-slate-200/60 shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${tone}`}>
        {icon}
      </div>
      <div>
        <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">
          {label}
        </p>
        <p className="text-3xl font-black text-slate-950 leading-tight">
          {loading ? "…" : value}
        </p>
      </div>
    </div>
  );
}

export function PanelCard({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex items-center gap-3 flex-wrap">
        {icon}
        <h2 className="text-xl font-black text-slate-950">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="p-12 text-center">
      <div className="mx-auto mb-3 text-slate-300 flex justify-center">{icon}</div>
      <p className="text-slate-600 font-black">{title}</p>
      {hint && <p className="text-slate-400 font-medium text-sm mt-2">{hint}</p>}
    </div>
  );
}

/** Skeleton rows, so a loading table shows its shape rather than a spinner. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="p-6 space-y-3" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 rounded-2xl bg-slate-100 animate-pulse" />
      ))}
    </div>
  );
}
