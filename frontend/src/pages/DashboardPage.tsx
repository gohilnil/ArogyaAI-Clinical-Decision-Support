import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  BrainCircuit,
  Wind,
  ActivitySquare,
  ChevronRight,
  Users,
  ClipboardList,
  RefreshCw,
  Calendar,
  TrendingUp,
} from "lucide-react";
import {
  CONFIDENCE_THRESHOLD,
  listClinicAssessments,
  listPatients,
} from "../services/firestore";
import type {
  Assessment,
  FirestoreTimestamp,
  Patient,
  UserData,
} from "../types";

/** "2h ago" scans faster than a bare date for recent activity. */
function relativeTime(t?: FirestoreTimestamp): string {
  if (!t) return "—";
  const mins = Math.floor((Date.now() - t.toDate().getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return t.toDate().toLocaleDateString();
}

// --- GLOBAL DOCTOR DASHBOARD ---
// Every figure is derived from the clinic's own patients and assessments.
// Nothing is hardcoded; when a value cannot be computed it renders as "—"
// rather than a placeholder number.
export default function GlobalDashboard({ userData }: { userData: UserData | null }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Bumped to re-run the fetch when the clinician retries. */
  const [reloadToken, setReloadToken] = useState(0);

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
        // A failed request must not be presented as a clinic with zero
        // activity. The figures are blanked so the tiles below render "—",
        // which reads as "unknown", not as "none".
        setPatients([]);
        setAssessments([]);
        setError("Could not load clinic statistics.");
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [userData, reloadToken]);

  // --- derived metrics (real data only) ---
  const metrics = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();

    const assessmentsToday = assessments.filter(
      (a) => (a.createdAt?.toMillis() || 0) >= todayMs,
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
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]);

    return {
      totalPatients: patients.length,
      totalAssessments: assessments.length,
      assessmentsToday,
      avgConfidence,
      topConditions: top,
      gatedCount,
    };
  }, [assessments, patients]);

  const patientById = useMemo(() => {
    const map = new Map<string, Patient>();
    for (const p of patients) map.set(p.id, p);
    return map;
  }, [patients]);

  const show = (v: number | null | undefined, suffix = "") =>
    loading
      ? "…"
      : error
        ? "—"
        : v === null || v === undefined
          ? "—"
          : `${v}${suffix}`;

  const tile = (
    label: string,
    value: number | null,
    Icon: typeof Users,
    tone: string,
    sub?: string,
  ) => (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-200/60 shadow-sm">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${tone}`}>
        <Icon size={24} />
      </div>
      <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mb-1">
        {label}
      </p>
      <p className="text-4xl font-black text-slate-950">
        {show(value)}
      </p>
      {sub && !loading && (
        <p className="text-xs font-semibold text-slate-400 mt-1">{sub}</p>
      )}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-8 p-6 md:p-10"
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
        <div className="p-6 bg-red-100 text-red-700 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-black">{error}</p>
            <p className="text-sm font-semibold text-red-600/80 mt-1">
              The figures below are unavailable, not zero. This is a failed
              request, so no clinic totals can be shown.
            </p>
          </div>
          <button
            onClick={() => setReloadToken((n) => n + 1)}
            disabled={loading}
            className="bg-red-700 text-white px-6 py-3 rounded-xl font-black text-sm hover:bg-red-800 transition-colors disabled:opacity-60 flex-shrink-0"
          >
            <RefreshCw size={16} className="inline mr-1" />
            {loading ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {tile("Total Patients", metrics.totalPatients, Users, "bg-emerald-100 text-emerald-600")}
        {tile(
          "Total Assessments",
          metrics.totalAssessments,
          Activity,
          "bg-indigo-100 text-indigo-600",
        )}
        {tile(
          "Average Model Score",
          metrics.avgConfidence === null ? null : Math.round(metrics.avgConfidence * 10) / 10,
          BrainCircuit,
          "bg-blue-100 text-blue-600",
          metrics.avgConfidence === null
            ? undefined
            : "Raw model output, not a probability of being correct",
        )}
        {tile(
          "Assessments Today",
          metrics.assessmentsToday,
          ActivitySquare,
          "bg-orange-100 text-orange-600",
        )}
      </div>

      {/* Condition breakdown replaces the single-row "most frequent" strip: the
          same tally, but now showing the distribution rather than only its top
          entry, which is what a clinician actually wants to see. */}
      <div className="bg-white p-8 rounded-[2rem] border border-slate-200/60 shadow-sm">
        <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
          <Wind className="text-orange-500" size={22} />
          <h2 className="text-xl font-black text-slate-950">
            Predicted Condition Breakdown
          </h2>
        </div>

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : metrics.topConditions.length === 0 ? (
          <div className="text-center py-6 opacity-70">
            <ClipboardList size={36} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 font-bold text-sm">
              {metrics.totalAssessments === 0
                ? "No assessments recorded yet."
                : `All ${metrics.totalAssessments} assessment${metrics.totalAssessments === 1 ? "" : "s"} fell below the ${CONFIDENCE_THRESHOLD}% confidence gate, so no condition is tallied.`}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {metrics.topConditions.map(([condition, count], i) => {
                const peak = metrics.topConditions[0][1];
                const width = peak > 0 ? (count / peak) * 100 : 0;
                return (
                  <div key={condition}>
                    <div className="flex justify-between text-sm font-bold text-slate-700 mb-1.5">
                      <span>{condition}</span>
                      <span className="text-slate-400">
                        {count} assessment{count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${width}%` }}
                        transition={{ duration: 0.6, delay: i * 0.08 }}
                        className={`h-2.5 rounded-full ${i === 0 ? "bg-gradient-to-r from-emerald-400 to-teal-500" : "bg-gradient-to-r from-emerald-300 to-teal-300"}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {metrics.gatedCount > 0 && (
              <p className="text-xs font-semibold text-slate-400 mt-5">
                {metrics.gatedCount} of {metrics.totalAssessments} assessment
                {metrics.totalAssessments === 1 ? "" : "s"} fell below the{" "}
                {CONFIDENCE_THRESHOLD}% confidence gate and are excluded from this
                breakdown.
              </p>
            )}
          </>
        )}
      </div>

      {/* Recent activity: the assessments are already fetched, so the timeline
          costs no extra reads. Falls back to patient name where the account is
          linked, since a clinician reviews people rather than accounts. */}
      <div className="bg-white p-8 rounded-[2rem] border border-slate-200/60 shadow-sm">
        <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="text-emerald-500" size={22} />
            <h2 className="text-xl font-black text-slate-950">Recent Activity</h2>
          </div>
          {assessments.length > 0 && !loading && (
            <Link
              to="/patients"
              className="text-emerald-600 font-black text-sm hover:underline flex items-center gap-1"
            >
              View all <ChevronRight size={16} />
            </Link>
          )}
        </div>

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : assessments.length === 0 ? (
          <div className="text-center py-6 opacity-70">
            <Activity size={36} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 font-bold text-sm">
              No assessments recorded yet. Your first analysis will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {assessments.slice(0, 5).map((a) => {
              const patient = patientById.get(a.patientId);
              const gated = Number(a.confidence) < CONFIDENCE_THRESHOLD;
              return (
                <div
                  key={a.id}
                  className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-black flex-shrink-0 ${gated ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
                  >
                    {(patient?.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-900 truncate">
                      {patient?.name || "Unknown patient"}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 truncate">
                      {gated ? "Below confidence gate — review required" : a.prediction}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-black text-slate-400 flex items-center gap-1 justify-end">
                      <Calendar size={12} /> {relativeTime(a.createdAt)}
                    </p>
                    <p className="text-sm font-bold text-slate-700">
                      {a.confidence}% score
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-slate-950 rounded-[3rem] p-10 md:p-12 text-white relative overflow-hidden">
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
