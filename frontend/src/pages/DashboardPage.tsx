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
  AlertTriangle,
  CalendarCheck,
} from "lucide-react";
import {
  CONFIDENCE_THRESHOLD,
  listClinicAssessments,
  listPatients,
} from "../services/firestore";
import { dayKey, lastNDays, relativeTime, shortDate, startOfToday } from "../lib/format";
import { StatTile } from "../components/ui/StatTile";
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
  /** Bumped to re-run the fetch when the clinician retries. */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
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
        if (cancelled) return;
        setPatients(pts);
        setAssessments(asmts);
      } catch (e) {
        if (cancelled) return;
        console.error("Error fetching dashboard stats:", e);
        // A failed request must not be presented as a clinic with zero
        // activity. The figures are blanked so the tiles below render "—",
        // which reads as "unknown", not as "none".
        setPatients([]);
        setAssessments([]);
        setError("Could not load clinic statistics.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [userData, reloadToken]);

  // --- derived metrics (real data only) ---
  const metrics = useMemo(() => {
    const todayMs = startOfToday();

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

    // Which patients have been assessed at least once. Used to surface the
    // people who are registered but have no clinical history yet — the group a
    // practitioner most often means to follow up.
    const assessedPatientIds = new Set(assessments.map((a) => a.patientId));
    const awaitingFirstVisit = patients.filter(
      (p) => !assessedPatientIds.has(p.id),
    ).length;

    // A 14-day count of assessments, so a clinician can see whether activity is
    // rising or has gone quiet. Bucketed on LOCAL days.
    const buckets = new Map<string, number>();
    for (const d of lastNDays(14)) buckets.set(dayKey(d), 0);
    for (const a of assessments) {
      const d = a.createdAt?.toDate?.();
      if (!d) continue;
      const key = dayKey(d);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
    }

    return {
      totalPatients: patients.length,
      totalAssessments: assessments.length,
      assessmentsToday,
      avgConfidence,
      topConditions: top,
      gatedCount,
      awaitingFirstVisit,
      trend: lastNDays(14).map((d) => ({
        label: shortDate(d),
        count: buckets.get(dayKey(d)) || 0,
      })),
    };
  }, [assessments, patients]);

  const patientById = useMemo(() => {
    const map = new Map<string, Patient>();
    for (const p of patients) map.set(p.id, p);
    return map;
  }, [patients]);

  const show = (v: number | null | undefined) =>
    loading
      ? "…"
      : error
        ? "—"
        : v === null || v === undefined
          ? "—"
          : String(v);

  const trendPeak = Math.max(1, ...metrics.trend.map((t) => t.count));

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
          Live clinic overview for Clinic ID{" "}
          <strong className="font-mono text-slate-700">
            {userData?.clinicId || "—"}
          </strong>
          .
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
        <StatTile
          label="Total Patients"
          value={show(metrics.totalPatients)}
          icon={<Users size={24} />}
          tone="bg-emerald-100 text-emerald-600"
        />
        <StatTile
          label="Total Assessments"
          value={show(metrics.totalAssessments)}
          icon={<Activity size={24} />}
          tone="bg-indigo-100 text-indigo-600"
        />
        <StatTile
          label="Assessments Today"
          value={show(metrics.assessmentsToday)}
          icon={<CalendarCheck size={24} />}
          tone="bg-orange-100 text-orange-600"
        />
        <StatTile
          label="Average Model Score"
          value={
            loading || error || metrics.avgConfidence === null
              ? show(null)
              : String(Math.round(metrics.avgConfidence * 10) / 10)
          }
          icon={<BrainCircuit size={24} />}
          tone="bg-blue-100 text-blue-600"
          note={
            loading || error || metrics.avgConfidence === null
              ? undefined
              : "Raw model output, not a probability of being correct"
          }
        />
      </div>

      {/* Two things worth acting on, drawn only when there is something to say.
          These are the follow-ups a practitioner would otherwise have to derive
          by cross-referencing two lists by hand. */}
      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Link
            to="/patients"
            className={`flex items-center gap-4 rounded-[2rem] p-6 border-2 transition-colors ${
              metrics.awaitingFirstVisit > 0
                ? "bg-amber-50 border-amber-200 hover:border-amber-300"
                : "bg-white border-slate-200/60 hover:border-slate-300"
            }`}
          >
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                metrics.awaitingFirstVisit > 0
                  ? "bg-amber-100 text-amber-600"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              <AlertTriangle size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-slate-900">
                {metrics.awaitingFirstVisit} patient
                {metrics.awaitingFirstVisit === 1 ? "" : "s"} awaiting a first
                assessment
              </p>
              <p className="text-slate-500 font-medium text-sm">
                {metrics.awaitingFirstVisit === 0
                  ? "Every registered patient has a recorded assessment."
                  : "Registered at this clinic with no clinical event yet."}
              </p>
            </div>
            <ChevronRight className="text-slate-400 flex-shrink-0" size={20} />
          </Link>

          <div
            className={`flex items-center gap-4 rounded-[2rem] p-6 border-2 ${
              metrics.gatedCount > 0
                ? "bg-amber-50 border-amber-200"
                : "bg-white border-slate-200/60"
            }`}
          >
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                metrics.gatedCount > 0
                  ? "bg-amber-100 text-amber-600"
                  : "bg-emerald-100 text-emerald-600"
              }`}
            >
              <ClipboardList size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-slate-900">
                {metrics.gatedCount} assessment
                {metrics.gatedCount === 1 ? "" : "s"} needing review
              </p>
              <p className="text-slate-500 font-medium text-sm">
                Below the {CONFIDENCE_THRESHOLD}% confidence gate, so the model
                did not name a condition. Clinical review is what the gate asks
                for.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* A 14-day trend. Bars carry their own count as a tooltip and the axis is
          labelled by the first and last day, so the shape reads without
          relying on colour. */}
      {!loading && !error && metrics.totalAssessments > 0 && (
        <div className="bg-white p-8 rounded-[2rem] border border-slate-200/60 shadow-sm">
          <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
            <ActivitySquare className="text-indigo-500" size={22} />
            <h2 className="text-xl font-black text-slate-950">
              Assessment Activity, Last 14 Days
            </h2>
          </div>
          <div className="flex items-end gap-1.5 h-32" role="img" aria-label="Assessment counts per day over the last 14 days">
            {metrics.trend.map((t) => (
              <div
                key={t.label}
                className="flex-1 flex flex-col items-center justify-end gap-1.5 group h-full"
                title={`${t.count} assessment${t.count === 1 ? "" : "s"} on ${t.label}`}
              >
                <span className="text-[10px] font-black text-slate-400 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                  {t.count}
                </span>
                <div
                  className={`w-full rounded-t-lg transition-colors ${
                    t.count > 0
                      ? "bg-gradient-to-t from-emerald-400 to-teal-400 group-hover:from-emerald-500 group-hover:to-teal-500"
                      : "bg-slate-100"
                  }`}
                  style={{
                    height: `${Math.max(4, (t.count / trendPeak) * 100)}%`,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs font-bold text-slate-400 mt-3">
            <span>{metrics.trend[0]?.label}</span>
            <span>{metrics.trend[metrics.trend.length - 1]?.label}</span>
          </div>
        </div>
      )}

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
                    <div className="flex justify-between text-sm font-bold text-slate-700 mb-1.5 gap-3">
                      <span className="truncate">{condition}</span>
                      <span className="text-slate-400 flex-shrink-0">
                        {count} assessment{count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${width}%` }}
                        transition={{ duration: 0.6, delay: i * 0.08 }}
                        className={`h-2.5 rounded-full ${
                          i === 0
                            ? "bg-gradient-to-r from-emerald-400 to-teal-500"
                            : "bg-gradient-to-r from-emerald-300 to-teal-300"
                        }`}
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
            <Activity className="text-emerald-500" size={22} />
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
              // A row that names a patient should open that patient. Before,
              // this was inert text and the clinician had to go and find the
              // record by hand from the name.
              const body = (
                <>
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-black flex-shrink-0 ${
                      gated
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
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
                </>
              );

              return patient ? (
                <Link
                  key={a.id}
                  to={`/patients/${a.patientId}`}
                  className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-emerald-200 hover:bg-emerald-50/40 transition-colors"
                >
                  {body}
                </Link>
              ) : (
                <div
                  key={a.id}
                  className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  {body}
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
