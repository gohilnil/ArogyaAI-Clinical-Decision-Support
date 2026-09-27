// A short, genuinely-derived "what to do next" list.
//
// Every item is computed from state the account actually has — no step is shown
// as done, and none is invented. It disappears entirely once nothing is
// outstanding, so a settled account is not nagged by a permanent checklist.

import { Link } from "react-router-dom";
import { CheckCircle2, Circle, ArrowRight, Compass } from "lucide-react";

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
  if (linked && hasAssessments) {
    steps.push({
      label: "Read your latest assessment",
      description:
        "See the recorded result, what the model found most relevant, and your practitioner's notes.",
      to: "/history",
      cta: "View history",
    });
  }

  if (steps.length === 0) return null;

  return (
    <div className="bg-slate-950 rounded-[2rem] p-6 md:p-8 text-white">
      <div className="flex items-center gap-3 mb-6">
        <span className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
          <Compass size={22} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-black">Getting started</h2>
          <p className="text-slate-400 font-medium text-sm">
            A few things to set up your health record.
          </p>
        </div>
      </div>
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
              {step.cta} <ArrowRight size={14} />
            </Link>
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-2 text-emerald-400 font-bold text-xs mt-5">
        <CheckCircle2 size={14} aria-hidden="true" /> Your data is private to you
        and your clinic.
      </p>
    </div>
  );
}
