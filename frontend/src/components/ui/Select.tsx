import type { SelectHTMLAttributes } from "react";

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={`w-full p-4 rounded-2xl border-2 bg-white outline-none transition-colors font-bold appearance-none focus-visible:border-emerald-500 focus-visible:ring-4 focus-visible:ring-emerald-100 ${
        rest["aria-invalid"] ? "border-red-300" : "border-slate-200"
      } ${className}`}
    >
      {children}
    </select>
  );
}
