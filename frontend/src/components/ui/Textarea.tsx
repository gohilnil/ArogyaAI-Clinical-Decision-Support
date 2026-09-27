import type { TextareaHTMLAttributes } from "react";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grows with content instead of showing an inner scrollbar. */
  autoGrow?: boolean;
}

export function Textarea({ className = "", ...rest }: TextareaProps) {
  return (
    <textarea
      {...rest}
      className={`w-full p-4 rounded-2xl border-2 bg-slate-50 outline-none transition-colors font-medium resize-none focus-visible:border-emerald-500 focus-visible:ring-4 focus-visible:ring-emerald-100 focus-visible:bg-white ${
        rest["aria-invalid"] ? "border-red-300" : "border-slate-200/70"
      } ${className}`}
    />
  );
}
