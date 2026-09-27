// The first screen while the auth session and profile are being established.
//
// Previously the same moment rendered the literal string "Initializing Secure
// Portal..." in 2xl font on a flat slate background — the least polished frame
// in the app, shown to every user on every cold load. This gives that moment
// the product's own identity without changing what is happening underneath.

import { Leaf, Loader2 } from "lucide-react";

export function BootScreen({ label = "Loading your portal…" }: { label?: string }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-700 p-3 rounded-2xl shadow-lg shadow-emerald-900/50">
            <Leaf className="text-white w-7 h-7" aria-hidden="true" />
          </div>
          <span className="text-3xl font-black tracking-tight text-white">
            Arogya<span className="text-emerald-400">AI</span>
          </span>
        </div>
        <div
          className="flex items-center gap-2 text-slate-400 font-bold text-sm"
          role="status"
          aria-live="polite"
        >
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          {label}
        </div>
      </div>
    </div>
  );
}
