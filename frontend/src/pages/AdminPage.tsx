import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  ShieldAlert,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Search,
  X,
  Building,
  Save,
  UserCheck,
  UserX,
  Clock,
  XCircle,
} from "lucide-react";
import {
  adminUpdateUser,
  listAllUsers,
  setDoctorStatus,
  type UserDataWithId,
} from "../services/firestore";
import type { UserData } from "../types";

const ROLES = ["patient", "doctor", "admin"] as const;
const STATUSES = ["approved", "pending", "rejected"] as const;

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700 border-purple-200",
  doctor: "bg-blue-100 text-blue-700 border-blue-200",
  patient: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const STATUS_BADGE: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

/** An account's approval state. Absent = approved (accounts predate the field). */
const statusOf = (u: UserDataWithId) => u.status || "approved";

/**
 * A single bar in a small distribution chart.
 *
 * Drawn with divs rather than a charting library on purpose: the dataset is a
 * handful of categories, a library would add ~100 kB to a clinical tool's
 * bundle, and the visual language already used on the clinic dashboard is a
 * labelled bar. Bars are scaled against the largest value so relative weight
 * reads correctly, and the count is always printed, so the chart never depends
 * on colour or length alone.
 */
function DistributionBars({
  rows,
  emptyLabel,
}: {
  rows: { label: string; count: number; tone: string }[];
  emptyLabel: string;
}) {
  const peak = rows.reduce((m, r) => Math.max(m, r.count), 0);
  if (rows.length === 0 || peak === 0) {
    return (
      <p className="text-slate-400 font-bold text-sm py-4">{emptyLabel}</p>
    );
  }
  return (
    <div className="space-y-3.5">
      {rows.map((r, i) => (
        <div key={r.label}>
          <div className="flex justify-between text-sm font-bold text-slate-700 mb-1.5">
            <span className="truncate">{r.label}</span>
            <span className="text-slate-400 tabular-nums">{r.count}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(r.count / peak) * 100}%` }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className={`h-2.5 rounded-full ${r.tone}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// --- ADMIN PANEL ---
// Platform operators manage ACCOUNTS and ONBOARDING: who exists, which clinic
// they belong to, and who is approved to practise. The panel deliberately has
// nothing to say about clinical data — the rules deny an admin any read on
// patients, assessments or diaries, which is the separation of duties that
// keeps "can provision an account" from becoming "can see a patient's history".
export default function AdminPanel({ userData }: { userData: UserData | null }) {
  const [users, setUsers] = useState<UserDataWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ role: string; clinicId: string; status: string }>(
    { role: "patient", clinicId: "", status: "approved" },
  );
  const [rowMessage, setRowMessage] = useState<{ id: string; ok: boolean; text: string } | null>(
    null,
  );
  const [deciding, setDeciding] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const us = await listAllUsers();
        if (cancelled) return;
        setUsers(us);
      } catch (e) {
        if (cancelled) return;
        console.error("Error loading admin data:", e);
        setError("Could not load accounts. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const pending = useMemo(
    () => users.filter((u) => u.role === "doctor" && statusOf(u) === "pending"),
    [users],
  );

  const stats = useMemo(
    () => ({
      total: users.length,
      doctors: users.filter((u) => u.role === "doctor").length,
      patients: users.filter((u) => u.role === "patient").length,
      pending: pending.length,
    }),
    [users, pending],
  );

  const byRole = useMemo(() => {
    const order = ["patient", "doctor", "admin"] as const;
    const tones: Record<string, string> = {
      patient: "bg-gradient-to-r from-emerald-400 to-teal-500",
      doctor: "bg-gradient-to-r from-blue-400 to-indigo-500",
      admin: "bg-gradient-to-r from-purple-400 to-fuchsia-500",
    };
    return order.map((r) => ({
      label: r.charAt(0).toUpperCase() + r.slice(1) + "s",
      count: users.filter((u) => u.role === r).length,
      tone: tones[r],
    }));
  }, [users]);

  const byClinic = useMemo(() => {
    const tally = new Map<string, number>();
    for (const u of users) {
      const key = u.clinicId || "No clinic";
      tally.set(key, (tally.get(key) || 0) + 1);
    }
    return [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({
        label,
        count,
        tone: "bg-gradient-to-r from-slate-400 to-slate-500",
      }));
  }, [users]);

  const visibleUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) =>
      [u.email, u.role, u.clinicId, statusOf(u)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [users, search]);

  const startEdit = (u: UserDataWithId) => {
    setEditingId(u.id);
    setDraft({ role: u.role, clinicId: u.clinicId || "", status: statusOf(u) });
    setRowMessage(null);
  };

  const saveEdit = async (u: UserDataWithId) => {
    const clinic = draft.clinicId.trim().toUpperCase();
    if (clinic.length !== 6) {
      setRowMessage({ id: u.id, ok: false, text: "Clinic ID must be exactly 6 characters." });
      return;
    }
    try {
      await adminUpdateUser(u.id, {
        role: draft.role,
        clinicId: clinic,
        status: draft.status as "approved" | "pending" | "rejected",
      });
      setUsers((prev) =>
        prev.map((x) =>
          x.id === u.id
            ? {
                ...x,
                role: draft.role,
                clinicId: clinic,
                status: draft.status as "approved" | "pending" | "rejected",
              }
            : x,
        ),
      );
      setEditingId(null);
      setRowMessage({ id: u.id, ok: true, text: "Account updated." });
    } catch (e) {
      console.error("Admin update failed:", e);
      setRowMessage({
        id: u.id,
        ok: false,
        text: "Could not update the account. Check the clinic is 6 characters and any linked record belongs to that clinic.",
      });
    }
  };

  /** Approve or reject from the queue, without entering the edit form. */
  const decide = async (u: UserDataWithId, status: "approved" | "rejected") => {
    setDeciding(u.id);
    try {
      await setDoctorStatus(u.id, status);
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, status } : x)),
      );
      setRowMessage({
        id: u.id,
        ok: status === "approved",
        text: status === "approved" ? "Approved. The practitioner now has access." : "Rejected. The account cannot access clinic data.",
      });
    } catch (e) {
      console.error("Decision failed:", e);
      setRowMessage({ id: u.id, ok: false, text: "Could not record that decision." });
    } finally {
      setDeciding(null);
    }
  };

  const field =
    "p-3 rounded-xl border-2 border-slate-200 focus:border-emerald-500 outline-none font-bold text-sm";

  if (userData?.role !== "admin") {
    return (
      <div className="max-w-4xl mx-auto p-10">
        <div className="p-6 bg-red-100 text-red-700 font-bold rounded-2xl flex items-center gap-3">
          <ShieldAlert size={22} /> You do not have access to the admin panel.
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-8 p-6 md:p-10"
    >
      <div>
        <h1 className="text-4xl font-black text-slate-950 tracking-tighter mb-2">
          Admin Panel
        </h1>
        <p className="text-slate-500 font-medium text-lg">
          Accounts and onboarding. Clinical records stay under clinic control —
          this panel cannot read them.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          ["Accounts", stats.total, Users, "bg-purple-100 text-purple-600"],
          ["Practitioners", stats.doctors, UserCheck, "bg-blue-100 text-blue-600"],
          ["Patients", stats.patients, Users, "bg-emerald-100 text-emerald-600"],
          ["Awaiting approval", stats.pending, Clock, "bg-amber-100 text-amber-600"],
        ] as const).map(([label, value, Icon, tone]) => (
          <div
            key={label}
            className="bg-white p-6 rounded-[1.75rem] border border-slate-200/60 shadow-sm flex items-center gap-4"
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${tone}`}>
              <Icon size={22} />
            </div>
            <div>
              <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">
                {label}
              </p>
              <p className="text-3xl font-black text-slate-950 leading-tight">
                {loading ? "…" : value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="p-6 bg-red-100 text-red-700 rounded-2xl flex items-center gap-4">
          <AlertCircle size={20} />
          <p className="font-black flex-1">{error}</p>
          <button
            onClick={() => setReloadToken((n) => n + 1)}
            disabled={loading}
            className="bg-red-700 text-white px-5 py-2.5 rounded-xl font-black text-sm disabled:opacity-60 flex items-center gap-2"
          >
            <RefreshCw size={15} /> {loading ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {/* Approval queue — the onboarding step that replaced invites. Shown only
          when someone is actually waiting, so it is a task list, not furniture. */}
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
                    <Building size={12} /> Clinic {u.clinicId}
                  </p>
                  {rowMessage?.id === u.id && (
                    <p
                      className={`mt-2 text-xs font-bold flex items-center gap-1 ${rowMessage.ok ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {rowMessage.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                      {rowMessage.text}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => decide(u, "approved")}
                    disabled={deciding === u.id}
                    className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <UserCheck size={16} /> Approve
                  </button>
                  <button
                    onClick={() => decide(u, "rejected")}
                    disabled={deciding === u.id}
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

      {/* Two distributions. Small, labelled, count always printed — enough to
          answer "how is this deployment shaped" without a charting library. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white p-8 rounded-[2rem] border border-slate-200/60 shadow-sm">
          <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
            <Users className="text-purple-500" size={22} />
            <h2 className="text-lg font-black text-slate-950">Accounts by role</h2>
          </div>
          {loading ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <DistributionBars rows={byRole} emptyLabel="No accounts yet." />
          )}
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-200/60 shadow-sm">
          <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
            <Building className="text-slate-500" size={22} />
            <h2 className="text-lg font-black text-slate-950">Accounts by clinic</h2>
          </div>
          {loading ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <DistributionBars rows={byClinic} emptyLabel="No accounts yet." />
          )}
        </div>
      </div>

      {/* Accounts ---------------------------------------------------------- */}
      <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <Users className="text-purple-500" size={22} />
            <h2 className="text-xl font-black text-slate-950">Accounts</h2>
          </div>
          <div className="relative">
            <Search size={17} className="absolute left-3.5 top-3 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search accounts"
              placeholder="Search email, role, clinic or status…"
              className="pl-10 pr-9 py-2.5 rounded-xl border-2 border-slate-200 focus:border-purple-400 outline-none font-bold text-sm w-full sm:w-80"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : visibleUsers.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-600 font-black">
              {users.length === 0 ? "No accounts yet." : "No accounts match your search."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200/60">
                <tr>
                  {["Account", "Role", "Clinic", "Status", ""].map((h) => (
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
                {visibleUsers.map((u) => {
                  const editing = editingId === u.id;
                  const status = statusOf(u);
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60">
                      <td className="p-5">
                        <p className="font-black text-slate-900">{u.email || u.id}</p>
                        <p className="text-xs font-bold text-slate-400 font-mono">{u.id}</p>
                        {rowMessage?.id === u.id && (
                          <p
                            className={`mt-2 text-xs font-bold flex items-center gap-1 ${rowMessage.ok ? "text-emerald-700" : "text-red-700"}`}
                          >
                            {rowMessage.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                            {rowMessage.text}
                          </p>
                        )}
                      </td>
                      <td className="p-5">
                        {editing ? (
                          <select
                            value={draft.role}
                            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                            aria-label={`Role for ${u.email}`}
                            className={field}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-black border uppercase tracking-wide ${ROLE_BADGE[u.role] || "bg-slate-100 text-slate-600 border-slate-200"}`}
                          >
                            {u.role}
                          </span>
                        )}
                      </td>
                      <td className="p-5">
                        {editing ? (
                          <input
                            type="text"
                            value={draft.clinicId}
                            maxLength={6}
                            onChange={(e) =>
                              setDraft({ ...draft, clinicId: e.target.value.toUpperCase() })
                            }
                            aria-label={`Clinic ID for ${u.email}`}
                            className={`${field} w-28 font-mono tracking-widest`}
                          />
                        ) : (
                          <span className="font-mono font-bold text-slate-700">
                            {u.clinicId || "—"}
                          </span>
                        )}
                      </td>
                      <td className="p-5">
                        {editing ? (
                          <select
                            value={draft.status}
                            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                            aria-label={`Status for ${u.email}`}
                            className={field}
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-black border uppercase tracking-wide ${STATUS_BADGE[status] || STATUS_BADGE.approved}`}
                          >
                            {status}
                          </span>
                        )}
                      </td>
                      <td className="p-5 text-right">
                        {editing ? (
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => saveEdit(u)}
                              className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-black text-sm flex items-center gap-1.5 hover:bg-emerald-700"
                            >
                              <Save size={15} /> Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(null);
                                setRowMessage(null);
                              }}
                              className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl font-black text-sm hover:bg-slate-200"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(u)}
                            className="text-purple-700 font-black text-sm hover:underline"
                          >
                            Edit
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
      </div>

      <div className="bg-slate-950 rounded-[2rem] p-8 text-white">
        <ShieldAlert className="text-purple-400 mb-3" size={24} />
        <h2 className="font-black text-lg mb-2">Scope of this panel</h2>
        <p className="text-slate-400 font-medium text-sm leading-relaxed max-w-3xl">
          Admins manage accounts: approve or reject practitioners, correct a role
          or clinic, and audit what exists. Admins have{" "}
          <strong className="text-slate-200">no access to clinical data</strong> —
          patients, assessments and diaries remain governed by clinic rules and
          are invisible here by design. Provisioning a new admin is done
          out-of-band (Firebase console), never from this panel, so a compromised
          client cannot mint an operator account.
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs font-bold text-slate-400 justify-center pb-4">
        <XCircle size={13} />
        Showing {visibleUsers.length} of {users.length} accounts
      </div>
    </motion.div>
  );
}
