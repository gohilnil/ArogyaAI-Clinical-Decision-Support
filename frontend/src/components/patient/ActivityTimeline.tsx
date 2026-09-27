// Diary entries and assessments merged into one chronological feed.
//
// The patient's history was previously split across two cards that each showed
// only their own kind of event, so "what happened, and when" required reading
// two lists and interleaving them mentally. This merges both by timestamp.

import { Link } from "react-router-dom";
import { ClipboardCheck, MessageSquare, ArrowRight, Calendar, Leaf } from "lucide-react";
import { dateOnly, relativeTime } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import type { Assessment, PatientLog } from "../../types";

type Item =
  | { kind: "assessment"; at: number; value: Assessment }
  | { kind: "log"; at: number; value: PatientLog };

/** Timestamp to millis, tolerating a malformed or absent value. */
function millisOf(t: { toMillis?: () => number } | undefined): number {
  try {
    return t?.toMillis?.() ?? 0;
  } catch {
    return 0;
  }
}

export function ActivityTimeline({
  assessments,
  logs,
  limit,
}: {
  assessments: Assessment[];
  logs: PatientLog[];
  /** Cap the feed; omit to show everything. */
  limit?: number;
}) {
  const items: Item[] = [
    ...assessments.map<Item>((a) => ({
      kind: "assessment",
      at: millisOf(a.createdAt),
      value: a,
    })),
    ...logs.map<Item>((l) => ({
      kind: "log",
      at: millisOf(l.createdAt),
      value: l,
    })),
  ].sort((a, b) => b.at - a.at);

  const shown = limit ? items.slice(0, limit) : items;

  if (shown.length === 0) {
    return (
      <EmptyState
        icon={<Leaf size={40} />}
        title="Nothing recorded yet"
        description="Once your practitioner records an assessment, or you log a symptom entry, it will appear here in order."
      />
    );
  }

  return (
    <ol className="space-y-3">
      {shown.map((item) => {
        if (item.kind === "assessment") {
          const a = item.value;
          return (
            <li key={`a-${a.id}`}>
              <Link
                to={`/assessment/${a.id}`}
                className="flex items-start gap-4 bg-slate-50 hover:bg-emerald-50/60 p-5 rounded-2xl border border-slate-100 hover:border-emerald-200 transition-colors group"
              >
                <span
                  className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0"
                  aria-hidden="true"
                >
                  <ClipboardCheck size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge tone="info">Assessment</Badge>
                    <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                      <Calendar size={11} /> {dateOnly(a.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm font-black text-slate-800 truncate">
                    {a.prediction}
                  </p>
                  <p className="text-xs font-medium text-slate-500 mt-0.5 line-clamp-1">
                    {a.symptoms}
                  </p>
                </div>
                <ArrowRight
                  size={16}
                  className="text-slate-300 group-hover:text-emerald-500 transition-colors flex-shrink-0 mt-1"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        }

        const l = item.value;
        return (
          <li
            key={`l-${l.id}`}
            className="flex items-start gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-100"
          >
            <span
              className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0"
              aria-hidden="true"
            >
              <MessageSquare size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge tone="success">Diary</Badge>
                <span className="text-xs font-bold text-slate-400" title={dateOnly(l.createdAt)}>
                  {relativeTime(l.createdAt)}
                </span>
                {!l.patientId && <Badge tone="warning">Not linked</Badge>}
              </div>
              <p className="text-sm font-medium text-slate-700">{l.symptoms}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
