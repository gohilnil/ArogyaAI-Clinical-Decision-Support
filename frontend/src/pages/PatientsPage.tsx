import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ActivitySquare,
  MessageSquare,
  Calendar,
  BrainCircuit,
  ChevronRight,
} from "lucide-react";
import { listClinicAssessments, listClinicLogs, listPatients } from "../services/firestore";
import type { Assessment, Patient, PatientLog, UserData } from "../types";

// --- CLOUD-CONNECTED PATIENT RECORDS ---
// Lists PEOPLE, each summarised by their most recent clinical event — not one
// row per diagnosis. Clicking a patient opens their full assessment history.
export default function PatientRecords({ userData }: { userData: UserData | null }) {
  const [activeTab, setActiveTab] = useState<"diagnostics" | "logs">(
    "diagnostics",
  );
  const [patients, setPatients] = useState<Patient[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [patientLogs, setPatientLogs] = useState<PatientLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      if (!userData?.clinicId) {
        // Nothing to fetch without a clinic. Clear the spinner rather than
        // leaving the page loading forever on a profile that has no clinic.
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [pts, asmts, logs] = await Promise.all([
          listPatients(userData.clinicId),
          listClinicAssessments(userData.clinicId),
          listClinicLogs(userData.clinicId),
        ]);
        setPatients(pts);
        setAssessments(asmts);
        setPatientLogs(logs);
      } catch (e) {
        console.error("Error fetching records:", e);
        setError("Could not load clinic records. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userData]);

  // assessments arrive newest-first, so the first one seen for a patient is
  // their latest. Counting is done here rather than stored on the patient, so
  // the summary can never drift from the underlying events.
  const byPatient = new Map<string, { latest: Assessment; count: number }>();
  for (const a of assessments) {
    const existing = byPatient.get(a.patientId);
    if (existing) existing.count += 1;
    else byPatient.set(a.patientId, { latest: a, count: 1 });
  }

  const fmtDate = (t?: { toDate: () => Date }) =>
    t ? t.toDate().toLocaleDateString() : "—";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-8 p-10"
    >
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-slate-950 tracking-tighter mb-2">
            Patient Records
          </h1>
          <p className="text-slate-500 font-medium text-lg">
            Secure clinical history for Clinic ID:{" "}
            <strong>{userData?.clinicId}</strong>.
          </p>
        </div>
      </div>

      <div className="flex gap-4 border-b-2 border-slate-200/60 pb-4">
        <button
          onClick={() => setActiveTab("diagnostics")}
          className={`px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 transition-all ${activeTab === "diagnostics" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
        >
          <ActivitySquare size={18} /> Patients
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 transition-all ${activeTab === "logs" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
        >
          <MessageSquare size={18} /> Patient Health Diaries
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-100 text-red-700 font-bold rounded-2xl">
          {error}
        </div>
      )}

      <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-sm overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="p-10 text-center text-slate-500 font-bold">
            Loading secure records from cloud...
          </div>
        ) : activeTab === "diagnostics" ? (
          patients.length === 0 ? (
            <div className="p-10 text-center text-slate-500 font-bold">
              No patients registered for this clinic yet. Start an assessment
              from the AI Diagnostic tool to add one.
            </div>
          ) : (
            <>
            <table className="w-full text-left min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200/60">
                <tr>
                  <th className="p-6 font-black text-slate-400 text-sm uppercase tracking-widest">
                    Patient
                  </th>
                  <th className="p-6 font-black text-slate-400 text-sm uppercase tracking-widest">
                    Profile
                  </th>
                  <th className="p-6 font-black text-slate-400 text-sm uppercase tracking-widest">
                    Prakriti
                  </th>
                  <th className="p-6 font-black text-slate-400 text-sm uppercase tracking-widest">
                    Latest Assessment
                  </th>
                  <th className="p-6 font-black text-slate-400 text-sm uppercase tracking-widest">
                    Visits
                  </th>
                  <th className="p-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {patients.map((pt) => {
                  const summary = byPatient.get(pt.id);
                  return (
                    <tr
                      key={pt.id}
                      onClick={() => navigate(`/patients/${pt.id}`)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="p-6 font-black text-slate-900">{pt.name}</td>
                      <td className="p-6 font-bold text-slate-600">
                        {pt.age ? `${pt.age}y` : "—"} / {pt.gender || "—"}
                      </td>
                      <td className="p-6">
                        <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-bold border border-slate-200">
                          {(pt.dosha || "Unknown").split(" ")[0]}
                        </span>
                      </td>
                      <td className="p-6">
                        {summary ? (
                          <>
                            <span className="font-bold text-emerald-600">
                              {summary.latest.prediction}
                            </span>
                            <span className="text-slate-400 text-xs ml-2">
                              (model score {summary.latest.confidence}%)
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400 font-bold text-sm">
                            No assessments yet
                          </span>
                        )}
                      </td>
                      <td className="p-6 font-bold text-slate-600">
                        {summary?.count ?? 0}
                      </td>
                      <td className="p-6 text-slate-300">
                        <ChevronRight size={20} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-6 pb-6 text-xs font-medium text-slate-400 leading-relaxed">
              Predictions are model outputs recorded at the time of each visit,
              and the percentage is the model's raw score, not a probability
              that the result is correct. They are decision support for review,
              not diagnoses.
            </p>
            </>
          )
        ) : patientLogs.length === 0 ? (
          <div className="p-10 text-center text-slate-500 font-bold">
            No patient diaries have been submitted yet.
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {patientLogs.map((log) => (
              <div
                key={log.id}
                className="bg-slate-50 border border-slate-100 p-6 rounded-3xl flex flex-col md:flex-row gap-6"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-black">
                  {log.email?.charAt(0).toUpperCase() || "P"}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-slate-900">
                      {log.email || "Patient"}
                    </h4>
                    <span className="text-xs font-bold text-slate-400 flex items-center gap-1 bg-white px-3 py-1 rounded-full border border-slate-200">
                      <Calendar size={12} />
                      {fmtDate(log.createdAt)}
                    </span>
                  </div>
                  <p className="text-slate-600 font-medium leading-relaxed bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                    "{log.symptoms}"
                  </p>

                  <button
                    onClick={() =>
                      navigate("/diagnose", {
                        state: {
                          prefillSymptoms: log.symptoms,
                          prefillPatientId: log.patientId || undefined,
                        },
                      })
                    }
                    className="mt-4 bg-emerald-100 text-emerald-700 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-emerald-200 transition-colors inline-flex"
                  >
                    <BrainCircuit size={18} /> Analyze with AI
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
