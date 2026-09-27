// The toast context and its consumer hook, kept in a separate module from the
// provider component so that file can export a component alone (React Fast
// Refresh only hot-reloads a module that does exactly that).

import { createContext, useContext } from "react";

export type ToastTone = "success" | "error" | "info";

export interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider.");
  }
  return ctx;
}
