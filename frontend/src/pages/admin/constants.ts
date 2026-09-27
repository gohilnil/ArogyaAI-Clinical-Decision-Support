// Values and helpers shared by the admin pages.
//
// Kept out of the component files on purpose: a module that exports both
// components and plain values breaks React Fast Refresh, so the constants and
// the components live apart. This is the constants side.

import type { FirestoreTimestamp } from "../../types";

export const ROLES = ["patient", "doctor", "admin"] as const;
export const STATUSES = ["approved", "pending", "rejected"] as const;

export type Role = (typeof ROLES)[number];
export type Status = (typeof STATUSES)[number];

/** An account's approval state. Absent = approved (accounts predate the field). */
export const statusOf = (u: { status?: string }): string => u.status || "approved";

export const STATUS_BADGE: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

export const ROLE_BADGE: Record<string, string> = {
  patient: "bg-emerald-100 text-emerald-700",
  doctor: "bg-blue-100 text-blue-700",
  admin: "bg-purple-100 text-purple-700",
};

/** The role's accent for bars and icons, kept in one place so it is consistent. */
export const ROLE_TONE: Record<string, string> = {
  patient: "bg-gradient-to-r from-emerald-400 to-teal-500",
  doctor: "bg-gradient-to-r from-blue-400 to-indigo-500",
  admin: "bg-gradient-to-r from-purple-400 to-fuchsia-500",
};

export const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const fmtWhen = (t?: FirestoreTimestamp): string =>
  t ? t.toDate().toLocaleString() : "—";

export const th =
  "p-5 font-black text-slate-400 text-xs uppercase tracking-widest text-left";
export const field =
  "p-3 rounded-xl border-2 border-slate-200 focus:border-purple-400 outline-none font-bold text-sm";
