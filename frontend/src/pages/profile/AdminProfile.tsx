import type { User as FirebaseUser } from "firebase/auth";
import { Shield } from "lucide-react";
import { SectionCard } from "../../components/ui/SectionCard";
import type { UserData } from "../../types";

/**
 * An administrator's own account, shown read-only.
 *
 * There is deliberately nothing to EDIT here. Role and email are fixed by the
 * rules, an operator cannot be created or promoted from the client, and the
 * clinic field that used to live on this page described a tenancy that does not
 * exist — an operator belongs to no clinic. Account management happens in the
 * admin panel, not on one's own profile.
 */
export default function AdminProfile({
  user,
}: {
  user: FirebaseUser | null;
  userData: UserData | null;
}) {
  const label = "text-xs font-black uppercase tracking-widest text-slate-400";

  return (
    <div className="space-y-6">
      <div className="bg-purple-50 border border-purple-200 p-6 rounded-2xl">
        <h4 className="font-black text-purple-900 flex items-center gap-2 mb-1">
          <Shield size={20} /> Platform Administrator
        </h4>
        <p className="text-purple-800 text-sm font-medium leading-relaxed">
          You manage accounts and onboarding across every clinic. Clinical
          records are not visible to this role by design — patients, assessments
          and diaries stay under clinic control.
        </p>
      </div>

      <SectionCard
        title="Your account"
        icon={<Shield size={22} />}
        iconTone="bg-purple-100 text-purple-600"
      >
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <dt className={label}>Email</dt>
            <dd className="font-bold text-slate-700 break-words">
              {user?.email || "—"}
            </dd>
          </div>
          <div>
            <dt className={label}>Role</dt>
            <dd className="font-bold text-slate-700">Platform administrator</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className={label}>Scope</dt>
            <dd className="font-bold text-slate-700">
              All clinics. This account is not filed under a clinic — an operator
              belongs to none.
            </dd>
          </div>
        </dl>
      </SectionCard>
    </div>
  );
}
