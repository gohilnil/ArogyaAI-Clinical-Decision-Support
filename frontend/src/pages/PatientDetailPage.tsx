import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BrainCircuit,
  Calendar,
  ClipboardCheck,
  Activity,
  User,
  MessageSquare,
} from "lucide-react";
import {
  getPatient,
  listPatientAssessments,
  listPatientLogs,
} from "../services/firestore";
import type { Assessment, Patient, PatientLog } from "../types";

/** One patient's profile and full assessment history (newest first). */
export default function PatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [logs, setLogs] = useState<PatientLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!patientId) return;
      setLoading(true);
      setError(null);
      try {
        // Sequential, not parallel: the assessments query must be scoped by the
        // patient's own clinicId to satisfy the read rule for a practitioner,
        // and that value comes from the patient document itself.
        const p = await getPatient(patientId);
        if (!p) {
          setPatient(null);
          setAssessments([]);
          setLogs([]);
          setError("That patient record could not be found.");
          return;
        }
        const a = await listPatientAssessments(p.clinicId, patientId);
        setPatient(p);
        setAssessments(a);

        // The diary is supplementary: a patient who never linked their account
        // has no entries attached, and a failure here must not hide the
        // clinical record that did load.
        try {
          setLogs(await listPatientLogs(p.clinicId, patientId));
        } catch (logError) {
          console.error("Error loading patient diary:", logError);
          setLogs([]);
        }
      } catch (e) {
        console.error("Error loading patient:", e);
        setError(
          "Could not load this patient record. You may not have access to it.",
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [patientId]);

  const fmt = (t?: { toDate: () => Date }) =>
    t ? t.toDate().toLocaleString() : "—";

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-10 text-center text-slate-500 font-bold">
        Loading patient record...
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="max-w-5xl mx-auto p-10 space-y-6">
        <button
          onClick={() => navigate("/patients")}
          className="text-emerald-600 font-black text-sm flex items-center gap-1 hover:underline"
        >
          <ArrowLeft size={16} /> Back to records
        </button>
        <div className="p-6 bg-red-100 text-red-700 font-bold rounded-2xl">
          {error || "Patient not found."}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto space-y-8 p-10"
    >
      <button
        onClick={() => navigate("/patients")}
        className="text-emerald-600 font-black text-sm flex items-center gap-1 hover:underline"
      >
        <ArrowLeft size={16} /> Back to records
      </button>

      {/* Identity */}
      <div className="bg-white p-8 rounded-[2rem] border border-slate-200/60 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
            <User size={30} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-950 tracking-tighter">
              {patient.name}
            </h1>
            <p className="text-slate-500 font-bold">
              {patient.age ? `${patient.age} years` : "Age not recorded"} ·{" "}
              {patient.gender || "Gender not recorded"} · Prakriti:{" "}
              {patient.dosha || "Not recorded"}
            </p>
            <p className="text-xs font-bold text-slate-400 mt-1 font-mono">
              Patient code: {patient.id}
            </p>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-950 tracking-tighter">
          Assessment History
        </h2>
        <button
          onClick={() =>
            navigate("/diagnose", { state: { prefillPatientId: patient.id } })
          }
          className="bg-slate-950 text-white px-6 py-3 rounded-full font-black text-sm flex items-center gap-2 hover:bg-slate-800"
        >
          <BrainCircuit size={18} /> New Assessment
        </button>
      </div>

      {assessments.length === 0 ? (
        <div className="bg-white p-10 rounded-[2rem] border border-slate-200/60 text-center text-slate-500 font-bold">
          No assessments recorded for this patient yet.
        </div>
      ) : (
        <div className="space-y-4">
          {assessments.map((a) => {
            const open = openId === a.id;
            return (
              <div
                key={a.id}
                className="bg-white rounded-[2rem] border border-slate-200/60 shadow-sm overflow-hidden"
              >
                <button
                  onClick={() => setOpenId(open ? null : a.id)}
                  className="w-full text-left p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center">
                      <Activity size={20} />
                    </div>
                    <div>
                      <p className="font-black text-slate-900">
                        {a.prediction}
                        <span className="text-slate-400 text-xs ml-2 font-bold">
                          {a.confidence}% model score
                        </span>
                      </p>
                      <p className="text-xs font-bold text-slate-400 flex items-center gap-1 mt-0.5">
                        <Calendar size={12} /> {fmt(a.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span className="text-emerald-600 font-black text-xs uppercase tracking-widest">
                    {open ? "Hide report" : "View report"}
                  </span>
                </button>

                {open && (
                  <div className="px-6 pb-6 space-y-5 border-t border-slate-100 pt-6">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                        Recorded Symptoms
                      </h4>
                      <p className="text-slate-700 font-medium">{a.symptoms}</p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        ["Age", a.age || "—"],
                        ["Gender", a.gender || "—"],
                        ["Dosha", a.dosha || "—"],
                        ["Season", a.season || "—"],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="bg-slate-50 rounded-2xl p-4 border border-slate-100"
                        >
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                            {label}
                          </p>
                          <p className="font-bold text-slate-800">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="bg-slate-950 text-white rounded-2xl p-5">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
                        Machine Learning Prediction
                      </p>
                      <p className="text-xl font-black">
                        {a.prediction}{" "}
                        <span className="text-slate-400 text-sm font-bold">
                          (model score {a.confidence}%)
                        </span>
                      </p>
                      {a.mlPrediction &&
                        a.mlPrediction !== a.prediction && (
                          <p className="text-slate-400 text-xs font-semibold mt-2">
                            Raw model label: {a.mlPrediction} — withheld from
                            the displayed result as below the confidence
                            threshold.
                          </p>
                        )}
                    </div>

                    {/* The model's own contributions, stored with the event so
                        they reflect the analysis that actually ran, not a
                        re-computation against a later model. */}
                    {a.explanation && a.explanation.features.length > 0 && (
                      <div>
                        <h4 className="font-black text-slate-900 mb-3 flex items-center gap-2">
                          <Activity size={18} className="text-emerald-500" />
                          Model Contributions
                        </h4>
                        <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                          {a.explanation.features.map((feature, i) => {
                            const peak = Math.max(
                              ...a.explanation!.features.map((f) =>
                                Math.abs(f.contribution),
                              ),
                            );
                            const width =
                              peak > 0
                                ? (Math.abs(feature.contribution) / peak) * 100
                                : 0;
                            const supports = feature.direction === "supports";
                            return (
                              <div key={i}>
                                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1 gap-3">
                                  <span className="uppercase truncate">
                                    {feature.feature}
                                  </span>
                                  <span
                                    className={
                                      supports
                                        ? "text-emerald-600"
                                        : "text-rose-500"
                                    }
                                  >
                                    {feature.contribution >= 0 ? "+" : ""}
                                    {feature.contribution.toFixed(2)}
                                  </span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2">
                                  <div
                                    style={{ width: `${width}%` }}
                                    className={`h-2 rounded-full ${
                                      supports
                                        ? "bg-gradient-to-r from-emerald-400 to-teal-500"
                                        : "bg-gradient-to-r from-rose-400 to-orange-400"
                                    }`}
                                  />
                                </div>
                              </div>
                            );
                          })}
                          <p className="text-xs text-slate-400 font-medium leading-relaxed pt-2 border-t border-slate-200">
                            {a.explanation.note}
                          </p>
                        </div>
                      </div>
                    )}

                    {a.aiReport ? (
                      <div>
                        <h4 className="font-black text-slate-900 mb-3 flex items-center gap-2">
                          <ClipboardCheck size={18} className="text-emerald-500" />
                          AI-Generated Ayurvedic Context
                        </h4>
                        <div className="text-slate-700 leading-relaxed whitespace-pre-wrap text-sm font-medium bg-slate-50 p-5 rounded-2xl border border-slate-100">
                          {a.aiReport.replace(/\*\*/g, "")}
                        </div>
                        <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mt-3">
                          This AI-generated analysis is for informational and
                          educational purposes only. It is not a medical
                          diagnosis and is not a substitute for professional
                          medical advice.
                        </p>
                      </div>
                    ) : (
                      <p className="text-slate-400 font-bold text-sm">
                        No AI report was stored with this assessment.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* This patient's diary, shown in the same place as their clinical
          history so a practitioner reviewing a patient does not have to
          hunt through the clinic-wide diary tab for the right person.
          Entries only appear here once the patient's account is linked to
          this record; unlinked entries remain visible in the clinic diary. */}
      <div className="bg-white p-8 rounded-[2rem] border border-slate-200/60 shadow-sm">
        <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
          <MessageSquare className="text-emerald-500" size={22} />
          <h2 className="text-xl font-black text-slate-950 tracking-tighter">
            Patient Health Diary
          </h2>
        </div>

        {logs.length === 0 ? (
          <p className="text-slate-400 font-bold text-sm">
            No diary entries are attached to this record. Entries a patient
            submits before linking their account appear in the clinic-wide
            diary under Patient Records.
          </p>
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
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
