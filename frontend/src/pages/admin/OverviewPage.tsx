// Admin overview: how the deployment is shaped, and what needs attention.
//
// Every figure is computed from the accounts and clinics the layout loaded —
// nothing is hardcoded, and a value that cannot be computed renders as an
// explicit empty state rather than a misleading zero.

import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  UserCheck,
  Clock,
  Building2,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { useAdminData } from "./useAdminData";
import { DistributionBars, PanelCard, SkeletonRows } from "./shared";
import { StatTile } from "../../components/ui/StatTile";
import { ROLE_TONE, statusOf, titleCase } from "./constants";

export default function AdminOverviewPage() {
  const { users, clinics, loading } = useAdminData();

  // Admins are excluded from the account totals: they are not managed through
  // this panel, so counting them would overstate what the lists below show.
  const managed = useMemo(() => users.filter((u) => u.role !== "admin"), [users]);

  const stats = useMemo(
    () => ({
      total: managed.length,
      doctors: managed.filter((u) => u.role === "doctor").length,
      patients: managed.filter((u) => u.role === "patient").length,
      pending: users.filter((u) => u.role === "doctor" && statusOf(u) === "pending")
        .length,
    }),
    [managed, users],
  );

  const byRole = useMemo(
    () =>
      (["patient", "doctor", "admin"] as const).map((r) => ({
        label: titleCase(r) + "s",
        count: users.filter((u) => u.role === r).length,
        tone: ROLE_TONE[r],
      })),
    [users],
  );

  const byClinic = useMemo(() => {
    const tally = new Map<string, number>();
    for (const u of users) {
      if (!u.clinicId) continue;
      tally.set(u.clinicId, (tally.get(u.clinicId) || 0) + 1);
    }
    return [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({
        label,
        count,
        tone: "bg-gradient-to-r from-slate-400 to-slate-500",
      }));
  }, [users]);

  const clinicIds = useMemo(() => {
    const set = new Set<string>();
    for (const u of users) if (u.clinicId) set.add(u.clinicId);
    return set.size;
  }, [users]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Accounts"
          value={stats.total}
          icon={<Users size={22} />}
          tone="bg-purple-100 text-purple-600"
          loading={loading}
        />
        <StatTile
          label="Practitioners"
          value={stats.doctors}
          icon={<UserCheck size={22} />}
          tone="bg-blue-100 text-blue-600"
          loading={loading}
        />
        <StatTile
          label="Patients"
          value={stats.patients}
          icon={<Users size={22} />}
          tone="bg-emerald-100 text-emerald-600"
          loading={loading}
        />
        <StatTile
          label="Clinics in use"
          value={clinicIds}
          icon={<Building2 size={22} />}
          tone="bg-slate-100 text-slate-600"
          loading={loading}
        />
      </div>

      {/* The one thing that is a task rather than a figure: someone is waiting. */}
      {!loading && stats.pending > 0 && (
        <Link
          to="/admin/approvals"
          className="flex items-center gap-4 bg-amber-50 border-2 border-amber-200 rounded-[2rem] p-6 hover:border-amber-300 transition-colors"
        >
          <Clock className="text-amber-600" size={24} />
          <div className="flex-1">
            <p className="font-black text-amber-900">
              {stats.pending} practitioner{stats.pending === 1 ? "" : "s"} awaiting
              approval
            </p>
            <p className="text-amber-700 font-medium text-sm">
              They cannot access clinic data until a decision is recorded.
            </p>
          </div>
          <ArrowRight className="text-amber-600" size={20} />
        </Link>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <PanelCard title="Accounts by role" icon={<Users className="text-purple-500" size={22} />}>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : (
            <div className="p-8 pt-6">
              <DistributionBars rows={byRole} emptyLabel="No accounts yet." />
            </div>
          )}
        </PanelCard>

        <PanelCard
          title="Accounts by clinic"
          icon={<Building2 className="text-slate-500" size={22} />}
        >
          {loading ? (
            <SkeletonRows rows={3} />
          ) : (
            <div className="p-8 pt-6">
              <DistributionBars rows={byClinic} emptyLabel="No accounts yet." />
              {clinicIds > byClinic.length && (
                <p className="text-xs font-bold text-slate-400 mt-4">
                  Showing the {byClinic.length} largest of {clinicIds} clinics.
                </p>
              )}
            </div>
          )}
        </PanelCard>
      </div>

      {!loading && clinics.length > 0 && (
        <PanelCard
          title="Clinics with recorded details"
          icon={<Building2 className="text-slate-500" size={22} />}
        >
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clinics.map((c) => (
              <div key={c.id} className="border border-slate-200 rounded-2xl p-5">
                <p className="font-black text-slate-900 truncate">
                  {c.name || "Unnamed clinic"}
                </p>
                <p className="font-mono text-xs font-bold text-slate-400 tracking-widest">
                  {c.id}
                </p>
                {c.city && (
                  <p className="text-xs font-semibold text-slate-500 mt-2">{c.city}</p>
                )}
              </div>
            ))}
          </div>
        </PanelCard>
      )}

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
    </div>
  );
}
