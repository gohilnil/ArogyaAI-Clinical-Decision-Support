// A card with a titled header. The header row (icon chip + title + optional
// description + optional right-aligned actions) was repeated across the patient
// and admin pages with small differences; this is that block, once.

import type { ReactNode } from "react";

export interface SectionCardProps {
  title: string;
  icon?: ReactNode;
  /** Tailwind classes for the icon chip, e.g. "bg-emerald-100 text-emerald-600". */
  iconTone?: string;
  description?: ReactNode;
  /** Right-aligned controls in the header row (a button, a filter, a count). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Id for the heading, so callers can wire aria-labelledby. */
  id?: string;
}

export function SectionCard({
  title,
  icon,
  iconTone = "bg-emerald-100 text-emerald-600",
  description,
  actions,
  children,
  className = "",
  id,
}: SectionCardProps) {
  return (
    <section
      className={`bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200/60 shadow-sm ${className}`}
      aria-labelledby={id}
    >
      <div className="flex items-start justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <span
              className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${iconTone}`}
              aria-hidden="true"
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2
              id={id}
              className="text-xl font-black text-slate-900 leading-snug"
            >
              {title}
            </h2>
            {description && (
              <p className="text-slate-500 font-medium text-sm mt-0.5">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
