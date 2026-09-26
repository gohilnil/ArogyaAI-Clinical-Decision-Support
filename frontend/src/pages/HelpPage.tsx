import { motion } from "framer-motion";

// --- HELP CENTER COMPONENT ---
export default function HelpCenter() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-8 p-10"
    >
      <div>
        <h1 className="text-4xl font-black text-slate-950 tracking-tighter mb-2">
          Help Center & Docs
        </h1>
        <p className="text-slate-500 font-medium text-lg">
          Understanding the Clinical Decision Support System.
        </p>
      </div>
      <div className="bg-white p-10 rounded-[2rem] border border-slate-200/60 shadow-sm space-y-8">
        <h4 className="text-xl font-black text-slate-900 border-b border-slate-100 pb-4">
          How does the Hybrid AI work?
        </h4>
        <p className="text-slate-600 font-medium leading-relaxed">
          ArogyaAI uses a <strong>Dual-Engine Architecture</strong>. First,
          patient symptoms are processed by a trained{" "}
          <strong>machine-learning classifier</strong> that returns a probable
          condition and a confidence score. Second, a{" "}
          <strong>generative AI</strong> model produces Ayurvedic context for
          that prediction.
        </p>
        <p className="text-slate-500 font-medium leading-relaxed text-sm">
          The ML model is selected by cross-validation during training; the
          deployed model and its measured performance are recorded in{" "}
          <code>MODEL_CARD.md</code>. This system is decision support, not a
          diagnostic device — predictions are probabilistic and must be reviewed
          by a qualified practitioner.
        </p>
      </div>
    </motion.div>
  );
}
