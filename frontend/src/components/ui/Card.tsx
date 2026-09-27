// The surface every content block sits on. Kept deliberately dumb: it is the
// rounded white panel, nothing else. SectionCard composes it when a heading is
// needed, so a plain content card and a titled card never drift apart.

import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Removes the drop shadow — used inside print layouts, where a shadow is
   *  invisible on paper but still costs a repaint. */
  flat?: boolean;
}

export function Card({ children, flat = false, className = "", ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={`bg-white rounded-[2rem] border border-slate-200/60 ${flat ? "" : "shadow-sm"} ${className}`}
    >
      {children}
    </div>
  );
}
