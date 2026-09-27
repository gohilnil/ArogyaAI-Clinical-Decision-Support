// A 14-day strip showing which days the patient logged a diary entry.
//
// This is a presence chart, not a health metric: a filled cell means "an entry
// exists for this day", computed from the entries the account actually owns.
// It is deliberately not a severity or wellness trend — the diary has no
// consistent scale to plot, and inventing one would be a fabricated figure.

import { lastNDays, dayKey } from "../../lib/format";
import type { PatientLog } from "../../types";

export function LoggingStrip({ logs }: { logs: PatientLog[] }) {
  const days = lastNDays(14);

  const loggedDays = new Set<string>();
  for (const log of logs) {
    if (!log.createdAt) continue;
    try {
      loggedDays.add(dayKey(log.createdAt.toDate()));
    } catch {
      // A malformed timestamp is skipped rather than crashing the strip.
    }
  }

  const countsByDay: number[] = days.map((d) =>
    loggedDays.has(dayKey(d)) ? 1 : 0,
  );
  const activeDays = countsByDay.reduce((a, b) => a + b, 0);
  const today = days[days.length - 1];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-black text-slate-700">
          {activeDays === 0
            ? "No entries in the last 14 days"
            : `${activeDays} of the last 14 days logged`}
        </p>
        <p className="text-xs font-bold text-slate-400">Last 14 days</p>
      </div>
      <div className="flex items-end gap-1.5" role="img" aria-label={`Diary activity for the last 14 days: ${activeDays} day(s) with entries`}>
        {days.map((d, i) => {
          const active = countsByDay[i] === 1;
          const isToday = dayKey(d) === dayKey(today);
          return (
            <div key={dayKey(d)} className="flex-1 flex flex-col items-center gap-1.5">
              <div
                className={`w-full rounded-lg transition-colors ${
                  active ? "bg-emerald-500" : "bg-slate-100"
                } ${isToday ? "ring-2 ring-emerald-300 ring-offset-1" : ""}`}
                style={{ height: active ? "2.5rem" : "1.25rem" }}
                title={`${d.toLocaleDateString()} — ${active ? "entry logged" : "no entry"}`}
              />
              <span className="text-[9px] font-bold text-slate-400 tabular-nums">
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
