// The label + control + hint/error wrapper for every form row.
//
// The wiring is the point: `htmlFor`/`id` bound together, `aria-describedby`
// pointing at the hint and the error, and `aria-invalid` set when there is one.
// Each page previously wrote the label and the input as adjacent siblings with
// no association, so a screen reader announced an unlabelled field and an error
// message was invisible to it.

import { useId, cloneElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";

export interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** The control. It receives the generated id + aria wiring via cloneElement,
   *  so callers keep writing <Input /> and <Select /> normally. */
  children: ReactElement<Record<string, unknown>>;
  className?: string;
}

export function Field({
  label,
  hint,
  error,
  required = false,
  children,
  className = "",
}: FieldProps) {
  const generatedId = useId();
  const controlId =
    (children.props.id as string | undefined) ?? `field-${generatedId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required || undefined,
      })
    : children;

  return (
    <div className={`space-y-2 ${className}`}>
      <label
        htmlFor={controlId}
        className="text-xs font-black uppercase tracking-widest text-slate-400"
      >
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs font-medium text-slate-400 leading-snug">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-bold text-red-600 leading-snug">
          {error}
        </p>
      )}
    </div>
  );
}
