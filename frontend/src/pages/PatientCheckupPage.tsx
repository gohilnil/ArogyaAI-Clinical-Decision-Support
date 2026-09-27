import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, Save, CheckCircle2, AlertCircle } from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import { createPatientLog } from "../services/firestore";
import type { UserData } from "../types";

// --- PATIENT SYMPTOM LOGGER ---
export default function PatientCheckup({
  user,
  userData,
}: {
  user: FirebaseUser | null;
  userData: UserData | null;
}) {
  const [symptoms, setSymptoms] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!symptoms.trim()) return;
    // These were a silent early-return before: pressing the button did nothing
    // and gave no reason. Say what is wrong instead.
    if (!user || !userData) {
      setError("You must be signed in to save an entry.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await createPatientLog(
        user.uid,
        user.email,
        userData.clinicId,
        symptoms,
        userData.patientId,
      );
      setSavedSuccess(true);
      setSymptoms("");
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err) {
      console.error("Error saving log:", err);
      setError(
        "Failed to save your entry. Please check your connection and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const isLinked = Boolean(userData?.patientId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-8 p-10"
    >
      <div>
        <h1 className="text-4xl font-black text-slate-950 tracking-tighter mb-2">
          Symptom Logger
        </h1>
        <p className="text-slate-500 font-medium text-lg">
          Record how you are feeling today.
        </p>
      </div>

      <div className="bg-white p-10 md:p-12 rounded-[3rem] border border-slate-200/60 shadow-sm space-y-8">
        <div className="flex items-center gap-4 bg-blue-50 text-blue-800 p-6 rounded-2xl border border-blue-100">
          <Shield className="w-8 h-8 flex-shrink-0" />
          <p className="text-sm font-medium">
            Your entries are sent to Clinic ID{" "}
            <strong>{userData?.clinicId}</strong>. Access is restricted by
            database security rules to your own account and your clinic's
            practitioners.
          </p>
        </div>

        {!isLinked && (
          <div className="flex items-center gap-4 bg-amber-50 text-amber-800 p-6 rounded-2xl border border-amber-200">
            <AlertCircle className="w-8 h-8 flex-shrink-0" />
            <p className="text-sm font-medium">
              Your account is not yet linked to a patient record, so entries
              saved now reach your clinic but will not appear in your personal
              history. Add your patient code in Profile Settings to link them.
            </p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-100 text-red-700 font-bold rounded-2xl flex items-center gap-2">
            <AlertCircle size={18} className="flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-4">
          <label
            htmlFor="symptom-entry"
            className="text-xl font-black text-slate-900"
          >
            How are you feeling?
          </label>
          <p className="text-slate-500 font-medium text-sm">
            Please describe any pain, discomfort, sleep issues, or digestive
            changes you have noticed recently.
          </p>
          <textarea
            id="symptom-entry"
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            className="w-full p-6 h-64 text-lg font-medium rounded-[2rem] border-2 border-slate-200/60 bg-slate-50 focus:ring-4 focus:ring-emerald-200 outline-none resize-none shadow-inner"
            placeholder="e.g. I have had a mild headache for two days and my digestion feels sluggish..."
          ></textarea>
        </div>

        <button
          onClick={handleSave}
          disabled={!symptoms.trim() || isSaving || savedSuccess}
          className={`w-full py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all ${savedSuccess ? "bg-teal-600 text-white" : "bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-50"}`}
        >
          {isSaving ? (
            "Saving securely..."
          ) : savedSuccess ? (
            <>
              <CheckCircle2 size={24} /> Saved to Health Diary
            </>
          ) : (
            <>
              <Save size={24} /> Submit to Diary
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
