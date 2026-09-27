// The single figure tile used across the clinical and admin pages.
//
// It was previously copy-pasted into DashboardPage, PatientsPage and the admin
// panel, with small drifts between the three. One component keeps the same
// figure looking the same everywhere, which matters when a clinician reads the
// same number on a dashboard tile and a list header.

import type { ReactNode } from "react";

export function StatTile({
  label,
  value,
  icon,
  tone,
  note,
  loading,
}: {
  label: string;
  /** The figure. A caller that has already resolved its own empty state may
   *  pass a string ("—"); otherwise pass the number and let `loading` cover
   *  the in-flight case. Either way the tile never invents a value. */
  value: string | number;
  icon: ReactNode;
  /** Tailwind classes for the icon chip, e.g. "bg-emerald-100 text-emerald-600". */
  tone: string;
  /** An optional caveat printed under the figure, for numbers that would
   *  otherwise be read as more than they are (e.g. a raw model score). */
  note?: string;
  /** Renders "…" in place of the value while a fetch is in flight. */
  loading?: boolean;
}) {
  return (
    <div className="bg-white p-6 rounded-[1.75rem] border border-slate-200/60 shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${tone}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">
          {label}
        </p>
        <p className="text-3xl font-black text-slate-950 leading-tight tabular-nums">
          {loading ? "…" : value}
        </p>
        {note && !loading && (
          <p className="text-[11px] font-semibold text-slate-400 mt-1 leading-snug">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
