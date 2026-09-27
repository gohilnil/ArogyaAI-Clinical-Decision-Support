// Catches a render crash anywhere below it and shows a recovery screen instead
// of a blank white page.
//
// Without this, a single unexpected shape — a null it did not expect, a bad
// timestamp, a Firestore document missing a field — unmounts the whole tree and
// the user sees nothing at all, with no way back. That is the worst failure
// mode for a clinical tool: it looks identical to "the server is down", and it
// gives the person no action. This converts it into a stated problem and a
// button that reloads.
//
// It is a class component because React only exposes error boundaries as
// classes; there is no hook equivalent.

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Left in deliberately: the console is the only record of the component
    // stack, and a boundary that swallowed it silently would make the crash
    // undiagnosable in the field.
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-[2rem] p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={30} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-black text-white mb-3">
            Something went wrong
          </h1>
          <p className="text-slate-400 font-medium text-sm leading-relaxed mb-8">
            The portal hit an unexpected error and could not finish drawing this
            screen. Your records are safe — nothing was lost. Reloading usually
            clears it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-3.5 rounded-2xl font-black hover:bg-emerald-700 transition-colors"
          >
            <RotateCw size={18} aria-hidden="true" /> Reload the portal
          </button>
          {import.meta.env.DEV && (
            <pre className="mt-8 text-left text-xs text-red-400 bg-slate-950 rounded-xl p-4 overflow-auto max-h-48">
              {this.state.error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
