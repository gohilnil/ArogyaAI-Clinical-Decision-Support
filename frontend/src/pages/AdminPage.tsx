import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Ticket,
  ShieldAlert,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Search,
  X,
  Building,
  Save,
} from "lucide-react";
import {
  adminRevokeInvite,
  adminUpdateUser,
  listAllInvites,
  listAllUsers,
  type InviteRecord,
  type UserDataWithId,
} from "../services/firestore";
import type { UserData } from "../types";

const ROLES = ["patient", "doctor", "admin"] as const;

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700 border-purple-200",
  doctor: "bg-blue-100 text-blue-700 border-blue-200",
  patient: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

// --- ADMIN PANEL ---
// Platform operators manage ACCOUNTS and ONBOARDING: who exists, which clinic
// they belong to, which invites are live. The panel deliberately has nothing
// to say about clinical data — the rules deny an admin any read on patients,
// assessments or diaries, which is the separation of duties that keeps
// "can provision an account" from becoming "can see a patient's history".
export default function AdminPanel({ userData }: { userData: UserData | null }) {
  const [users, setUsers] = useState<UserDataWithId[]>([]);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [search, setSearch] = useState("");
  // Which account row is being edited, and its pending changes.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ role: string; clinicId: string }>({
    role: "patient",
    clinicId: "",
  });
  const [rowMessage, setRowMessage] = useState<{ id: string; ok: boolean; text: string } | null>(
    null,
  );
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [us, inv] = await Promise.all([listAllUsers(), listAllInvites()]);
        if (cancelled) return;
        setUsers(us);
        setInvites(inv);
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

  const visibleUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) =>
      [u.email, u.role, u.clinicId]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [users, search]);

  const stats = useMemo(
    () => ({
      total: users.length,
      doctors: users.filter((u) => u.role === "doctor").length,
      patients: users.filter((u) => u.role === "patient").length,
      unusedInvites: invites.filter((i) => !i.used).length,
    }),
    [users, invites],
  );

  const startEdit = (u: UserDataWithId) => {
    setEditingId(u.id);
    setDraft({ role: u.role, clinicId: u.clinicId || "" });
    setRowMessage(null);
  };

  const saveEdit = async (u: UserDataWithId) => {
    const clinic = draft.clinicId.trim().toUpperCase();
    if (clinic.length !== 6) {
      setRowMessage({ id: u.id, ok: false, text: "Clinic ID must be exactly 6 characters." });
      return;
    }
    try {
      await adminUpdateUser(u.id, { role: draft.role, clinicId: clinic });
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, role: draft.role, clinicId: clinic } : x)),
      );
      setEditingId(null);
      setRowMessage({ id: u.id, ok: true, text: "Account updated." });
    } catch (e) {
      console.error("Admin update failed:", e);
      setRowMessage({
        id: u.id,
        ok: false,
        text: "Could not update the account. The clinic must be 6 characters and a patient's record must belong to the clinic.",
      });
    }
  };

  const revoke = async (code: string) => {
    setRevoking(code);
    try {
      await adminRevokeInvite(code);
      setInvites((prev) => prev.filter((i) => i.code !== code));
    } catch (e) {
      console.error("Revoke failed:", e);
      setError("Could not revoke that invite.");
    } finally {
      setRevoking(null);
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
          ["Practitioners", stats.doctors, Building, "bg-blue-100 text-blue-600"],
          ["Patients", stats.patients, Users, "bg-emerald-100 text-emerald-600"],
          ["Unused invites", stats.unusedInvites, Ticket, "bg-orange-100 text-orange-600"],
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
              placeholder="Search email, role or clinic…"
              className="pl-10 pr-9 py-2.5 rounded-xl border-2 border-slate-200 focus:border-purple-400 outline-none font-bold text-sm w-full sm:w-72"
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
            <table className="w-full text-left min-w-[820px]">
              <thead className="bg-slate-50 border-b border-slate-200/60">
                <tr>
                  {["Account", "Role", "Clinic", ""].map((h) => (
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

      {/* Invites ----------------------------------------------------------- */}
      <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <Ticket className="text-orange-500" size={22} />
          <h2 className="text-xl font-black text-slate-950">Invites</h2>
        </div>
        {invites.length === 0 && !loading ? (
          <div className="p-12 text-center">
            <Ticket size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-600 font-black">No invites exist.</p>
            <p className="text-slate-400 font-medium text-sm mt-1">
              Practitioners issue their own from the Clinic Profile page.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[640px]">
              <thead className="bg-slate-50 border-b border-slate-200/60">
                <tr>
                  {["Code", "Clinic", "Status", ""].map((h) => (
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
                {invites.map((inv) => (
                  <tr key={inv.code} className="hover:bg-slate-50/60">
                    <td className="p-5 font-mono font-bold text-slate-900 text-sm">
                      {inv.code}
                    </td>
                    <td className="p-5">
                      <span className="font-mono font-bold text-slate-700 flex items-center gap-1.5">
                        <Building size={14} className="text-slate-400" /> {inv.clinicId}
                      </span>
                    </td>
                    <td className="p-5">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-black border uppercase tracking-wide ${inv.used ? "bg-slate-100 text-slate-500 border-slate-200" : "bg-emerald-100 text-emerald-700 border-emerald-200"}`}
                      >
                        {inv.used ? "Used" : "Unused"}
                      </span>
                    </td>
                    <td className="p-5 text-right">
                      {!inv.used ? (
                        <button
                          onClick={() => revoke(inv.code)}
                          disabled={revoking === inv.code}
                          className="text-red-600 font-black text-sm hover:underline flex items-center gap-1.5 ml-auto disabled:opacity-50"
                          title="Revoke this unused invite"
                        >
                          <Trash2 size={15} />
                          {revoking === inv.code ? "Revoking…" : "Revoke"}
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-slate-400">
                          retained for audit
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-slate-950 rounded-[2rem] p-8 text-white">
        <ShieldAlert className="text-purple-400 mb-3" size={24} />
        <h2 className="font-black text-lg mb-2">Scope of this panel</h2>
        <p className="text-slate-400 font-medium text-sm leading-relaxed max-w-3xl">
          Admins manage accounts: correct a role or clinic, revoke an unused
          invite, and audit what exists. Admins have{" "}
          <strong className="text-slate-200">no access to clinical data</strong> —
          patients, assessments and diaries remain governed by clinic rules and
          are invisible here by design. Provisioning a new admin is done
          out-of-band (Firebase console), never from this panel, so a compromised
          client cannot mint an operator account.
        </p>
      </div>
    </motion.div>
  );
}
