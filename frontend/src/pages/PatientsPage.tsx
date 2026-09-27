import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ActivitySquare,
  MessageSquare,
  Calendar,
  BrainCircuit,
  ChevronRight,
  ChevronLeft,
  Search,
  X,
  ArrowUpDown,
  Users,
  ClipboardList,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  listClinicAssessments,
  listClinicLogs,
  listPatients,
} from "../services/firestore";
import { fullDate, relativeTime } from "../lib/format";
import { StatTile } from "../components/ui/StatTile";
import type {
  Assessment,
  FirestoreTimestamp,
  Patient,
  PatientLog,
  UserData,
} from "../types";

/** A patient's row summary, computed from their clinical events. */
interface PatientSummary {
  latest: Assessment | null;
  count: number;
  lastAt: FirestoreTimestamp | undefined;
}

type SortKey = "recent" | "name" | "visits";
type DiaryFilter = "all" | "linked" | "unlinked";

/** How many rows one page of the patients list shows. */
const PAGE_SIZE = 12;

// --- CLOUD-CONNECTED PATIENT RECORDS ---
// Lists PEOPLE, each summarised by their most recent clinical event — not one
// row per diagnosis. Clicking a patient opens their full assessment history.
export default function PatientRecords({ userData }: { userData: UserData | null }) {
  const [activeTab, setActiveTab] = useState<"patients" | "diaries">("patients");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [patientLogs, setPatientLogs] = useState<PatientLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [diaryFilter, setDiaryFilter] = useState<DiaryFilter>("all");
  /** 1-based page of the patients table. Reset whenever the result set
   *  changes shape underneath it, so the view can never sit on a page that
   *  the current filters no longer have. */
  const [page, setPage] = useState(1);

  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
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
        if (cancelled) return;
        setPatients(pts);
        setAssessments(asmts);
        setPatientLogs(logs);
      } catch (e) {
        if (cancelled) return;
        console.error("Error fetching records:", e);
        // A failed load must not read as an empty clinic.
        setPatients([]);
        setAssessments([]);
        setPatientLogs([]);
        setError("Could not load clinic records. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [userData, reloadToken]);

  // assessments arrive newest-first, so the first one seen for a patient is
  // their latest. Counting is done here rather than stored on the patient, so
  // the summary can never drift from the underlying events.
  const byPatient = useMemo(() => {
    const map = new Map<string, PatientSummary>();
    for (const a of assessments) {
      const existing = map.get(a.patientId);
      if (existing) existing.count += 1;
      else {
        map.set(a.patientId, {
          latest: a,
          count: 1,
          lastAt: a.createdAt,
        });
      }
    }
    return map;
  }, [assessments]);

  const patientById = useMemo(() => {
    const map = new Map<string, Patient>();
    for (const p of patients) map.set(p.id, p);
    return map;
  }, [patients]);

  /**
   * Search matches the name, and also age/sex, so "58" or "male" finds a person
   * when the practitioner remembers the detail but not the spelling.
   */
  const visiblePatients = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? patients.filter((p) =>
          [p.name, p.age, p.gender, p.dosha, p.email]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(term)),
        )
      : patients;

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "name") return (a.name || "").localeCompare(b.name || "");
      if (sort === "visits") {
        return (byPatient.get(b.id)?.count ?? 0) - (byPatient.get(a.id)?.count ?? 0);
      }
      // "recent": most newly assessed first; never-assessed last, newest
      // registrations first among themselves, so the list stays useful.
      const at = byPatient.get(a.id)?.lastAt?.toMillis?.() ?? 0;
      const bt = byPatient.get(b.id)?.lastAt?.toMillis?.() ?? 0;
      if (at !== bt) return bt - at;
      return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
    });
    return sorted;
  }, [patients, search, sort, byPatient]);

  const visibleLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return patientLogs.filter((log) => {
      if (diaryFilter === "linked" && !log.patientId) return false;
      if (diaryFilter === "unlinked" && log.patientId) return false;
      if (!term) return true;
      const patientName = log.patientId
        ? patientById.get(log.patientId)?.name || ""
        : "";
      return [log.symptoms, log.email, patientName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [patientLogs, diaryFilter, search, patientById]);

  const stats = useMemo(() => {
    const withRecords = patients.filter((p) => byPatient.has(p.id)).length;
    return {
      total: patients.length,
      withRecords,
      awaiting: patients.length - withRecords,
      diaries: patientLogs.length,
      unlinkedDiaries: patientLogs.filter((l) => !l.patientId).length,
    };
  }, [patients, byPatient, patientLogs]);

  // --- paging -------------------------------------------------------------
  // The list used to render every patient at once. That is fine at a demo
  // scale and wrong at a real one: a clinic with a few hundred people would
  // paint every row on every keystroke of the search box. Paging is applied to
  // the FILTERED list, so the page count follows the search rather than the
  // whole clinic.
  const totalPages = Math.max(1, Math.ceil(visiblePatients.length / PAGE_SIZE));

  useEffect(() => {
    // A filter, sort or search change can leave the view past the last page.
    // Clamping here means the table never renders empty while results exist.
    setPage(1);
  }, [search, sort, activeTab]);

  const pagePatients = useMemo(
    () => visiblePatients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [visiblePatients, page],
  );

  const openPatient = (id: string) => navigate(`/patients/${id}`);

  const analyze = (log: PatientLog) =>
    navigate("/diagnose", {
      state: {
        prefillSymptoms: log.symptoms,
        prefillPatientId: log.patientId || undefined,
      },
    });

  /** The tiles render "…" while loading and "—" on a failed load, never a
   *  misleading zero — a request that failed is not an empty clinic. */
  const show = (v: number) => (loading ? "…" : error ? "—" : String(v));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-8 p-6 md:p-10"
    >
      <div>
        <h1 className="text-4xl font-black text-slate-950 tracking-tighter mb-2">
          Patient Records
        </h1>
        <p className="text-slate-500 font-medium text-lg">
          Secure clinical history for Clinic ID{" "}
          <strong className="font-mono text-slate-700">
            {userData?.clinicId || "—"}
          </strong>
          .
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Patients"
          value={show(stats.total)}
          icon={<Users size={22} />}
          tone="bg-emerald-100 text-emerald-600"
        />
        <StatTile
          label="With records"
          value={show(stats.withRecords)}
          icon={<ClipboardList size={22} />}
          tone="bg-indigo-100 text-indigo-600"
        />
        <StatTile
          label="Awaiting first visit"
          value={show(stats.awaiting)}
          icon={<AlertCircle size={22} />}
          tone="bg-amber-100 text-amber-600"
        />
        <StatTile
          label="Diary entries"
          value={show(stats.diaries)}
          icon={<MessageSquare size={22} />}
          tone="bg-blue-100 text-blue-600"
          note={
            stats.unlinkedDiaries > 0
              ? `${stats.unlinkedDiaries} not linked to a record`
              : undefined
          }
        />
      </div>

      {/* Tabs, search and sort live together so the whole page reads as one
          control surface rather than three stacked widgets. */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 border-b-2 border-slate-200/60 pb-4">
        <div
          role="tablist"
          aria-label="Patient records views"
          className="flex gap-2"
        >
          <button
            role="tab"
            aria-selected={activeTab === "patients"}
            onClick={() => setActiveTab("patients")}
            className={`px-5 py-3 rounded-full font-bold text-sm flex items-center gap-2 transition-all ${activeTab === "patients" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
          >
            <ActivitySquare size={18} /> Patients
            <span className="ml-1 text-xs opacity-70">{patients.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "diaries"}
            onClick={() => setActiveTab("diaries")}
            className={`px-5 py-3 rounded-full font-bold text-sm flex items-center gap-2 transition-all ${activeTab === "diaries" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
          >
            <MessageSquare size={18} /> Health Diaries
            <span className="ml-1 text-xs opacity-70">{patientLogs.length}</span>
          </button>
        </div>

        <div className="flex-1 flex flex-col sm:flex-row gap-3 lg:justify-end">
          <div className="relative sm:max-w-xs w-full">
            <Search
              size={18}
              className="absolute left-4 top-3.5 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={
                activeTab === "patients"
                  ? "Search patients"
                  : "Search health diaries"
              }
              placeholder={
                activeTab === "patients" ? "Search patients…" : "Search entries…"
              }
              className="w-full pl-11 pr-10 py-3 rounded-2xl border-2 border-slate-200 focus:border-emerald-500 outline-none font-bold text-sm bg-white"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {activeTab === "patients" ? (
            <div className="relative">
              <ArrowUpDown
                size={16}
                className="absolute left-3.5 top-3.5 text-slate-400 pointer-events-none"
                aria-hidden="true"
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort patients"
                className="pl-9 pr-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-emerald-500 outline-none font-bold text-sm bg-white cursor-pointer"
              >
                <option value="recent">Most recent activity</option>
                <option value="name">Name (A–Z)</option>
                <option value="visits">Most visits</option>
              </select>
            </div>
          ) : (
            <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl">
              {(["all", "linked", "unlinked"] as DiaryFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setDiaryFilter(f)}
                  aria-pressed={diaryFilter === f}
                  className={`px-4 py-2 rounded-xl font-bold text-xs capitalize transition-all ${diaryFilter === f ? "bg-white shadow-sm text-emerald-700" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-6 bg-red-100 text-red-700 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-black">{error}</p>
            <p className="text-sm font-semibold text-red-600/80 mt-1">
              The lists below are unavailable, not empty.
            </p>
          </div>
          <button
            onClick={() => setReloadToken((n) => n + 1)}
            disabled={loading}
            className="bg-red-700 text-white px-6 py-3 rounded-xl font-black text-sm hover:bg-red-800 disabled:opacity-60 flex items-center gap-2 flex-shrink-0"
          >
            <RefreshCw size={16} /> {loading ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3" aria-busy="true" aria-live="polite">
            <p className="text-slate-400 font-bold text-sm px-2 pb-2">
              Loading secure records from cloud…
            </p>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-2xl bg-slate-100 animate-pulse"
              />
            ))}
          </div>
        ) : activeTab === "patients" ? (
          visiblePatients.length === 0 ? (
            <div className="p-12 text-center">
              <Users size={44} className="mx-auto mb-4 text-slate-300" />
              <p className="text-slate-600 font-black text-lg">
                {patients.length === 0
                  ? "No patients registered for this clinic yet."
                  : "No patients match your search."}
              </p>
              <p className="text-slate-400 font-medium text-sm mt-2 max-w-md mx-auto">
                {patients.length === 0
                  ? "Run an analysis from the AI Diagnostic tool and save it to create the first patient record."
                  : "Try a different name, age or sex."}
              </p>
              {patients.length === 0 ? (
                <button
                  onClick={() => navigate("/diagnose")}
                  className="mt-6 bg-slate-950 text-white px-6 py-3 rounded-full font-black text-sm inline-flex items-center gap-2 hover:bg-slate-800"
                >
                  <BrainCircuit size={18} /> Open AI Diagnostic
                </button>
              ) : (
                <button
                  onClick={() => setSearch("")}
                  className="mt-6 bg-slate-100 text-slate-700 px-6 py-3 rounded-full font-black text-sm hover:bg-slate-200"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[860px]">
                  <thead className="bg-slate-50 border-b border-slate-200/60">
                    <tr>
                      {[
                        "Patient",
                        "Profile",
                        "Prakriti",
                        "Latest assessment",
                        "Visits",
                        "",
                      ].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="p-5 font-black text-slate-400 text-xs uppercase tracking-widest"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagePatients.map((pt) => {
                      const summary = byPatient.get(pt.id);
                      const hasRecord = Boolean(summary);
                      return (
                        <tr
                          key={pt.id}
                          onClick={() => openPatient(pt.id)}
                          className="hover:bg-slate-50 transition-colors cursor-pointer group"
                        >
                          <td className="p-5">
                            {/* A real button carries the interaction for keyboard
                                and screen-reader users; the row click above is
                                the mouse convenience on top of it. */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openPatient(pt.id);
                              }}
                              className="flex items-center gap-3 text-left"
                            >
                              <span className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black flex-shrink-0">
                                {(pt.name || "?").charAt(0).toUpperCase()}
                              </span>
                              <span>
                                <span className="block font-black text-slate-900 group-hover:text-emerald-700 transition-colors">
                                  {pt.name || "Unnamed patient"}
                                </span>
                                <span className="block text-xs font-bold text-slate-400">
                                  {relativeTime(summary?.lastAt ?? pt.createdAt)}
                                </span>
                              </span>
                            </button>
                          </td>
                          <td className="p-5 font-bold text-slate-600">
                            {pt.age ? `${pt.age}y` : "—"} · {pt.gender || "—"}
                          </td>
                          <td className="p-5">
                            <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-bold border border-slate-200">
                              {(pt.dosha || "Unknown").split(" ")[0]}
                            </span>
                          </td>
                          <td className="p-5">
                            {hasRecord && summary?.latest ? (
                              <span className="flex flex-col">
                                <span className="font-bold text-emerald-600">
                                  {summary.latest.prediction}
                                </span>
                                <span className="text-xs font-semibold text-slate-400">
                                  model score {summary.latest.confidence}%
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-400 font-bold text-sm">
                                No assessments yet
                              </span>
                            )}
                          </td>
                          <td className="p-5">
                            <span
                              className={`inline-flex items-center justify-center min-w-9 h-9 px-2 rounded-xl font-black text-sm ${hasRecord ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-50 text-slate-400 border border-slate-200"}`}
                            >
                              {summary?.count ?? 0}
                            </span>
                          </td>
                          <td className="p-5 text-slate-300 group-hover:text-emerald-500 transition-colors">
                            <ChevronRight size={20} aria-hidden="true" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paging controls. Shown only when there is more than one page,
                  so a small clinic never sees furniture it cannot use. */}
              {totalPages > 1 && (
                <div className="px-5 py-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs font-black text-slate-500">
                    Showing{" "}
                    <span className="text-slate-700">
                      {(page - 1) * PAGE_SIZE + 1}–
                      {Math.min(page * PAGE_SIZE, visiblePatients.length)}
                    </span>{" "}
                    of {visiblePatients.length} patient
                    {visiblePatients.length === 1 ? "" : "s"}
                    {search ? " matching your search" : ""}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      aria-label="Previous page of patients"
                      className="px-4 py-2 rounded-xl border-2 border-slate-200 font-black text-sm disabled:opacity-40 flex items-center gap-1.5 hover:border-emerald-300 transition-colors"
                    >
                      <ChevronLeft size={15} /> Prev
                    </button>
                    <span className="text-xs font-black text-slate-500 tabular-nums px-1">
                      {page} / {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      aria-label="Next page of patients"
                      className="px-4 py-2 rounded-xl border-2 border-slate-200 font-black text-sm disabled:opacity-40 flex items-center gap-1.5 hover:border-emerald-300 transition-colors"
                    >
                      Next <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              )}

              <p className="px-5 pb-6 pt-4 text-xs font-medium text-slate-400 leading-relaxed">
                Predictions are model outputs recorded at the time of each visit,
                and the percentage is the model's raw score, not a probability
                that the result is correct. They are decision support for review,
                not diagnoses.
              </p>
            </>
          )
        ) : visibleLogs.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare size={44} className="mx-auto mb-4 text-slate-300" />
            <p className="text-slate-600 font-black text-lg">
              {patientLogs.length === 0
                ? "No patient diaries have been submitted yet."
                : "No entries match your filters."}
            </p>
            <p className="text-slate-400 font-medium text-sm mt-2 max-w-md mx-auto">
              {patientLogs.length === 0
                ? "Patients can log how they feel from their own portal; entries appear here for review."
                : "Try clearing the search or switching the filter."}
            </p>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {visibleLogs.map((log) => {
              const patient = log.patientId
                ? patientById.get(log.patientId)
                : undefined;
              // Prefer the patient's real name over the sign-in email: the
              // clinician is reviewing a person, not an account.
              const title = patient?.name || log.email || "Patient";
              const linked = Boolean(log.patientId);
              return (
                <div
                  key={log.id}
                  className="bg-slate-50 border border-slate-100 p-5 md:p-6 rounded-3xl flex flex-col md:flex-row gap-5"
                >
                  <div
                    className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-black ${linked ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-600"}`}
                  >
                    {title.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <h4 className="font-black text-slate-900 truncate">
                        {title}
                      </h4>
                      {linked ? (
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md">
                          Linked record
                        </span>
                      ) : (
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 px-2 py-1 rounded-md">
                          No linked record
                        </span>
                      )}
                      <span
                        className="text-xs font-bold text-slate-400 flex items-center gap-1 bg-white px-3 py-1 rounded-full border border-slate-200 ml-auto"
                        title={fullDate(log.createdAt)}
                      >
                        <Calendar size={12} /> {relativeTime(log.createdAt)}
                      </span>
                    </div>

                    <p className="text-slate-600 font-medium leading-relaxed bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                      “{log.symptoms}”
                    </p>

                    {!linked && (
                      <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        This entry is not attached to a patient record, so the
                        analysis will start without patient details. The patient
                        can attach it by linking their account, or you can pick
                        the patient manually.
                      </p>
                    )}

                    <button
                      onClick={() => analyze(log)}
                      className="bg-emerald-100 text-emerald-700 px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-emerald-200 transition-colors"
                    >
                      <BrainCircuit size={18} /> Analyze with AI
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
