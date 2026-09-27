// The clinics directory: every clinic id in use, its recorded details, and who
// belongs to it.
//
// A clinic id appears on accounts the moment someone registers with it, but its
// DETAILS record is created separately by a practitioner. So the two can
// diverge, and the most useful thing this page does is make that visible: a
// clinic with accounts but no details is a clinic nobody has described yet.
//
// Details are read-only here on purpose. A clinic's record is owned by its own
// practitioners (see the Clinic Profile page); an operator's job is oversight,
// and an edit path that bypassed the clinic would be a different product.

import { useMemo, useState } from "react";
import {
  Building2,
  Search,
  X,
  Users,
  UserCheck,
  AlertTriangle,
  MapPin,
  Phone,
  Mail,
  FileText,
} from "lucide-react";
import { useAdminData } from "./useAdminData";
import { EmptyState, PanelCard, SkeletonRows } from "./shared";
import { statusOf } from "./constants";

export default function AdminClinicsPage() {
  const { users, clinics, loading } = useAdminData();
  const [search, setSearch] = useState("");

  const clinicById = useMemo(() => {
    const map = new Map(clinics.map((c) => [c.id, c]));
    return map;
  }, [clinics]);

  /** Every clinic id that appears on an account, with its membership counts. */
  const rows = useMemo(() => {
    const tally = new Map<
      string,
      { accounts: number; doctors: number; patients: number; pending: number }
    >();
    for (const u of users) {
      if (!u.clinicId) continue;
      const entry =
        tally.get(u.clinicId) || { accounts: 0, doctors: 0, patients: 0, pending: 0 };
      entry.accounts += 1;
      if (u.role === "doctor") {
        entry.doctors += 1;
        if (statusOf(u) === "pending") entry.pending += 1;
      }
      if (u.role === "patient") entry.patients += 1;
      tally.set(u.clinicId, entry);
    }
    // A clinic whose id is not on any account but has details recorded is still
    // real — include it, so a details record is never invisible.
    for (const c of clinics) {
      if (!tally.has(c.id)) {
        tally.set(c.id, { accounts: 0, doctors: 0, patients: 0, pending: 0 });
      }
    }
    const term = search.trim().toLowerCase();
    return [...tally.entries()]
      .map(([id, counts]) => ({ id, counts, details: clinicById.get(id) }))
      .filter(({ id, details }) => {
        if (!term) return true;
        return [id, details?.name, details?.city, details?.registrationNo]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term));
      })
      .sort((a, b) => b.counts.accounts - a.counts.accounts);
  }, [users, clinics, clinicById, search]);

  const withoutDetails = rows.filter((r) => !r.details).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-[1.75rem] border border-slate-200/60 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-slate-100 text-slate-600">
            <Building2 size={22} />
          </div>
          <div>
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">
              Clinics
            </p>
            <p className="text-3xl font-black text-slate-950 leading-tight">
              {loading ? "…" : rows.length}
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[1.75rem] border border-slate-200/60 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-emerald-100 text-emerald-600">
            <FileText size={22} />
          </div>
          <div>
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">
              Details recorded
            </p>
            <p className="text-3xl font-black text-slate-950 leading-tight">
              {loading ? "…" : clinics.length}
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[1.75rem] border border-slate-200/60 shadow-sm flex items-center gap-4 col-span-2 lg:col-span-1">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-amber-100 text-amber-600">
            <AlertTriangle size={22} />
          </div>
          <div>
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">
              Without details
            </p>
            <p className="text-3xl font-black text-slate-950 leading-tight">
              {loading ? "…" : withoutDetails}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-sm p-6">
        <div className="relative">
          <Search
            size={17}
            className="absolute left-3.5 top-3.5 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search clinics"
            placeholder="Search by id, name, city or registration..."
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

      <PanelCard
        title="Clinic directory"
        icon={<Building2 className="text-slate-500" size={22} />}
      >
        {loading ? (
          <SkeletonRows rows={3} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Building2 size={40} />}
            title={search ? "No clinics match your search." : "No clinics in use yet."}
          />
        ) : (
          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {rows.map(({ id, counts, details }) => (
              <div key={id} className="border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-slate-900 truncate">
                      {details?.name || "No details recorded"}
                    </p>
                    <p className="font-mono text-xs font-bold text-slate-400 tracking-widest">
                      {id}
                    </p>
                  </div>
                  <span className="text-xs font-black bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full flex-shrink-0">
                    {counts.accounts} account{counts.accounts === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="text-xs font-black bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                    <UserCheck size={12} /> {counts.doctors} practitioner
                    {counts.doctors === 1 ? "" : "s"}
                  </span>
                  <span className="text-xs font-black bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                    <Users size={12} /> {counts.patients} patient
                    {counts.patients === 1 ? "" : "s"}
                  </span>
                  {counts.pending > 0 && (
                    <span className="text-xs font-black bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
                      {counts.pending} awaiting approval
                    </span>
                  )}
                </div>

                {details ? (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {[
                      ["Type", details.type],
                      ["Registration", details.registrationNo],
                      ["Phone", details.phone],
                      ["Email", details.email],
                      [
                        "Address",
                        [
                          details.addressLine1,
                          details.addressLine2,
                          details.city,
                          details.state,
                          details.postalCode,
                          details.country,
                        ]
                          .filter(Boolean)
                          .join(", "),
                      ],
                    ]
                      .filter((r) => Boolean(r[1]))
                      .map((r) => (
                        <div key={String(r[0])}>
                          <dt className="font-black uppercase tracking-widest text-slate-400 text-[10px]">
                            {r[0]}
                          </dt>
                          <dd className="font-bold text-slate-700 break-words">
                            {r[1]}
                          </dd>
                        </div>
                      ))}
                  </dl>
                ) : (
                  <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    A practitioner of this clinic has not recorded its details
                    yet. The id is in use, so accounts can still register with it.
                  </p>
                )}

                {details?.notes && (
                  <p className="text-xs font-medium text-slate-500 border-t border-slate-100 pt-3">
                    {details.notes}
                  </p>
                )}

                {details && (
                  <div className="flex flex-wrap gap-3 text-[11px] font-bold text-slate-400 border-t border-slate-100 pt-3">
                    {details.city && (
                      <span className="flex items-center gap-1.5">
                        <MapPin size={12} /> {details.city}
                      </span>
                    )}
                    {details.phone && (
                      <span className="flex items-center gap-1.5">
                        <Phone size={12} /> {details.phone}
                      </span>
                    )}
                    {details.email && (
                      <span className="flex items-center gap-1.5">
                        <Mail size={12} /> {details.email}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </PanelCard>

      <p className="text-xs font-bold text-slate-400 max-w-3xl">
        Clinic details are maintained by the clinic's own practitioners. This
        directory is read-only: an operator sees the record but does not edit it,
        so a clinic's profile stays owned by the clinic.
      </p>
    </div>
  );
}
