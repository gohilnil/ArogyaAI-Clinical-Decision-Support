import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  BrainCircuit,
  Wind,
  ActivitySquare,
  ChevronRight,
  Users,
} from "lucide-react";
import {
  CONFIDENCE_THRESHOLD,
  listClinicAssessments,
  listPatients,
} from "../services/firestore";
import type { Assessment, Patient, UserData } from "../types";

// --- GLOBAL DOCTOR DASHBOARD ---
// Every figure is derived from the clinic's own patients and assessments.
// Nothing is hardcoded; when a value cannot be computed it renders as "—"
// rather than a placeholder number.
export default function GlobalDashboard({ userData }: { userData: UserData | null }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      if (!userData?.clinicId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [pts, asmts] = await Promise.all([
          listPatients(userData.clinicId),
          listClinicAssessments(userData.clinicId),
        ]);
        setPatients(pts);
        setAssessments(asmts);
      } catch (e) {
        console.error("Error fetching dashboard stats:", e);
        setError("Could not load clinic statistics.");
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [userData]);

  // --- derived metrics (real data only) ---
  const totalPatients = patients.length;
  const totalAssessments = assessments.length;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const assessmentsToday = assessments.filter(
    (a) => (a.createdAt?.toMillis() || 0) >= startOfToday.getTime(),
  ).length;

  const confidences = assessments
    .map((a) => Number(a.confidence))
    .filter((n) => !isNaN(n) && n > 0);
  const avgConfidence = confidences.length
    ? confidences.reduce((x, y) => x + y, 0) / confidences.length
    : null;

  // Only assessments the model was actually confident about are tallied. Below
  // the gate the stored `prediction` is the neutral placeholder, and counting
  // that as a "condition" would rank "General Imbalance (Review Required)" as
  // if it were a diagnosis. Gated rows are excluded, not relabelled.
  const tally: Record<string, number> = {};
  let gatedCount = 0;
  assessments.forEach((a) => {
    if (!a.prediction) return;
    if (Number(a.confidence) < CONFIDENCE_THRESHOLD) {
      gatedCount += 1;
      return;
    }
    tally[a.prediction] = (tally[a.prediction] || 0) + 1;
  });
  const topCondition = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  const scoredAssessments = assessments.length - gatedCount;

  const show = (v: number | null | undefined, suffix = "") =>
    loading ? "…" : v === null || v === undefined ? "—" : `${v}${suffix}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-8 p-10"
    >
      <div>
        <h1 className="text-4xl font-black text-slate-950 tracking-tighter mb-2">
          Welcome back, Doctor.
        </h1>
        <p className="text-slate-500 font-medium text-lg">
          Live clinic overview for Clinic ID {userData?.clinicId || "—"}.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-100 text-red-700 font-bold rounded-2xl">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-8 rounded-[2rem] border border-slate-200/60 shadow-sm">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-6">
            <Users size={24} />
          </div>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mb-1">
            Total Patients
          </p>
          <p className="text-5xl font-black text-slate-950">
            {show(totalPatients)}
          </p>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-200/60 shadow-sm">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
            <Activity size={24} />
          </div>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mb-1">
            Total Assessments
          </p>
          <p className="text-5xl font-black text-slate-950">
            {show(totalAssessments)}
          </p>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-200/60 shadow-sm">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
            <BrainCircuit size={24} />
          </div>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mb-1">
            Average Model Score
          </p>
          <p className="text-5xl font-black text-slate-950">
            {loading ? "…" : avgConfidence === null ? "—" : avgConfidence.toFixed(1)}
            <span className="text-2xl">%</span>
          </p>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-200/60 shadow-sm">
          <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mb-6">
            <ActivitySquare size={24} />
          </div>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mb-1">
            Assessments Today
          </p>
          <p className="text-5xl font-black text-slate-950">
            {show(assessmentsToday)}
          </p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[2rem] border border-slate-200/60 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center">
            <Wind size={24} />
          </div>
          <div>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">
              Most Frequent Predicted Condition
            </p>
            <p className="text-2xl font-black text-slate-950">
              {loading ? "…" : topCondition ? topCondition[0] : "—"}
              {topCondition && !loading && (
                <span className="text-slate-400 text-sm font-bold ml-2">
                  ({topCondition[1]} assessment
                  {topCondition[1] === 1 ? "" : "s"})
                </span>
              )}
            </p>
            {!loading && gatedCount > 0 && (
              <p className="text-slate-400 text-xs font-semibold mt-1">
                {gatedCount} of {assessments.length} assessment
                {assessments.length === 1 ? "" : "s"} fell below the{" "}
                {CONFIDENCE_THRESHOLD}% gate and are excluded
                {scoredAssessments === 0 ? " (none are counted)" : ""}.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-950 rounded-[3rem] p-12 text-white relative overflow-hidden mt-8">
        <div className="absolute right-0 top-0 opacity-10">
          <ActivitySquare size={300} className="-mr-10 -mt-10" />
        </div>
        <h2 className="text-3xl font-black mb-4">
          Start a new patient analysis
        </h2>
        <p className="text-slate-400 mb-8 max-w-xl text-lg">
          Use the hybrid AI engine to generate a prediction and Ayurvedic
          context, then save it to the patient's assessment history.
        </p>
        <Link
          to="/diagnose"
          className="bg-emerald-500 text-white px-8 py-4 rounded-full font-black text-lg inline-flex items-center gap-2 hover:bg-emerald-400 transition-colors"
        >
          Initialize AI Tool <ChevronRight size={20} />
        </Link>
      </div>
    </motion.div>
  );
}
