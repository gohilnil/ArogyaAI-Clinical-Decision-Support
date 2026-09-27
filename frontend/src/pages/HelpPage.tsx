import { motion } from "framer-motion";
import {
  BrainCircuit,
  Users,
  Activity,
  ClipboardList,
  Building,
  Lock,
  Wind,
  MessageSquare,
  AlertCircle,
} from "lucide-react";

interface Section {
  icon: typeof Activity;
  title: string;
  body: string[];
  tone: string;
}

/**
 * Task-oriented help rather than a feature list. Every claim here describes
 * behaviour that actually exists in the code; nothing is aspirational. The
 * confidence gate is described as the inherited safety heuristic it is, not a
 * validated threshold — overstating it here would be the kind of claim that
 * collapses under questioning.
 */
const SECTIONS: Section[] = [
  {
    icon: BrainCircuit,
    title: "How the hybrid analysis works",
    tone: "bg-emerald-100 text-emerald-600",
    body: [
      "An analysis runs in two stages. A machine-learning classifier first reads the symptoms and context you enter and returns a probable condition with a raw confidence score. A generative AI model then produces Ayurvedic context explaining that prediction — it does not re-diagnose, and the prediction it explains is always the model's own.",
      "The deployed model was selected by cross-validation during training. Its measured performance is recorded in MODEL_CARD.md in the repository. Scores shown in the app are the model's raw output, not a probability that the result is correct.",
    ],
  },
  {
    icon: Wind,
    title: "The confidence gate",
    tone: "bg-orange-100 text-orange-600",
    body: [
      "Below the 35% threshold the system deliberately withholds the condition and shows \"Inconclusive Data\" instead, marking the case for clinical review. The stored assessment keeps the raw model label so the history stays faithful to what the model produced.",
      "The 35% figure is an inherited safety heuristic, not a validated cut-off. Treat every result — including those above the gate — as decision support for review by a qualified practitioner.",
    ],
  },
  {
    icon: ClipboardList,
    title: "Running an assessment",
    tone: "bg-indigo-100 text-indigo-600",
    body: [
      "The diagnostic tool walks three steps: patient details, Ayurvedic context (dosha, season, weather, food habits), and symptoms. Choosing an existing patient files the result into their history instead of creating a new record — that is what turns separate visits into a longitudinal record.",
      "Height and weight are stored on the patient, so a returning patient's details prefill automatically. After saving, share the patient code shown on the confirmation with the patient so they can link their own account.",
    ],
  },
  {
    icon: Building,
    title: "Clinics, invites and patient codes",
    tone: "bg-blue-100 text-blue-600",
    body: [
      "Every account belongs to exactly one clinic. Practitioner accounts are created only through an administrator-issued invite code, and a patient joins a clinic by entering its 6-character Clinic ID at registration.",
      "A patient reaches their own record by redeeming the clinician-issued patient code on their Profile page. Diary entries written before linking are adopted onto the record automatically when the link is made.",
    ],
  },
  {
    icon: Lock,
    title: "Privacy and clinic isolation",
    tone: "bg-slate-200 text-slate-700",
    body: [
      "Access is enforced by database security rules, not by the app hiding things. A practitioner can read only patients and records belonging to their own clinic; a patient can read only the single record their account is linked to. Role and clinic are immutable after creation, so an account cannot be escalated from the client.",
      "Clinical records are append-only: an assessment is never rewritten or deleted, so history remains auditable. No API keys are stored in the browser; the AI explanation is generated on the server.",
    ],
  },
  {
    icon: MessageSquare,
    title: "The patient health diary",
    tone: "bg-teal-100 text-teal-600",
    body: [
      "Patients log symptoms from their own portal; entries reach the clinic immediately and are visible in Patient Records under Health Diaries. \"Analyze with AI\" opens the diagnostic tool with the entry's symptoms preloaded, and prefills the patient when the entry is attached to a record.",
      "Entries carry a Linked or No linked record badge. An unlinked entry still reaches the clinic but cannot be filed against a patient until the patient links their account.",
    ],
  },
];

/** The one warning that belongs on every screen of a clinical tool. */
function SafetyNote() {
  return (
    <div className="bg-amber-50 border-2 border-amber-200 rounded-[2rem] p-6 md:p-8 flex gap-4">
      <AlertCircle className="text-amber-600 flex-shrink-0" size={26} />
      <div className="space-y-2">
        <h2 className="font-black text-amber-900 text-lg">
          Decision support, not diagnosis
        </h2>
        <p className="text-amber-800 font-medium text-sm leading-relaxed">
          ArogyaAI produces probabilistic model outputs and generated context to
          support clinical judgement. It is not a diagnostic device, and no output
          here should be treated as a diagnosis or a prescription. The qualified
          practitioner remains responsible for every clinical decision.
        </p>
      </div>
    </div>
  );
}

export default function HelpCenter() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto space-y-8 p-6 md:p-10"
    >
      <div>
        <h1 className="text-4xl font-black text-slate-950 tracking-tighter mb-2">
          Help Center &amp; Docs
        </h1>
        <p className="text-slate-500 font-medium text-lg">
          How the system works, and how to use it well.
        </p>
      </div>

      <SafetyNote />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {SECTIONS.map((s, i) => (
          <motion.section
            key={s.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.3 }}
            className="bg-white p-8 rounded-[2rem] border border-slate-200/60 shadow-sm"
            aria-labelledby={`help-${i}`}
          >
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
              <span
                className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${s.tone}`}
              >
                <s.icon size={22} aria-hidden="true" />
              </span>
              <h2
                id={`help-${i}`}
                className="text-lg font-black text-slate-950 leading-snug"
              >
                {s.title}
              </h2>
            </div>
            <div className="space-y-3">
              {s.body.map((p, j) => (
                <p
                  key={j}
                  className={
                    j === 0
                      ? "text-slate-700 font-medium leading-relaxed text-sm"
                      : "text-slate-500 font-medium leading-relaxed text-sm"
                  }
                >
                  {p}
                </p>
              ))}
            </div>
          </motion.section>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-slate-950 rounded-[2rem] p-8 text-white">
          <Users className="text-emerald-400 mb-4" size={26} />
          <h2 className="font-black text-xl mb-2">For practitioners</h2>
          <ul className="text-slate-400 font-medium text-sm space-y-2 list-disc list-inside leading-relaxed">
            <li>Share your Clinic ID from the Profile page so patients can register into your clinic.</li>
            <li>Give each patient their code after the first assessment so they can follow their own history.</li>
            <li>Review any assessment the model flagged as below the confidence gate before acting on it.</li>
          </ul>
        </div>
        <div className="bg-slate-950 rounded-[2rem] p-8 text-white">
          <Activity className="text-emerald-400 mb-4" size={26} />
          <h2 className="font-black text-xl mb-2">For patients</h2>
          <ul className="text-slate-400 font-medium text-sm space-y-2 list-disc list-inside leading-relaxed">
            <li>Log how you feel in the Symptom Logger — your practitioner sees entries straight away.</li>
            <li>Link your patient code from the Profile page to see your own assessment history.</li>
            <li>Everything here is informational. Discuss any result with your practitioner before acting on it.</li>
          </ul>
        </div>
      </div>
    </motion.div>
  );
}
