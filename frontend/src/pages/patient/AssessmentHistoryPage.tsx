import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { User as FirebaseUser } from "firebase/auth";
import {
  ClipboardCheck,
  Calendar,
  ArrowRight,
  Search,
  AlertCircle,
  Link2Off,
  Stethoscope,
} from "lucide-react";
import { usePatientData } from "../../hooks/usePatientData";
import { PageHeader } from "../../components/ui/PageHeader";
import { SectionCard } from "../../components/ui/SectionCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonLines } from "../../components/ui/Skeleton";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { dateOnly } from "../../lib/format";
import { CONFIDENCE_THRESHOLD } from "../../services/firestore";
import type { Assessment, UserData } from "../../types";

/**
 * The patient's full assessment history, searchable.
 *
 * Every row is read from the assessments subcollection of the ONE patient
 * record this account is linked to. The low-confidence rows are labelled the
 * same way here as on the clinician side, because the stored `prediction` is
 * already the neutralised label in that case — the history never presents an
 * unreliable guess as a finding.
 */
export default function AssessmentHistoryPage({
  user,
  userData,
}: {
  user: FirebaseUser | null;
  userData: UserData | null;
}) {
  const { assessments, loading, error, reload } = usePatientData(
    user?.uid ?? null,
    userData,
  );
  const [search, setSearch] = useState("");

  const linked = Boolean(userData?.patientId);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assessments;
    return assessments.filter(
      (a) =>
        a.prediction.toLowerCase().includes(q) ||
        a.symptoms.toLowerCase().includes(q),
    );
  }, [assessments, search]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto space-y-8 p-6 md:p-10"
    >
      <PageHeader
        title="Health History"
        subtitle="Every assessment recorded for you, newest first."
      />

      {error && (
        <div className="flex items-start gap-3 bg-red-50 border-2 border-red-200 text-red-800 p-5 rounded-2xl">
          <AlertCircle size={20} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-black text-sm">We could not load your history</p>
            <p className="font-medium text-sm mt-1">{error}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={reload}>
            Retry
          </Button>
        </div>
      )}

      {!linked ? (
        <SectionCard
          title="Your record is not linked"
          icon={<Link2Off size={22} />}
          iconTone="bg-amber-100 text-amber-600"
        >
          <EmptyState
            icon={<Stethoscope size={40} />}
            title="No history to show yet"
            description="Once your practitioner gives you a patient code, add it in Settings to see your assessments here."
            action={
              <Link to="/profile">
                <Button variant="secondary">Go to settings</Button>
              </Link>
            }
          />
        </SectionCard>
      ) : (
        <SectionCard
          title="Assessments"
          icon={<ClipboardCheck size={22} />}
          description={
            loading
              ? "Loading your records…"
              : `${assessments.length} on record`
          }
          actions={
            assessments.length > 0 ? (
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search condition or symptom"
                  aria-label="Search your assessments"
                  className="pl-9 py-2.5 text-sm w-full sm:w-72"
                />
              </div>
            ) : undefined
          }
        >
          {loading ? (
            <SkeletonLines count={4} />
          ) : assessments.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck size={40} />}
              title="No assessments yet"
              description="Your practitioner has not recorded an assessment for you. Log your symptoms in the diary to keep a record in the meantime."
              action={
                <Link to="/checkup">
                  <Button variant="secondary">Open the diary</Button>
                </Link>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Search size={36} />}
              title="No matches"
              description={`Nothing in your history matches “${search.trim()}”.`}
              action={
                <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {filtered.map((a: Assessment) => {
                const low = a.confidence < CONFIDENCE_THRESHOLD;
                return (
                  <li key={a.id}>
                    <Link
                      to={`/assessment/${a.id}`}
                      className="flex items-start gap-4 bg-slate-50 hover:bg-emerald-50/60 p-5 rounded-2xl border border-slate-100 hover:border-emerald-200 transition-colors group"
                    >
                      <span
                        className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          low
                            ? "bg-orange-100 text-orange-600"
                            : "bg-blue-100 text-blue-600"
                        }`}
                        aria-hidden="true"
                      >
                        <ClipboardCheck size={20} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                            <Calendar size={11} /> {dateOnly(a.createdAt)}
                          </span>
                          <Badge tone={low ? "warning" : "info"}>
                            {a.confidence}% model score
                          </Badge>
                          {a.explanation && (
                            <Badge tone="purple">Explanation available</Badge>
                          )}
                        </div>
                        <p className="text-sm font-black text-slate-800">
                          {a.prediction}
                        </p>
                        <p className="text-xs font-medium text-slate-500 mt-0.5 line-clamp-2">
                          {a.symptoms}
                        </p>
                      </div>
                      <ArrowRight
                        size={16}
                        className="text-slate-300 group-hover:text-emerald-500 transition-colors flex-shrink-0 mt-2"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {assessments.length > 0 && !loading && (
            <p className="text-xs font-medium text-slate-400 leading-relaxed pt-5 mt-5 border-t border-slate-100">
              These are model outputs recorded by your practitioner, not medical
              diagnoses. The score is the model's raw confidence value, not a
              probability that the result is correct. Discuss anything here with
              your practitioner before acting on it.
            </p>
          )}
        </SectionCard>
      )}
    </motion.div>
  );
}
