// Renders the model's OWN per-feature contributions for an assessment.
//
// This is not a narrative and not an approximation: `explanation.features` is
// the ranked list the backend computed from the deployed linear model's
// coefficients (see backend/ml/explainability.py), stored verbatim when the
// assessment was created. The bars are scaled by the largest absolute
// contribution present, so they show relative weight within THIS result.
//
// When an assessment carries no explanation, this renders nothing. It never
// substitutes a placeholder that would imply an explanation exists.

import { Sparkles, TrendingUp, TrendingDown, Info } from "lucide-react";
import type { PredictExplanation } from "../../types";

/** Human labels for the model's feature keys. Falls back to the raw key, which
 *  is preferable to hiding a contribution the model actually used. */
const FEATURE_LABELS: Record<string, string> = {
  symptoms: "Reported symptoms",
  age: "Age",
  gender: "Sex",
  height_cm: "Height",
  weight_kg: "Weight",
  bmi: "Body mass index",
  dosha: "Prakriti (dosha)",
  season: "Season",
  weather: "Weather",
  food_habits: "Food habits",
};

function label(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

export function ExplanationPanel({
  explanation,
}: {
  explanation: PredictExplanation | undefined;
}) {
  if (!explanation || explanation.features.length === 0) return null;

  const maxAbs = Math.max(
    ...explanation.features.map((f) => Math.abs(f.contribution)),
    0.000001,
  );

  const shown = explanation.features.slice(0, 8);

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <span
          className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0"
          aria-hidden="true"
        >
          <Sparkles size={22} />
        </span>
        <div>
          <h3 className="text-xl font-black text-slate-900">
            What drove this result
          </h3>
          <p className="text-slate-500 font-medium text-sm">
            The factors the model weighted most for {explanation.predicted_class}.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-4 my-5">
        <Info size={16} className="text-slate-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs font-medium text-slate-500 leading-relaxed">
          {explanation.note ||
            "These are terms in the model's own score, not causes. A longer bar means the model leaned on that input more, not that it caused the condition."}
        </p>
      </div>

      <ul className="space-y-3">
        {shown.map((f, i) => {
          const supports = f.direction === "supports";
          const width = Math.max((Math.abs(f.contribution) / maxAbs) * 100, 4);
          return (
            <li key={`${f.feature}-${i}`}>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <span className="text-sm font-black text-slate-700">
                  {label(f.feature)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-bold ${
                    supports ? "text-emerald-600" : "text-orange-600"
                  }`}
                >
                  {supports ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  {supports ? "supports" : "opposes"}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${supports ? "bg-emerald-500" : "bg-orange-400"}`}
                  style={{ width: `${width}%` }}
                />
              </div>
              {f.input_value && (
                <p className="text-xs font-medium text-slate-400 mt-1">
                  From: {f.input_value}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {explanation.features.length > shown.length && (
        <p className="text-xs font-medium text-slate-400 mt-4">
          Showing the {shown.length} most influential of{" "}
          {explanation.features.length} factors.
        </p>
      )}
    </div>
  );
}
