// The approval queue: practitioners waiting for a decision.
//
// This is the onboarding step that replaced the invite system. A doctor
// self-registers into `pending` and can read only their own profile until an
// admin approves them, so this queue is not cosmetic — it is the gate.
//
// Once decided, an account leaves this list, so the table also shows recently
// decided practitioners for context. That history is read from the accounts
// themselves rather than a separate store.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Clock,
  UserCheck,
  UserX,
  CheckCircle2,
  AlertCircle,
  Building2,
  RotateCcw,
  Inbox,
} from "lucide-react";
import { setDoctorStatus, type UserDataWithId } from "../../services/firestore";
import { useAdminData } from "./useAdminData";
import { Badge, EmptyState, PanelCard, SkeletonRows } from "./shared";
import { STATUS_BADGE, statusOf } from "./constants";

export default function AdminApprovalsPage() {
  const { users, loading, actor, applyUserChange } = useAdminData();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    id: string;
    ok: boolean;
    text: string;
  } | null>(null);

  const pending = useMemo(
    () =>
      users
        .filter((u) => u.role === "doctor" && statusOf(u) === "pending")
        .sort((a, b) => (a.email || "").localeCompare(b.email || "")),
    [users],
  );

  const decided = useMemo(
    () =>
      users
        .filter((u) => u.role === "doctor" && statusOf(u) !== "pending")
        .sort((a, b) => (a.email || "").localeCompare(b.email || "")),
    [users],
  );

  const decide = async (
    u: UserDataWithId,
    status: "approved" | "rejected",
  ) => {
    setBusyId(u.id);
    try {
      await setDoctorStatus(u.id, status, actor, {
        targetLabel: u.email || u.id,
      });
      applyUserChange(u.id, { status });
      setMessage({
        id: u.id,
        ok: status === "approved",
        text:
          status === "approved"
            ? "Approved. The practitioner now has access."
            : "Rejected. The account cannot access clinic data.",
      });
    } catch (e) {
      console.error("Decision failed:", e);
      setMessage({ id: u.id, ok: false, text: "Could not record that decision." });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {!loading && pending.length === 0 && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-[2rem] p-8 flex items-center gap-4">
          <CheckCircle2 className="text-emerald-600" size={26} />
          <div>
            <p className="font-black text-emerald-900">Nothing awaiting approval</p>
            <p className="text-emerald-700 font-medium text-sm">
              New practitioners appear here after they register with a Clinic ID.
            </p>
          </div>
        </div>
      )}

      {!loading && pending.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border-2 border-amber-200 rounded-[2rem] p-6 md:p-8"
        >
          <div className="flex items-center gap-3 mb-5">
            <Clock className="text-amber-600" size={22} />
            <h2 className="text-xl font-black text-amber-900">
              Awaiting approval
              <span className="ml-2 text-sm font-black bg-amber-200 text-amber-900 px-2.5 py-1 rounded-full">
                {pending.length}
              </span>
            </h2>
          </div>
          <div className="space-y-3">
            {pending.map((u) => (
              <div
                key={u.id}
                className="bg-white p-5 rounded-2xl border border-amber-200 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-900 truncate">
                    {u.email || u.id}
                  </p>
                  <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <Building2 size={12} /> Clinic {u.clinicId || "—"}
                  </p>
                  {message?.id === u.id && (
                    <p
                      className={`mt-2 text-xs font-bold flex items-center gap-1 ${message.ok ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {message.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                      {message.text}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => decide(u, "approved")}
                    disabled={busyId === u.id}
                    className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <UserCheck size={16} /> Approve
                  </button>
                  <button
                    onClick={() => decide(u, "rejected")}
                    disabled={busyId === u.id}
                    className="bg-white text-red-700 border-2 border-red-200 px-5 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 hover:bg-red-50 disabled:opacity-60"
                  >
                    <UserX size={16} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <PanelCard
        title="Practitioner access"
        icon={<UserCheck className="text-blue-500" size={22} />}
      >
        {loading ? (
          <SkeletonRows rows={4} />
        ) : decided.length === 0 ? (
          <EmptyState
            icon={<Inbox size={40} />}
            title="No practitioners have been decided yet."
            hint="Approved and rejected accounts will be listed here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[640px]">
              <thead className="bg-slate-50 border-b border-slate-200/60">
                <tr>
                  {["Practitioner", "Clinic", "Decision", ""].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="p-5 font-black text-slate-400 text-xs uppercase tracking-widest"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {decided.map((u) => {
                  const status = statusOf(u);
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60">
                      <td className="p-5">
                        <p className="font-black text-slate-900">{u.email || u.id}</p>
                        {message?.id === u.id && (
                          <p
                            className={`mt-1 text-xs font-bold ${message.ok ? "text-emerald-700" : "text-red-700"}`}
                          >
                            {message.text}
                          </p>
                        )}
                      </td>
                      <td className="p-5">
                        <span className="font-mono font-bold text-slate-700">
                          {u.clinicId || "—"}
                        </span>
                      </td>
                      <td className="p-5">
                        <Badge tone={STATUS_BADGE[status] || STATUS_BADGE.approved}>
                          {status}
                        </Badge>
                      </td>
                      <td className="p-5 text-right">
                        {/* Reversing a decision is deliberately possible: a
                            rejection can be a mistake, and the alternative is
                            an account permanently stranded. */}
                        {status === "approved" ? (
                          <button
                            onClick={() => decide(u, "rejected")}
                            disabled={busyId === u.id}
                            className="text-red-700 font-black text-sm hover:underline disabled:opacity-60"
                          >
                            Revoke access
                          </button>
                        ) : (
                          <button
                            onClick={() => decide(u, "approved")}
                            disabled={busyId === u.id}
                            className="text-emerald-700 font-black text-sm hover:underline flex items-center gap-1.5 ml-auto disabled:opacity-60"
                          >
                            <RotateCcw size={13} /> Approve instead
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>

      <p className="text-xs font-bold text-slate-400">
        Every decision here is recorded in the audit log.
      </p>
    </div>
  );
}
