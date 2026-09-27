// The title block at the top of a page. Every page had its own h1 with a
// slightly different size and margin; this is the one definition, with an
// optional right-aligned actions slot.

import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
      <div className="flex items-start gap-4 min-w-0">
        {icon}
        <div className="min-w-0">
          <h1 className="text-3xl md:text-4xl font-black text-slate-950 tracking-tighter">
            {title}
          </h1>
          {subtitle && (
            <p className="text-slate-500 font-medium text-base md:text-lg mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
