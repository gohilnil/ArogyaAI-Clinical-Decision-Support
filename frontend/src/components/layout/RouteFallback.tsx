// Shown while a code-split route chunk is being fetched.
//
// Route pages are lazily imported so the initial bundle carries only the shell
// and the login screen. The cost is a brief gap on first visit to a page, and
// this fills it — a blank flash on a slow connection reads as a broken link.

import { Leaf, Loader2 } from "lucide-react";

export function RouteFallback() {
  return (
    <div
      className="min-h-[60vh] flex flex-col items-center justify-center gap-4"
      role="status"
      aria-live="polite"
    >
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-900/20">
        <Leaf className="text-white w-7 h-7" aria-hidden="true" />
      </div>
      <div className="flex items-center gap-2 text-slate-400 font-bold text-sm">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        Loading…
      </div>
    </div>
  );
}
