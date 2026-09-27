import { motion } from "framer-motion";
import type { User as FirebaseUser } from "firebase/auth";
import type { UserData } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import PatientProfile from "./profile/PatientProfile";
import DoctorProfile from "./profile/DoctorProfile";
import AdminProfile from "./profile/AdminProfile";

/**
 * Account settings, dispatched by role.
 *
 * This was one ~950-line component holding all three roles' controls in
 * sequence, so a patient scrolled past a clinic form that did not apply and a
 * practitioner past a patient-code box they never use. Each role's settings now
 * live in their own file; this page owns only the frame and the role choice.
 * The doctor and admin experiences are behaviourally unchanged.
 */
export default function ProfileSettings({
  user,
  userData,
}: {
  user: FirebaseUser | null;
  userData: UserData | null;
}) {
  const role = userData?.role;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-8 p-6 md:p-10"
    >
      <PageHeader
        title="Account Settings"
        subtitle={
          role === "patient"
            ? "Your health record, account and privacy."
            : role === "doctor"
              ? "Your clinic details and patient codes."
              : "Your platform administrator account."
        }
        icon={
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center font-black text-2xl flex-shrink-0">
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
        }
      />

      <div className="text-slate-500 font-medium text-sm -mt-4">
        {user?.email || "User"}
      </div>

      {role === "patient" && <PatientProfile user={user} userData={userData} />}
      {role === "doctor" && <DoctorProfile user={user} userData={userData} />}
      {role === "admin" && <AdminProfile user={user} userData={userData} />}
    </motion.div>
  );
}
