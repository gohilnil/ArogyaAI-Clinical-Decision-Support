// The audit log: what administrative actions were taken, by whom, and when.
//
// HONESTY NOTE, WHICH IS ALSO SHOWN ON THE PAGE: this trail is written by the
// admin's own client. It records what was done THROUGH the product — which is
// what an audit of the product asks for — but it is not tamper-proof, because
// an operator who bypassed the app could write whatever they liked. The rules
// still constrain it (admin-only, actor must be the caller, append-only), and
// a hardened deployment would move the write server-side. Saying so beats
// implying a guarantee this does not provide.

import { useEffect, useMemo, useState } from "react";
import {
  ScrollText,
  RefreshCw,
  Search,
  X,
  AlertCircle,
  UserCheck,
  UserX,
  Pencil,
  Clock,
} from "lucide-react";
import { listAuditLogs } from "../../services/firestore";
import type { AuditLogEntry } from "../../types";
import { EmptyState, PanelCard, SkeletonRows } from "./shared";
import { fmtWhen } from "./constants";

/** An icon per action verb, so the log scans by shape as well as text. */
function actionIcon(action: string) {
  if (action.startsWith("status-approved")) return <UserCheck size={16} className="text-emerald-600" />;
  if (action.startsWith("status-rejected")) return <UserX size={16} className="text-red-600" />;
  if (action === "update-account") return <Pencil size={16} className="text-blue-600" />;
  return <Clock size={16} className="text-slate-500" />;
}

export default function AdminAuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const logs = await listAuditLogs();
        if (!cancelled) setEntries(logs);
      } catch (e) {
        if (cancelled) return;
        console.error("Could not load the audit log:", e);
        setError("Could not load the audit log. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((e) =>
      [e.actorEmail, e.action, e.summary, e.targetLabel, e.targetId]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [entries, search]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-sm p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="relative flex-1">
          <Search
            size={17}
            className="absolute left-3.5 top-3.5 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search the audit log"
            placeholder="Search by actor, action or target..."
            className="w-full pl-11 pr-9 py-3 rounded-xl border-2 border-slate-200 focus:border-purple-400 outline-none font-bold text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-700"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <button
          onClick={() => setReloadToken((n) => n + 1)}
          disabled={loading}
          className="bg-slate-950 text-white px-5 py-3 rounded-xl font-black text-sm disabled:opacity-60 flex items-center gap-2 hover:bg-slate-800"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error && (
        <div className="p-6 bg-red-100 text-red-700 rounded-2xl flex items-center gap-4">
          <AlertCircle size={20} />
          <p className="font-black flex-1">{error}</p>
          <button
            onClick={() => setReloadToken((n) => n + 1)}
            className="bg-red-700 text-white px-5 py-2.5 rounded-xl font-black text-sm"
          >
            Retry
          </button>
        </div>
      )}

      <PanelCard
        title="Administrative actions"
        icon={<ScrollText className="text-purple-500" size={22} />}
        action={
          !loading && (
            <span className="text-xs font-black bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
              {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
            </span>
          )
        }
      >
        {loading ? (
          <SkeletonRows rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ScrollText size={40} />}
            title={
              search
                ? "No entries match your search."
                : "No administrative actions recorded yet."
            }
            hint={
              search
                ? "Try a different term."
                : "Approvals and account edits made from this panel will be listed here."
            }
          />
        ) : (
          <ol className="divide-y divide-slate-100">
            {filtered.map((e) => (
              <li key={e.id} className="p-5 flex items-start gap-4">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {actionIcon(e.action)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-slate-900">{e.summary}</p>
                  <p className="text-xs font-bold text-slate-500 mt-0.5">
                    by {e.actorEmail || e.actorUid}
                    {e.targetLabel ? ` · target ${e.targetLabel}` : ""}
                  </p>
                  {/* Before/after, shown only when a value actually changed —
                      an action that only set a status does not need a diff. */}
                  {(e.before && Object.keys(e.before).length > 0) ||
                  (e.after && Object.keys(e.after).length > 0) ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(e.before || {}).map(([k, v]) =>
                        String(e.after?.[k] ?? "") !== String(v) ? (
                          <span
                            key={`b-${k}`}
                            className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg font-mono"
                          >
                            {k}: {String(v) || "—"} → {String(e.after?.[k] ?? "—") || "—"}
                          </span>
                        ) : null,
                      )}
                    </div>
                  ) : null}
                </div>
                <time className="text-xs font-bold text-slate-400 flex-shrink-0 text-right">
                  {fmtWhen(e.at)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </PanelCard>

      <div className="bg-slate-950 rounded-[2rem] p-8 text-white">
        <ScrollText className="text-purple-400 mb-3" size={24} />
        <h2 className="font-black text-lg mb-2">What this log does and does not guarantee</h2>
        <p className="text-slate-400 font-medium text-sm leading-relaxed max-w-3xl">
          Entries are written by the administrator's own client, so this is an{" "}
          <strong className="text-slate-200">accountability trail</strong>, not a
          tamper-proof audit. The security rules ensure only an admin can write
          one, that the actor must be the caller themselves, and that an entry
          can never be edited or deleted — but an operator who bypassed the app
          could write whatever they liked. A hardened deployment would move this
          write to a server-side function. Stated plainly here rather than
          implying a stronger guarantee than this provides.
        </p>
      </div>
    </div>
  );
}
