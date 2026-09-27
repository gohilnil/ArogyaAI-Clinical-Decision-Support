import { motion } from "framer-motion";
import { AlertCircle, LogOut, Mail } from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import { signOut } from "firebase/auth";
import { auth } from "../config/firebase";

/**
 * Shown when a user is signed in but has no usable profile document.
 *
 * A `users/{uid}` document is the account's source of truth: it carries the
 * role, the clinic, and (for a patient) the record link. Without one there is
 * nothing to authenticate against, and every clinic-scoped Firestore call is
 * denied by the rules — `get()` on the caller's own profile throws, so even a
 * legitimate query fails.
 *
 * The app previously fell through to the patient portal in this state, which
 * rendered a dashboard with an empty clinic and no explanation. Registration
 * normally guarantees a profile, but a legacy account created before the rules
 * were tightened (there is a live one with `clinicId: ""`) or an account whose
 * profile write failed can still land here, so the state is rendered
 * explicitly rather than as a broken portal.
 */
export default function UnprovisionedPage({ user }: { user: FirebaseUser }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-slate-950 flex items-center justify-center p-6"
    >
      <div className="max-w-lg w-full bg-white rounded-[2rem] p-10 shadow-2xl space-y-6">
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
          <AlertCircle size={32} />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-black text-slate-950 tracking-tighter">
            Account not set up
          </h1>
          <p className="text-slate-500 font-medium">
            You are signed in as{" "}
            <strong className="text-slate-700">{user.email}</strong>, but this
            account has no clinic profile, so no patient or practitioner data can
            be shown.
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-2">
          <p className="font-bold text-slate-700 text-sm flex items-center gap-2">
            <Mail size={16} className="text-slate-400" /> How to resolve this
          </p>
          <ul className="text-sm text-slate-500 font-medium list-disc list-inside space-y-1">
            <li>
              Patients: ask your practitioner for the 6-character Clinic ID and
              register again with it.
            </li>
            <li>
              Practitioners: register with your clinic's ID — an administrator
              approves practitioner accounts before they can see clinic data.
            </li>
          </ul>
        </div>

        <button
          onClick={() => signOut(auth)}
          className="w-full bg-slate-950 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
        >
          <LogOut size={20} /> Sign out
        </button>
      </div>
    </motion.div>
  );
}
