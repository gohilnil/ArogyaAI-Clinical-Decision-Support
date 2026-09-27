// The admin section's shell: an access check, a sub-navigation, and the shared
// data every admin page reads.
//
// The account and clinic collections are loaded ONCE here and handed to the
// pages through the router outlet, rather than each page re-reading them on
// mount. Two reasons: switching tabs must not refetch a whole collection, and
// an edit made on one page must be visible on the others without a reload.

import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ShieldAlert,
  LayoutDashboard,
  Users,
  UserCheck,
  Building2,
  ScrollText,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  listAllUsers,
  listClinics,
  type UserDataWithId,
} from "../../services/firestore";
import type { Clinic, UserData } from "../../types";
import { statusOf } from "./constants";
import type { AdminContextValue } from "./useAdminData";

export default function AdminLayout({
  user,
  userData,
}: {
  user: FirebaseUser | null;
  userData: UserData | null;
}) {
  const [users, setUsers] = useState<UserDataWithId[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const us = await listAllUsers();
        // Clinics are a separate read; a failure here must not hide the
        // accounts, which are the section's primary job.
        listClinics()
          .then((cs) => !cancelled && setClinics(cs))
          .catch((e) => console.error("Could not load clinic details:", e));
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

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const applyUserChange = useCallback(
    (id: string, changes: Partial<UserDataWithId>) => {
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, ...changes } : u)),
      );
    },
    [],
  );

  const pendingCount = useMemo(
    () => users.filter((u) => u.role === "doctor" && statusOf(u) === "pending").length,
    [users],
  );

  const value: AdminContextValue = useMemo(
    () => ({
      users,
      clinics,
      loading,
      error,
      reload,
      actor: { uid: user?.uid || "", email: user?.email || "" },
      applyUserChange,
    }),
    [users, clinics, loading, error, reload, user?.uid, user?.email, applyUserChange],
  );

  // The route re-checks the role even though the sidebar only offers this to an
  // admin: a URL can be typed, and the check has to live at the destination.
  if (userData?.role !== "admin") {
    return (
      <div className="max-w-4xl mx-auto p-10">
        <div className="p-6 bg-red-100 text-red-700 font-bold rounded-2xl flex items-center gap-3">
          <ShieldAlert size={22} /> You do not have access to the admin panel.
        </div>
      </div>
    );
  }

  const navItems = [
    { to: "/admin", end: true, label: "Overview", icon: <LayoutDashboard size={18} /> },
    { to: "/admin/accounts", end: false, label: "Accounts", icon: <Users size={18} /> },
    {
      to: "/admin/approvals",
      end: false,
      label: "Approvals",
      icon: <UserCheck size={18} />,
      badge: pendingCount,
    },
    { to: "/admin/clinics", end: false, label: "Clinics", icon: <Building2 size={18} /> },
    { to: "/admin/audit", end: false, label: "Audit log", icon: <ScrollText size={18} /> },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-8 p-6 md:p-10"
    >
      <div>
        <h1 className="text-4xl font-black text-slate-950 tracking-tighter mb-2">
          Admin
        </h1>
        <p className="text-slate-500 font-medium text-lg">
          Accounts, onboarding and oversight. Clinical records stay under clinic
          control — this panel cannot read them.
        </p>
      </div>

      {/* Sub-navigation. A tab bar rather than more sidebar entries: these are
          sections of one job, and a sidebar that grew by five would bury the
          portal's real navigation. */}
      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-px">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-3 -mb-px font-black text-sm border-b-2 transition-colors ${
                isActive
                  ? "border-purple-500 text-purple-700"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`
            }
          >
            {item.icon}
            {item.label}
            {item.badge ? (
              <span className="text-[11px] font-black bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                {item.badge}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>

      {error && (
        <div className="p-6 bg-red-100 text-red-700 rounded-2xl flex items-center gap-4">
          <AlertCircle size={20} />
          <p className="font-black flex-1">{error}</p>
          <button
            onClick={reload}
            disabled={loading}
            className="bg-red-700 text-white px-5 py-2.5 rounded-xl font-black text-sm disabled:opacity-60 flex items-center gap-2"
          >
            <RefreshCw size={15} /> {loading ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      <Outlet context={value} />
    </motion.div>
  );
}
