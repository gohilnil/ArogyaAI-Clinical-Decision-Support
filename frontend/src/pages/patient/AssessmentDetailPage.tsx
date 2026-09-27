import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import type { User as FirebaseUser } from "firebase/auth";
import {
  ArrowLeft,
  Printer,
  AlertCircle,
  ClipboardCheck,
  Calendar,
  Leaf,
  Activity,
  FileText,
  Utensils,
  CloudSun,
  Sparkles,
  Link2Off,
} from "lucide-react";
import { usePatientData } from "../../hooks/usePatientData";
import { SectionCard } from "../../components/ui/SectionCard";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonLines } from "../../components/ui/Skeleton";
import { ExplanationPanel } from "../../components/patient/ExplanationPanel";
import { fullDate } from "../../lib/format";
import { CONFIDENCE_THRESHOLD } from "../../services/firestore";
import type { UserData } from "../../types";

/** A labelled detail row, used for the recorded context fields. */
function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | number | null;
}) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-start gap-3">
      <span className="text-slate-400 flex-shrink-0 mt-0.5" aria-hidden="true">
        {icon}
      </span>
      <div>
        <dt className="text-xs font-black uppercase tracking-widest text-slate-400">
          {label}
        </dt>
        <dd className="text-sm font-bold text-slate-700">{value}</dd>
      </div>
    </div>
  );
}

/**
 * One assessment, in full.
 *
 * This is where the model's real explanation is surfaced to the patient for the
 * first time: `explanation` is the per-feature contribution list the backend
 * computed when the analysis ran and stored verbatim on this record. It is
 * shown only when present — there is no placeholder implying an explanation
 * that the backend did not produce.
 *
 * The page is also print-friendly: the header controls carry `no-print` and the
 * content uses the print styles in index.css, so "Export PDF" produces a clean
 * record via the browser's own print-to-PDF.
 */
