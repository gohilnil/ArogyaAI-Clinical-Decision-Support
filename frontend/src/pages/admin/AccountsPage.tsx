// The unified account workspace.
//
// This replaces the two near-identical tables the panel used to render. It is
// one table with real controls — search, role/status/clinic filters, sortable
// columns, pagination — because an operator's question is "find this account",
// and the answer should not depend on guessing which table it lives in.
//
// Admins appear here too, and are the ONE case where the clinic field is not
// required: an operator works across every clinic and belongs to none.

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Search,
  X,
  Save,
  Users,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import { adminUpdateUser, type UserDataWithId } from "../../services/firestore";
import { useAdminData } from "./useAdminData";
import { Badge, EmptyState, PanelCard, SkeletonRows } from "./shared";
import {
  ROLE_BADGE,
  ROLES,
  STATUS_BADGE,
  STATUSES,
  field,
  statusOf,
  titleCase,
} from "./constants";

const PAGE_SIZE = 12;

type SortKey = "email" | "role" | "clinicId" | "status";

export default function AdminAccountsPage() {
  const { users, loading, actor, applyUserChange } = useAdminData();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clinicFilter, setClinicFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("email");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ role: string; clinicId: string; status: string }>({
    role: "patient",
    clinicId: "",
    status: "approved",
  });
  const [saving, setSaving] = useState(false);
  const [rowMessage, setRowMessage] = useState<{
    id: string;
    ok: boolean;
    text: string;
  } | null>(null);

  const clinicOptions = useMemo(() => {
    const set = new Set<string>();
    for (const u of users) if (u.clinicId) set.add(u.clinicId);
    return [...set].sort();
  }, [users]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = (u: UserDataWithId) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && statusOf(u) !== statusFilter) return false;
      if (clinicFilter !== "all" && (u.clinicId || "") !== clinicFilter) return false;
      if (!term) return true;
      return [u.email, u.clinicId, u.role, statusOf(u), u.id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    };
    const list = users.filter(matches);
    const dir = sortAsc ? 1 : -1;
    list.sort((a, b) => {
      // Pending doctors first regardless of sort: the rows needing a decision
      // are the ones an operator should not have to hunt for.
      const pa = a.role === "doctor" && statusOf(a) === "pending" ? 0 : 1;
      const pb = b.role === "doctor" && statusOf(b) === "pending" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const av =
        sortKey === "status" ? statusOf(a) : String(a[sortKey] || "");
      const bv =
        sortKey === "status" ? statusOf(b) : String(b[sortKey] || "");
      return av.localeCompare(bv) * dir;
    });
    return list;
  }, [users, search, roleFilter, statusFilter, clinicFilter, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => {
    // A filter change can leave the view past the last page; clamp rather than
    // render an empty table that looks like "no results".
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const startEdit = (u: UserDataWithId) => {
    setEditingId(u.id);
    // An admin's clinic is seeded EMPTY, never with any stale value the
    // document may still carry from before it was promoted. Seeding it would
    // re-assert a tenancy the role does not have, and the rules would reject
    // the save.
    setDraft({
      role: u.role,
      clinicId: u.role === "admin" ? "" : u.clinicId || "",
      status: statusOf(u),
    });
    setRowMessage(null);
  };

  const saveEdit = async (u: UserDataWithId) => {
    const role = draft.role;
    const clinic = draft.clinicId.trim().toUpperCase();

    // Clinic is required for every role EXCEPT admin — the same rule the
    // database enforces. Validating here just gives a clearer message.
    if (role !== "admin" && clinic.length !== 6) {
      setRowMessage({
        id: u.id,
        ok: false,
        text: "Clinic ID must be exactly 6 characters for a patient or practitioner.",
      });
      return;
    }

    // An administrator carries NO clinic and NO patient link. Both are tenancy
    // facts belonging to the patient/doctor roles, and the rules refuse an
    // admin document that holds either. Sending null removes the key entirely
    // (deleteField), which is the honest shape for "belongs to no clinic" — an
    // empty string would leave a field that still exists and asserts nothing.
    //
    // A stale patient link is cleared alongside the clinic for the same reason:
    // promoting a linked patient to admin must not leave the record attached to
    // an operator account that cannot read it.
    const isAdminRole = role === "admin";
    const clinicValue: string | null = isAdminRole ? null : clinic;
    // undefined = "do not touch this field" (a doctor keeps no link, and a
    // patient's link must survive an unrelated edit such as a clinic fix).
    const patientValue: string | null | undefined = isAdminRole ? null : undefined;

    setSaving(true);
    try {
      await adminUpdateUser(
        u.id,
        {
          role,
          clinicId: clinicValue,
          patientId: patientValue,
          status: draft.status as "approved" | "pending" | "rejected",
        },
        actor,
        {
          targetLabel: u.email || u.id,
          before: {
            role: u.role,
            clinicId: u.clinicId || "(none)",
            status: statusOf(u),
          },
        },
      );
      applyUserChange(u.id, {
        role,
        clinicId: isAdminRole ? undefined : clinic,
        patientId: isAdminRole ? undefined : u.patientId,
        status: draft.status as "approved" | "pending" | "rejected",
      });
      setEditingId(null);
      setRowMessage({
        id: u.id,
        ok: true,
        text: isAdminRole
          ? "Account is now an administrator. Its clinic and health-record link were cleared."
          : "Account updated.",
      });
    } catch (e) {
      console.error("Admin update failed:", e);
      setRowMessage({
        id: u.id,
        ok: false,
        text: "Could not update the account. Check the clinic is valid for the role.",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
    setClinicFilter("all");
  };

  const anyFilter =
    Boolean(search) ||
    roleFilter !== "all" ||
    statusFilter !== "all" ||
    clinicFilter !== "all";

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-sm p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="relative flex-1">
            <Search
              size={17}
              className="absolute left-3.5 top-3.5 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Search accounts"
              placeholder="Search email, clinic, role, status or id..."
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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Role
            </span>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className={field}
            >
              <option value="all">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {titleCase(r)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Status
            </span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className={field}
            >
              <option value="all">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Clinic
            </span>
            <select
              value={clinicFilter}
              onChange={(e) => {
                setClinicFilter(e.target.value);
                setPage(1);
              }}
              className={field}
            >
              <option value="all">All clinics</option>
              {clinicOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="">No clinic (admin)</option>
            </select>
          </label>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs font-black text-slate-500">
            {filtered.length} account{filtered.length === 1 ? "" : "s"}
            {anyFilter ? " match" : ""}
          </p>
          {anyFilter && (
            <button
              onClick={clearFilters}
              className="text-xs font-black text-purple-700 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <PanelCard title="All accounts" icon={<Users className="text-purple-500" size={22} />}>
        {loading ? (
          <SkeletonRows rows={5} />
        ) : pageRows.length === 0 ? (
          <EmptyState
            icon={<Users size={40} />}
            title={anyFilter ? "No accounts match those filters." : "No accounts yet."}
            hint={
              anyFilter
                ? "Adjust the search or filters above."
                : "Accounts appear here as people register."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[860px]">
              <thead className="bg-slate-50 border-b border-slate-200/60">
                <tr>
                  <Th onClick={() => toggleSort("email")} active={sortKey === "email"}>
                    Account
                  </Th>
                  <Th onClick={() => toggleSort("role")} active={sortKey === "role"}>
                    Role
                  </Th>
                  <Th onClick={() => toggleSort("clinicId")} active={sortKey === "clinicId"}>
                    Clinic
                  </Th>
                  <Th onClick={() => toggleSort("status")} active={sortKey === "status"}>
                    Status
                  </Th>
                  <th className="p-5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((u) => {
                  const editing = editingId === u.id;
                  const status = statusOf(u);
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60 align-top">
                      <td className="p-5">
                        <p className="font-black text-slate-900">
                          {u.email || "(no email)"}
                        </p>
                        {u.patientId && (
                          <p className="text-xs font-bold text-emerald-700 mt-0.5">
                            Linked to a health record
                          </p>
                        )}
                        {rowMessage?.id === u.id && (
                          <p
                            className={`mt-2 text-xs font-bold ${rowMessage.ok ? "text-emerald-700" : "text-red-700"}`}
                          >
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
                                {titleCase(r)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge tone={`border-transparent ${ROLE_BADGE[u.role] || "bg-slate-100 text-slate-600"}`}>
                            {u.role}
                          </Badge>
                        )}
                      </td>

                      <td className="p-5">
                        {editing ? (
                          draft.role === "admin" ? (
                            // An admin has no clinic at all, so there is nothing
                            // to edit here. Showing a disabled box states that
                            // plainly rather than offering a field the rules
                            // will reject.
                            <span className="text-xs font-bold text-slate-400">
                              Not applicable
                            </span>
                          ) : (
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
                          )
                        ) : u.role === "admin" ? (
                          // An admin is authoritative as "no clinic" whatever
                          // the document holds: a legacy row can still carry a
                          // stale value from before the role split, and showing
                          // it would suggest a tenancy that does not exist.
                          <span className="text-xs font-black uppercase tracking-wide text-purple-700 bg-purple-100 px-2.5 py-1 rounded-full">
                            All clinics
                          </span>
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
                                {titleCase(s)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge tone={STATUS_BADGE[status] || STATUS_BADGE.approved}>
                            {status}
                          </Badge>
                        )}
                      </td>

                      <td className="p-5 text-right">
                        {editing ? (
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => saveEdit(u)}
                              disabled={saving}
                              className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-black text-sm flex items-center gap-1.5 hover:bg-emerald-700 disabled:opacity-60"
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

        {!loading && filtered.length > PAGE_SIZE && (
          <div className="p-5 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs font-black text-slate-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-xl border-2 border-slate-200 font-black text-sm disabled:opacity-40 flex items-center gap-1.5 hover:border-purple-300"
              >
                <ChevronLeft size={15} /> Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 rounded-xl border-2 border-slate-200 font-black text-sm disabled:opacity-40 flex items-center gap-1.5 hover:border-purple-300"
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </PanelCard>

      <div className="flex items-start gap-3 text-xs font-bold text-slate-400">
        <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
        <p className="max-w-3xl">
          Changing a role or clinic is recorded in the audit log. An
          administrator's account carries no clinic — an operator works across
          every clinic and belongs to none — which is why the clinic field is
          optional for that role and required for the others.
        </p>
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <th scope="col" className="p-0">
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-1.5 p-5 font-black text-xs uppercase tracking-widest text-left hover:text-slate-700 ${active ? "text-purple-600" : "text-slate-400"}`}
      >
        {children}
        <ArrowUpDown size={12} className={active ? "opacity-100" : "opacity-40"} />
      </button>
    </th>
  );
}
