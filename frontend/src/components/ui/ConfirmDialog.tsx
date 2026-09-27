// A confirmation step for actions that are not trivially reversible — deleting
// a diary entry, unlinking a health record. Built on <dialog> semantics via a
// plain overlay rather than the native element, so styling matches the portal.

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Move focus into the dialog so a keyboard user is not left behind on the
  // page under it, and so Escape has somewhere to land.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl"
          >
            <div className="flex items-start gap-4 mb-6">
              <span
                className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  tone === "danger"
                    ? "bg-red-100 text-red-600"
                    : "bg-emerald-100 text-emerald-600"
                }`}
                aria-hidden="true"
              >
                <AlertTriangle size={22} />
              </span>
              <div>
                <h2 id="confirm-title" className="text-xl font-black text-slate-950">
                  {title}
                </h2>
                <p
                  id="confirm-message"
                  className="text-slate-500 font-medium text-sm mt-2 leading-relaxed"
                >
                  {message}
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                ref={cancelRef}
                onClick={onCancel}
                disabled={busy}
                className="px-5 py-3 rounded-2xl font-black text-sm text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <Button
                variant={tone === "danger" ? "danger" : "primary"}
                size="md"
                loading={busy}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
