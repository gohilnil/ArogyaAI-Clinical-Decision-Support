import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  HeartPulse,
  Leaf,
  ClipboardCheck,
  Calendar,
  MessageSquare,
} from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  getPatient,
  listMyLogs,
  listPatientAssessments,
} from "../services/firestore";
import { dateOnly } from "../lib/format";
import type { Assessment, Patient, PatientLog, UserData } from "../types";

// --- PATIENT DASHBOARD ---
// Reads the account's own patient record and assessment history. Access is
// scoped by the account's `patientId` link, so a patient can only ever see
// their own data — no name matching, no clinic-wide read.
//
// Diary entries are keyed on the ACCOUNT (`userId`), not the link, so a patient
// always sees what they wrote even before a practitioner issues them a code.
export default function PatientDashboard({
  user,
  userData,
}: {
  user: FirebaseUser | null;
  userData: UserData | null;
}) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [logs, setLogs] = useState<PatientLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const displayName = patient?.name || user?.email?.split("@")[0] || "Patient";
  const linked = Boolean(userData?.patientId);

  useEffect(() => {
    const load = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        // The diary is always available; the clinical record only once linked.
        const diary = await listMyLogs(user.uid);
        setLogs(diary);

        // A linked record needs BOTH the patient id and a clinic to scope the
        // query. This page is only routed to a patient, who always has a
        // clinic — but `clinicId` is optional on the type now (an admin has
        // none), so the pairing is checked rather than assumed.
        if (linked && userData?.patientId && userData?.clinicId) {
          const [p, a] = await Promise.all([
            getPatient(userData.patientId),
            listPatientAssessments(userData.clinicId, userData.patientId),
          ]);
          setPatient(p);
          setAssessments(a);
        }
      } catch (e) {
        console.error("Error loading your records:", e);
        setError("Could not load your health record. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [linked, user, userData]);

  const fmt = dateOnly;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-8 p-10"
    >
      <div>
        <h1 className="text-4xl font-black text-slate-950 tracking-tighter mb-2">
          Hello, {displayName}.
        </h1>
        <p className="text-slate-500 font-medium text-lg">
          Welcome to your personal Ayurvedic health portal.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-100 text-red-700 font-bold rounded-2xl">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-10 rounded-[2rem] text-white shadow-lg relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 opacity-20">
            <HeartPulse size={150} />
          </div>
          <h3 className="text-2xl font-black mb-4 relative z-10">
            Start a Quick Checkup
          </h3>
          <p className="text-emerald-100 font-medium mb-8 relative z-10 max-w-sm">
            Not feeling well? Log your symptoms to share securely with your
            Ayurvedic practitioner.
          </p>
          <Link
            to="/checkup"
            className="bg-white text-teal-700 px-6 py-3 rounded-full font-black text-sm relative z-10 shadow-md hover:bg-slate-50 inline-block transition-colors"
          >
            Log Symptoms
          </Link>
        </div>

        <div className="bg-white p-10 rounded-[2rem] border border-slate-200/60 shadow-sm flex flex-col relative">
          <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
            <ClipboardCheck className="text-blue-500" size={24} />
            <h3 className="text-xl font-black text-slate-900">
              Your Assessment History
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto max-h-64 pr-2">
            {loading ? (
              <p className="text-slate-400 font-bold text-sm text-center mt-10">
                Loading your records...
              </p>
            ) : !linked ? (
              <div className="flex flex-col justify-center items-center h-full text-center opacity-60 mt-4">
                <Leaf size={40} className="mb-3 text-slate-400" />
                <p className="text-slate-500 font-bold text-sm">
                  Your account is not yet linked to a health record.
                </p>
                <p className="text-slate-400 font-medium text-xs mt-2 max-w-xs">
                  Ask your practitioner for your patient code, then link it from
                  your Profile settings.
                </p>
              </div>
            ) : assessments.length === 0 ? (
              <div className="flex flex-col justify-center items-center h-full text-center opacity-50 mt-4">
                <Leaf size={40} className="mb-3 text-slate-400" />
                <p className="text-slate-500 font-bold text-sm">
                  No assessments have been recorded for you yet.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {assessments.map((a) => (
                  <div
                    key={a.id}
                    className="bg-slate-50 p-5 rounded-2xl border border-slate-100"
                  >
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <Calendar size={12} /> {fmt(a.createdAt)}
                      </span>
                      <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-md">
                        {a.confidence}% model score
                      </span>
                    </div>
                    <p className="text-sm font-black text-slate-800">
                      {a.prediction}
                    </p>
                    <p className="text-xs font-medium text-slate-500 mt-1 line-clamp-2">
                      {a.symptoms}
                    </p>
                  </div>
                ))}
                <p className="text-xs font-medium text-slate-400 leading-relaxed pt-2 border-t border-slate-100">
                  These are model outputs recorded by your practitioner, not
                  medical diagnoses. The score is the model's raw confidence
                  value, not a probability that the result is correct. Discuss
                  anything here with your practitioner before acting on it.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Your Health Diary — keyed on the ACCOUNT, so entries remain visible
          even before a practitioner issues a patient code. Previously they
          vanished from the patient's own view in that window. */}
      <div className="bg-white p-10 rounded-[2rem] border border-slate-200/60 shadow-sm">
        <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
          <MessageSquare className="text-emerald-500" size={24} />
          <h3 className="text-xl font-black text-slate-900">
            Your Health Diary
          </h3>
        </div>

        {loading ? (
          <p className="text-slate-400 font-bold text-sm">
            Loading your entries...
          </p>
        ) : logs.length === 0 ? (
          <div className="text-center py-6 opacity-60">
            <Leaf size={36} className="mx-auto mb-3 text-slate-400" />
            <p className="text-slate-500 font-bold text-sm">
              You have not logged any symptoms yet.
            </p>
            <Link
              to="/checkup"
              className="inline-block mt-4 bg-emerald-100 text-emerald-700 px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-200 transition-colors"
            >
              Log your first entry
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="bg-slate-50 p-5 rounded-2xl border border-slate-100"
              >
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-2">
                  <Calendar size={12} /> {fmt(log.createdAt)}
                </p>
                <p className="text-slate-700 font-medium text-sm">
                  {log.symptoms}
                </p>
                {!log.patientId && (
                  <p className="text-xs font-semibold text-amber-700 mt-2">
                    Your clinic can see this entry; link your record in Profile
                    Settings to attach it to your history.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
