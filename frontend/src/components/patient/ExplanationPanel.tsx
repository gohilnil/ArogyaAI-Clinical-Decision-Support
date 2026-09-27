// Renders the model's OWN per-feature contributions for an assessment.
//
// This is not a narrative and not an approximation: `explanation.features` is
// the ranked list the backend computed from the deployed linear model's
// coefficients (see backend/ml/explainability.py), stored verbatim when the
// assessment was created. The bars are scaled by the largest absolute
// contribution present, so they show relative weight WITHIN THIS result.
//
// This component deliberately renders no heading of its own. Its caller is
// always a titled SectionCard, and an earlier version repeated an icon and a
// title here as well — two purple chips and two headings stacked, which read as
// a rendering fault rather than as emphasis.
//
// When an assessment carries no explanation, this renders nothing. It never
// substitutes a placeholder that would imply an explanation exists.

import { TrendingUp, TrendingDown, Info } from "lucide-react";
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
  const hidden = explanation.features.length - shown.length;

  return (
    <div>
      {/* The method caveat, stated once, above the bars it applies to. */}
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6">
        <Info size={16} className="text-slate-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs font-medium text-slate-600 leading-relaxed">
          {explanation.note ||
            "These are terms in the model's own score, not causes. A longer bar means the model leaned on that input more, not that it caused the condition."}
        </p>
      </div>

      <ul className="space-y-5">
        {shown.map((f, i) => {
          const supports = f.direction === "supports";
          const width = Math.max((Math.abs(f.contribution) / maxAbs) * 100, 4);
          return (
            <li key={`${f.feature}-${i}`}>
              {/* Label and direction sit together on the left. They were
                  previously pushed to opposite edges by justify-between, which
                  on a wide card left a ~500px void between a feature and its
                  own verdict, so the two read as unrelated columns. */}
              <div className="flex items-center gap-2.5 mb-2">
                <span className="text-sm font-black text-slate-800">
                  {label(f.feature)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md ${
                    supports
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-orange-50 text-orange-700"
                  }`}
                >
                  {supports ? (
                    <TrendingUp size={12} aria-hidden="true" />
                  ) : (
                    <TrendingDown size={12} aria-hidden="true" />
                  )}
                  {supports ? "supports" : "opposes"}
                </span>
              </div>

              {/* The track is slate-200 rather than slate-100: at slate-100 the
                  unfilled remainder was near-invisible on the white card, so a
                  short bar looked like a floating sliver with no scale. */}
              <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    supports ? "bg-emerald-500" : "bg-orange-400"
                  }`}
                  style={{ width: `${width}%` }}
                />
              </div>

              {f.input_value && (
                <p className="text-xs font-medium text-slate-500 mt-1.5 leading-snug">
                  <span className="text-slate-400">Your input:</span>{" "}
                  {f.input_value}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {hidden > 0 && (
        <p className="text-xs font-medium text-slate-400 mt-5">
          Showing the {shown.length} most influential of {explanation.features.length}{" "}
          factors.
        </p>
      )}
    </div>
  );
}
