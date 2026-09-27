import { motion } from "framer-motion";
import { Clock, LogOut, XCircle, ShieldCheck, Mail } from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import { signOut } from "firebase/auth";
import { auth } from "../config/firebase";
import type { UserData } from "../types";

/**
 * Shown to a practitioner whose account has not been approved yet.
 *
 * A doctor self-registers into a `pending` state and an admin promotes them.
 * Until that happens the rules deny every clinic read — `isDoctor()` is false —
 * so routing them into the clinic dashboard would render a portal where each
 * query fails, which reads as a broken app rather than an unfinished onboarding
 * step. This page states the real situation instead.
 *
 * The same shell covers the rejected case, because the account is equally
 * unable to work and the user deserves to know which of the two it is.
 */
export default function PendingApprovalPage({
  user,
  userData,
}: {
  user: FirebaseUser;
  userData: UserData | null;
}) {
  const rejected = userData?.status === "rejected";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-slate-950 flex items-center justify-center p-6"
    >
      <div className="max-w-lg w-full bg-white rounded-[2rem] p-10 shadow-2xl space-y-6">
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center ${rejected ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}
        >
          {rejected ? <XCircle size={32} /> : <Clock size={32} />}
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-black text-slate-950 tracking-tighter">
            {rejected ? "Access not approved" : "Awaiting approval"}
          </h1>
          <p className="text-slate-500 font-medium">
            {rejected ? (
              <>
                The request to practise as{" "}
                <strong className="text-slate-700">{user.email}</strong> was not
                approved, so this account cannot access clinic records.
              </>
            ) : (
              <>
                Your practitioner account{" "}
                <strong className="text-slate-700">{user.email}</strong> has been
                created and is waiting for a platform administrator to approve
                it.
              </>
            )}
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-2">
          <p className="font-bold text-slate-700 text-sm flex items-center gap-2">
            <ShieldCheck size={16} className="text-slate-400" />
            {rejected ? "What you can do" : "What happens next"}
          </p>
          <ul className="text-sm text-slate-500 font-medium list-disc list-inside space-y-1">
            {rejected ? (
              <>
                <li>Contact your clinic administrator to review the decision.</li>
                <li>
                  If your clinic and details are correct, ask them to approve the
                  account from the admin panel.
                </li>
              </>
            ) : (
              <>
                <li>
                  Patient records stay hidden until approval — this is
                  deliberate, so no clinic data is visible before review.
                </li>
                <li>
                  Once approved, signing in again opens the full practitioner
                  portal.
                </li>
              </>
            )}
          </ul>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
          <p className="font-bold text-emerald-900 text-sm flex items-center gap-2 mb-1">
            <Mail size={16} /> Clinic
          </p>
          <p className="text-emerald-800 font-mono font-black tracking-widest">
            {userData?.clinicId || "—"}
          </p>
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
