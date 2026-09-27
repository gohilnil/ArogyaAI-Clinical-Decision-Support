// The "nothing here yet" block. A separate component so an empty list, an empty
// diary and an unlinked record all use the same shape and, importantly, can each
// offer the action that resolves the emptiness rather than a dead end.

import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-10 ${className}`}>
      {icon && (
        <div className="mb-4 text-slate-300" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="text-slate-700 font-black text-sm">{title}</p>
      {description && (
        <p className="text-slate-500 font-medium text-xs mt-2 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