export default function AssessmentDetailPage({
  user,
  userData,
}: {
  user: FirebaseUser | null;
  userData: UserData | null;
}) {
  const { id } = useParams<{ id: string }>();
  const { patient, assessments, clinic, loading, error, reload } = usePatientData(
    user?.uid ?? null,
    userData,
  );

  const linked = Boolean(userData?.patientId);
  const assessment = assessments.find((a) => a.id === id) ?? null;
  const low = assessment ? assessment.confidence < CONFIDENCE_THRESHOLD : false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-6 p-6 md:p-10"
    >
      <div className="flex items-center justify-between gap-4 no-print">
        <Link
          to="/history"
          className="inline-flex items-center gap-2 text-slate-500 font-black text-sm hover:text-slate-800 transition-colors"
        >
          <ArrowLeft size={16} /> Back to history
        </Link>
        {assessment && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Printer size={16} />}
            onClick={() => window.print()}
          >
            Export PDF
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-red-50 border-2 border-red-200 text-red-800 p-5 rounded-2xl no-print">
          <AlertCircle size={20} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-black text-sm">We could not load this assessment</p>
            <p className="font-medium text-sm mt-1">{error}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={reload}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <Card className="p-8">
          <SkeletonLines count={5} />
        </Card>
      ) : !linked ? (
        <Card className="p-8">
          <EmptyState
            icon={<Link2Off size={40} />}
            title="Your record is not linked"
            description="Add your patient code in Settings to view your assessments."
            action={
              <Link to="/profile">
                <Button variant="secondary">Go to settings</Button>
              </Link>
            }
          />
        </Card>
      ) : !assessment ? (
        <Card className="p-8">
          <EmptyState
            icon={<ClipboardCheck size={40} />}
            title="Assessment not found"
            description="This assessment is not part of your record. It may have been opened from an old link."
            action={
              <Link to="/history">
                <Button variant="secondary">Back to history</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {/* The result banner. Printed first, so the exported record leads with
              the outcome rather than the metadata. */}
          <div
            className={`p-8 md:p-10 rounded-[2rem] text-white relative overflow-hidden print-shadow-none ${
              low ? "bg-orange-950" : "bg-slate-950"
            }`}
          >
            <div className="absolute -right-6 -bottom-6 opacity-10" aria-hidden="true">
              <Leaf size={160} />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 flex-wrap mb-4">
                <Badge tone={low ? "warning" : "success"}>
                  {low ? "Review required" : "Above confidence gate"}
                </Badge>
                <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                  <Calendar size={12} /> {fullDate(assessment.createdAt)}
                </span>
              </div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                Recorded result
              </p>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-4">
                {assessment.prediction}
              </h1>
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Model score
                  </p>
                  <p className="text-2xl font-black tabular-nums">
                    {assessment.confidence}%
                  </p>
                </div>
                <p className="text-xs font-medium text-slate-400 leading-relaxed max-w-xs">
                  This is the model's raw confidence value, not a probability
                  that the result is correct.
                </p>
              </div>
            </div>
          </div>

          <SectionCard
            title="What you reported"
            icon={<ClipboardCheck size={22} />}
            iconTone="bg-blue-100 text-blue-600"
          >
            <div className="space-y-5">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                  Symptoms
                </p>
                <p className="text-slate-700 font-medium leading-relaxed">
                  {assessment.symptoms}
                </p>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-5 border-t border-slate-100">
                <Detail icon={<Activity size={15} />} label="Prakriti (dosha)" value={assessment.dosha} />
                <Detail icon={<CloudSun size={15} />} label="Season / weather" value={[assessment.season, assessment.weather].filter(Boolean).join(" · ")} />
                <Detail icon={<Utensils size={15} />} label="Food habits" value={assessment.foodHabits} />
                <Detail icon={<Leaf size={15} />} label="Age / sex" value={[assessment.age, assessment.gender].filter(Boolean).join(" · ")} />
              </dl>
            </div>
          </SectionCard>

          {/* The real, stored per-feature explanation. Renders nothing when the
              assessment carries none. */}
          {assessment.explanation && (
            <SectionCard
              title="Model explanation"
              icon={<Sparkles size={22} />}
              iconTone="bg-purple-100 text-purple-600"
            >
              <ExplanationPanel explanation={assessment.explanation} />
            </SectionCard>
          )}

          {assessment.aiReport && (
            <SectionCard
              title="Ayurvedic context"
              icon={<FileText size={22} />}
              iconTone="bg-emerald-100 text-emerald-600"
              description="Generated context explaining the recorded result. It does not re-diagnose."
            >
              <div className="text-slate-700 font-medium leading-relaxed whitespace-pre-wrap text-sm">
                {assessment.aiReport}
              </div>
            </SectionCard>
          )}

          <div className="bg-amber-50 border-2 border-amber-200 rounded-[2rem] p-6 print-shadow-none">
            <div className="flex gap-3">
              <AlertCircle
                size={20}
                className="text-amber-600 flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <p className="font-black text-amber-900 text-sm">
                  Decision support, not diagnosis
                </p>
                <p className="text-amber-800 font-medium text-xs mt-1 leading-relaxed">
                  This is a model output recorded by your practitioner, not a
                  medical diagnosis or prescription. Discuss it with your
                  practitioner before acting on it.
                </p>
              </div>
            </div>
          </div>

          {/* Printed provenance line: which clinic and patient the record
              belongs to, so a printed copy is self-identifying. */}
          <div className="hidden print:block text-xs text-slate-500 pt-4 border-t border-slate-200">
            <p>
              ArogyaAI record — {patient?.name || "Patient"}
              {clinic?.name ? ` · ${clinic.name}` : ""}
              {userData?.clinicId ? ` (Clinic ID ${userData.clinicId})` : ""}
            </p>
          </div>
        </>
      )}
    </motion.div>
  );
}
