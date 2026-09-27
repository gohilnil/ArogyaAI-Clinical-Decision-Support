import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  HeartPulse,
  ClipboardCheck,
  MessageSquare,
  CalendarClock,
  Building,
  MapPin,
  Phone,
  ArrowRight,
  PlusCircle,
  AlertCircle,
  History,
} from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import { usePatientData } from "../hooks/usePatientData";
import { StatTile } from "../components/ui/StatTile";
import { SectionCard } from "../components/ui/SectionCard";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { Skeleton, SkeletonLines } from "../components/ui/Skeleton";
import { Badge } from "../components/ui/Badge";
import { NextSteps } from "../components/patient/NextSteps";
import { LoggingStrip } from "../components/patient/LoggingStrip";
import { ActivityTimeline } from "../components/patient/ActivityTimeline";
import { relativeTime, dateOnly } from "../lib/format";
import type { UserData } from "../types";

// --- PATIENT DASHBOARD ---
// The account's own hub. Every figure is computed from the records this account
// can actually read — its own patient doc, that patient's assessments, its own
// diary entries, and its own clinic doc. Nothing here is a placeholder, and a
// failed load blanks the figures and offers a retry rather than showing zeros
// that would read as "you have no records".
export default function PatientDashboard({
  user,
  userData,
}: {
  user: FirebaseUser | null;
  userData: UserData | null;
}) {
  const { patient, assessments, logs, clinic, loading, error, reload } =
    usePatientData(user?.uid ?? null, userData);

  const linked = Boolean(userData?.patientId);
  const displayName = patient?.name || user?.email?.split("@")[0] || "there";

  const lastAssessment = assessments[0] ?? null;
  const lastLog = logs[0] ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-8 p-6 md:p-10"
    >
      <PageHeader
        title={`Hello, ${displayName}.`}
        subtitle="Your personal Ayurvedic health portal."
        actions={
          <Link to="/checkup">
            <Button icon={<PlusCircle size={18} />} variant="success">
              Log symptoms
            </Button>
          </Link>
        }
      />

      {error && (
        <div className="flex items-start gap-3 bg-red-50 border-2 border-red-200 text-red-800 p-5 rounded-2xl">
          <AlertCircle size={20} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-black text-sm">We could not load your records</p>
            <p className="font-medium text-sm mt-1">{error}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={reload}>
            Retry
          </Button>
        </div>
      )}

      {/* Figures from the patient's own data. While loading we render the tiles
          with a placeholder rather than a zero, so a slow fetch is never read as
          "you have nothing". */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              label="Diary entries"
              value={logs.length}
              icon={<MessageSquare size={20} />}
              tone="bg-emerald-100 text-emerald-600"
            />
            <StatTile
              label="Assessments"
              value={linked ? assessments.length : "—"}
              icon={<ClipboardCheck size={20} />}
              tone="bg-blue-100 text-blue-600"
              note={linked ? undefined : "Link your record to see these"}
            />
            <StatTile
              label="Last entry"
              value={lastLog ? relativeTime(lastLog.createdAt) : "None yet"}
              icon={<CalendarClock size={20} />}
              tone="bg-amber-100 text-amber-600"
            />
            <StatTile
              label="Last assessment"
              value={lastAssessment ? dateOnly(lastAssessment.createdAt) : "—"}
              icon={<History size={20} />}
              tone="bg-purple-100 text-purple-600"
              note={lastAssessment ? undefined : linked ? "None recorded yet" : undefined}
            />
          </div>
        )
      )}

      {/* Derived onboarding checklist — disappears when nothing is outstanding. */}
      {!loading && !error && (
        <NextSteps
          linked={linked}
          hasLogs={logs.length > 0}
          hasAssessments={assessments.length > 0}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard
            title="Recent activity"
            icon={<HeartPulse size={22} />}
            description="Your assessments and diary entries, newest first."
            actions={
              linked && assessments.length > 0 ? (
                <Link
                  to="/history"
                  className="inline-flex items-center gap-1 text-emerald-600 font-black text-sm hover:text-emerald-700"
                >
                  View all <ArrowRight size={14} />
                </Link>
              ) : undefined
            }
          >
            {loading ? (
              <SkeletonLines count={3} />
            ) : error ? (
              <p className="text-slate-400 font-bold text-sm">
                Activity is unavailable while your records could not be loaded.
              </p>
            ) : (
              <ActivityTimeline
                assessments={assessments}
                logs={logs}
                limit={6}
              />
            )}
          </SectionCard>

          <SectionCard
            title="Diary activity"
            icon={<MessageSquare size={22} />}
            description="Days you recorded how you were feeling."
            actions={
              <Link
                to="/checkup"
                className="inline-flex items-center gap-1 text-emerald-600 font-black text-sm hover:text-emerald-700"
              >
                Open diary <ArrowRight size={14} />
              </Link>
            }
          >
            {loading ? <Skeleton className="h-28" /> : <LoggingStrip logs={logs} />}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            title="Your clinic"
            icon={<Building size={22} />}
            description={
              linked
                ? "Where your records are held."
                : "Your account is registered to this clinic."
            }
          >
            {loading ? (
              <SkeletonLines count={3} />
            ) : clinic ? (
              <div className="space-y-3">
                <p className="text-lg font-black text-slate-900">{clinic.name}</p>
                {clinic.type && (
                  <Badge tone="neutral">{clinic.type}</Badge>
                )}
                <dl className="space-y-2 text-sm pt-2">
                  {(clinic.addressLine1 || clinic.city) && (
                    <div className="flex items-start gap-2">
                      <MapPin
                        size={15}
                        className="text-slate-400 flex-shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <dd className="font-medium text-slate-600">
                        {[clinic.addressLine1, clinic.city, clinic.state, clinic.postalCode]
                          .filter(Boolean)
                          .join(", ")}
                      </dd>
                    </div>
                  )}
                  {clinic.phone && (
                    <div className="flex items-start gap-2">
                      <Phone
                        size={15}
                        className="text-slate-400 flex-shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <dd className="font-medium text-slate-600">{clinic.phone}</dd>
                    </div>
                  )}
                </dl>
                <p className="text-xs font-bold text-slate-400 font-mono pt-1">
                  Clinic ID: {userData?.clinicId}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-500">
                  Your clinic has not recorded its contact details yet.
                </p>
                <p className="text-xs font-bold text-slate-400 font-mono">
                  Clinic ID: {userData?.clinicId}
                </p>
              </div>
            )}
          </SectionCard>

          <Card className="p-6">
            <h3 className="font-black text-slate-900 mb-2">
              {linked ? "Your record is linked" : "Link your record"}
            </h3>
            <p className="text-slate-500 font-medium text-sm leading-relaxed">
              {linked
                ? "Your account is connected to your health record, so your assessment history is available here."
                : "Enter the patient code from your practitioner to unlock your assessment history."}
            </p>
            {!linked && (
              <Link to="/profile" className="block mt-4">
                <Button variant="secondary" fullWidth>
                  Add patient code
                </Button>
              </Link>
            )}
          </Card>
        </div>
      </div>

      <p className="text-xs font-medium text-slate-400 leading-relaxed max-w-3xl">
        ArogyaAI produces probabilistic model outputs and generated context to
        support clinical judgement. It is not a diagnostic device, and nothing
        here should be treated as a diagnosis or a prescription. Discuss anything
        you see here with your practitioner before acting on it.
      </p>
    </motion.div>
  );
}
