// Date formatting for the clinical pages.
//
// These lived as copy-pasted locals in DashboardPage and PatientsPage. Two
// copies of "how long ago" drift: one gets a fix, the other keeps the old
// behaviour, and the same timestamp renders differently on two screens of the
// same portal. One definition removes that class of bug.

import type { FirestoreTimestamp } from "../types";

/** Anything with the Firestore timestamp shape, or a plain Date. */
type Stamp = FirestoreTimestamp | undefined | null;

function toDate(t: Stamp): Date | null {
  if (!t) return null;
  try {
    return t.toDate();
  } catch {
    return null;
  }
}

/**
 * "just now" / "5m ago" / "3h ago" / "2d ago", then an absolute date.
 *
 * Relative time is what a clinician scanning a list actually needs: "2h ago"
 * answers "is this fresh?" at a glance, where "27/09/2026, 14:03" has to be
 * mentally subtracted from the clock. Past a week the relative form stops being
 * useful ("9d ago" is harder to place than the date), so it falls back.
 */
export function relativeTime(t: Stamp): string {
  const d = toDate(t);
  if (!d) return "—";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 0) return "just now"; // clock skew: never show a negative age
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

/** Full local date and time, for a tooltip or a detail row. */
export function fullDate(t: Stamp): string {
  const d = toDate(t);
  return d ? d.toLocaleString() : "—";
}

/** Date only, for a row where the time of day adds nothing. */
export function dateOnly(t: Stamp): string {
  const d = toDate(t);
  return d ? d.toLocaleDateString() : "—";
}

/** Date only, for grouping and chart labels. */
export function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Midnight today, in LOCAL time.
 *
 * Local rather than UTC deliberately: "assessments today" means the
 * practitioner's today. A UTC boundary would roll over mid-afternoon for an
 * Indian clinic and make the figure quietly wrong.
 */
export function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The last `n` days as local-midnight buckets, oldest first. */
export function lastNDays(n: number): Date[] {
  const out: Date[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    out.push(d);
  }
  return out;
}

/**
 * A day key ("2026-09-27") in LOCAL time, so a timestamp can be grouped into
 * the bucket it belongs to without a timezone library.
 */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
