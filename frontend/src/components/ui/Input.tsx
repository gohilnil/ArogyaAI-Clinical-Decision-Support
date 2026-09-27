// Text/number input sharing the portal's field styling. `mono` is for the
// patient code, where character-level legibility matters.

import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Monospace + wide tracking, for codes that must be read character by character. */
  mono?: boolean;
}

export function Input({ mono = false, className = "", ...rest }: InputProps) {
  return (
    <input
      {...rest}
      className={`w-full p-4 rounded-2xl border-2 bg-white outline-none transition-colors focus-visible:border-emerald-500 focus-visible:ring-4 focus-visible:ring-emerald-100 ${
        rest["aria-invalid"] ? "border-red-300" : "border-slate-200"
      } ${mono ? "font-mono font-bold text-lg tracking-widest" : "font-bold"} ${className}`}
    />
  );
}
