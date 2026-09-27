// One button for the whole portal.
//
// Every screen previously hand-rolled its own <button> with an inline class
// string, so the same primary action rendered at three different paddings and
// two different radii depending on which page you were on. This keeps one
// definition of each intent, and makes the loading state impossible to forget:
// a caller passes `loading` and the spinner + disabled handling come with it,
// rather than each page re-implementing "…and remember to disable while saving".

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-slate-950 text-white hover:bg-slate-800 focus-visible:ring-slate-400",
  success:
    "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-300",
  secondary:
    "bg-white border-2 border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-600 focus-visible:ring-emerald-200",
  ghost:
    "text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-200",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-300",
};

const SIZES: Record<Size, string> = {
  sm: "px-4 py-2 text-sm rounded-xl gap-2",
  md: "px-6 py-3 text-sm rounded-2xl gap-2",
  lg: "px-6 py-4 text-base rounded-2xl gap-3",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Icon shown before the label. Hidden while `loading` so the spinner reads. */
  icon?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  fullWidth = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center font-black transition-all outline-none focus-visible:ring-4 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? "w-full" : ""} ${className}`}
    >
      {loading ? (
        <Loader2 size={size === "lg" ? 22 : 18} className="animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
