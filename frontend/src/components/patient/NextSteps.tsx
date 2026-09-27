// A short, genuinely-derived "what to do next" list.
//
// Every item is computed from state the account actually has. Two shapes are
// possible and both are honest:
//   * outstanding steps, each linking to the action that clears it, and
//   * a completed list, when the account has done the setup work.
//
// The previous version rendered only the outstanding steps, so the moment a
// patient finished them the whole panel vanished without acknowledgement — a
// section that simply disappears reads as a bug rather than as success. When
// everything is done the panel now says so and then gets out of the way.

import { Link } from "react-router-dom";
import { CheckCircle2, Circle, ArrowRight, Compass, PartyPopper } from "lucide-react";

interface Step {
  label: string;
  description: string;
  to: string;
  cta: string;
}

export function NextSteps({
  linked,
  hasLogs,
  hasAssessments,
}: {
  linked: boolean;
  hasLogs: boolean;
  hasAssessments: boolean;
}) {
  // Setup steps the account can actually COMPLETE. Whether a checklist reads as
  // finished must depend only on this list, or "all set" is unreachable.
  const steps: Step[] = [];
  if (!linked) {
    steps.push({
      label: "Link your health record",
      description:
        "Enter the patient code your practitioner gave you to unlock your assessment history.",
      to: "/profile",
      cta: "Go to settings",
    });
  }
  if (!hasLogs) {
    steps.push({
      label: "Log how you are feeling",
      description:
        "Your symptom diary reaches your clinic straight away and builds a record over time.",
      to: "/checkup",
      cta: "Open the diary",
    });
  }

  // An optional nudge, NOT a setup step. Reading your latest assessment is not
  // a task that completes — it stays relevant forever — so it is shown
  // alongside the checklist and deliberately does not hold the panel open.
  const showHistoryNudge = linked && hasAssessments;

  const allDone = steps.length === 0;

  return (
    <div className="bg-slate-950 rounded-[2rem] p-6 md:p-8 text-white">
      <div className="flex items-center gap-3 mb-6">
        <span className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
          {allDone ? (
            <PartyPopper size={22} aria-hidden="true" />
          ) : (
            <Compass size={22} aria-hidden="true" />
          )}
        </span>
        <div>
          <h2 className="text-xl font-black">
            {allDone ? "You're all set" : "Getting started"}
          </h2>
          <p className="text-slate-400 font-medium text-sm">
            {allDone
              ? "Your portal is set up. Keep logging to build your record."
              : "A few things to set up your health record."}
          </p>
        </div>
      </div>

      {allDone ? (
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          <li className="flex items-center gap-2 text-sm font-bold text-slate-300">
            <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" />
            Record linked
          </li>
          <li className="flex items-center gap-2 text-sm font-bold text-slate-300">
            <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" />
            Diary started
          </li>
          {hasAssessments && (
            <li className="flex items-center gap-2 text-sm font-bold text-slate-300">
              <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" />
              History available
            </li>
          )}
        </ul>
      ) : (
        <ul className="space-y-3">
          {steps.map((step) => (
            <li
              key={step.label}
              className="flex items-start gap-4 bg-white/5 rounded-2xl p-4"
            >
              <Circle
                size={20}
                className="text-slate-500 flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm">{step.label}</p>
                <p className="text-slate-400 font-medium text-xs mt-1 leading-relaxed">
                  {step.description}
                </p>
              </div>
              <Link
                to={step.to}
                className="flex-shrink-0 inline-flex items-center gap-1 text-emerald-400 font-black text-xs hover:text-emerald-300 transition-colors self-center"
              >
                {step.cta} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* The standing nudge, shown whether or not setup is complete. */}
      {showHistoryNudge && (
        <Link
          to="/history"
          className="mt-4 flex items-center justify-between gap-4 bg-white/5 hover:bg-white/10 rounded-2xl p-4 transition-colors group"
        >
          <div className="min-w-0">
            <p className="font-black text-sm">Review your health history</p>
            <p className="text-slate-400 font-medium text-xs mt-1 leading-relaxed">
              See each recorded result and what the model found most relevant.
            </p>
          </div>
          <ArrowRight
            size={16}
            className="text-emerald-400 flex-shrink-0 group-hover:translate-x-0.5 transition-transform"
            aria-hidden="true"
          />
        </Link>
      )}

      <p className="flex items-center gap-2 text-emerald-400 font-bold text-xs mt-5">
        <CheckCircle2 size={14} aria-hidden="true" /> Your data is private to you
        and your clinic.
      </p>
    </div>
  );
}
