// Transient notifications.
//
// The patient pages previously reported success and failure with ad-hoc inline
// banners, each cleared by its own setTimeout or not cleared at all. That meant
// two pages disagreed on how long a message lived and one could leave a stale
// "Saved" on screen indefinitely. This centralises the lifetime and the a11y
// role: an error is announced assertively, a success politely.

import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { ToastContext } from "./toast-context";
import type { ToastContextValue, ToastTone } from "./toast-context";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const TONE_STYLES: Record<ToastTone, string> = {
  success: "bg-emerald-600 text-white",
  error: "bg-red-600 text-white",
  info: "bg-slate-900 text-white",
};

const TONE_ICON: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 size={18} />,
  error: <AlertCircle size={18} />,
  info: <Info size={18} />,
};

const LIFETIME_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, tone, message }]);
      setTimeout(() => dismiss(id), LIFETIME_MS);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (message: string) => toast(message, "success"),
      error: (message: string) => toast(message, "error"),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Rendered inside the app tree rather than a portal, and above the
          sidebar (z-[100]) so a toast is never hidden behind it. */}
      <div
        className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 w-[min(92vw,26rem)] no-print"
        role="region"
        aria-label="Notifications"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              className={`flex items-start gap-3 p-4 rounded-2xl shadow-lg font-bold text-sm ${TONE_STYLES[t.tone]}`}
              role={t.tone === "error" ? "alert" : "status"}
              aria-live={t.tone === "error" ? "assertive" : "polite"}
            >
              <span className="flex-shrink-0 mt-0.5" aria-hidden="true">
                {TONE_ICON[t.tone]}
              </span>
              <p className="flex-1 leading-snug">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
