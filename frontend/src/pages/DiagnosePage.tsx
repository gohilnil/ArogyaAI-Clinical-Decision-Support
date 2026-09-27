import { useState, useEffect, useCallback } from "react";
import type * as React from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Download,
  Save,
  Activity,
  ActivitySquare,
  BrainCircuit,
  Leaf,
  Wind,
  PieChart,
  Thermometer,
  Users,
} from "lucide-react";
import { auth } from "../config/firebase";
import { predictDisease } from "../services/api";
import {
  CONFIDENCE_THRESHOLD,
  createAssessment,
  createPatient,
  listPatients,
  updatePatient,
} from "../services/firestore";
import type { FormData, AnalysisResult, Patient, UserData } from "../types";

// --- CLOUD-CONNECTED DIAGNOSTIC TOOL COMPONENT ---
export default function DiagnosticTool({ userData }: { userData: UserData | null }) {
  const [step, setStep] = useState(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  /** Set after a save so the clinician can share the patient code with the
   *  patient, which is how the patient later reaches their own history. */
  const [savedPatientId, setSavedPatientId] = useState<string>("");

  const [doshaMode, setDoshaMode] = useState<"manual" | "quiz">("manual");
  const [quizAnswers, setQuizAnswers] = useState({
    frame: "",
    digestion: "",
    sleep: "",
  });

  const [formData, setFormData] = useState<FormData>({
    name: "",
    age: "",
    gender: "Male",
    height: "",
    weight: "",
    dosha: "Vata",
    season: "Summer",
    symptoms: "",
    foodHabits: "Vegetarian",
    weather: "Moderate",
  });

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const location = useLocation();

  // The patient this assessment will be filed under. Empty means a new person
  // will be created on save. Selecting an existing patient is what makes the
  // record longitudinal rather than one-document-per-diagnosis.
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      if (!userData?.clinicId) return;
      try {
        setPatients(await listPatients(userData.clinicId));
      } catch (e) {
        console.error("Error loading patients:", e);
      }
    };
    load();
  }, [userData]);

  /**
   * Copy a chosen patient's details into the form.
   *
   * This is what makes an existing-patient assessment correct: the form values
   * are what the analysis runs against AND what gets persisted, so leaving them
   * blank while the dropdown showed a name meant the clinician retyped data the
   * system already had — and a mis-typed age or sex silently changed the result.
   *
   * Height and weight are carried too when the record has them, so a returning
   * patient does not have their measurements re-entered every visit. They are
   * left untouched when absent rather than blanked, since a record created
   * before these were stored has no value to copy.
   */
  const applyPatient = useCallback(
    (patientId: string) => {
      setSelectedPatientId(patientId);
      if (!patientId) return;
      const p = patients.find((x) => x.id === patientId);
      if (!p) return;
      setFormData((prev) => ({
        ...prev,
        name: p.name || "",
        age: p.age || "",
        gender: p.gender || prev.gender,
        dosha: p.dosha || prev.dosha,
        height: p.heightCm ? String(p.heightCm) : prev.height,
        weight: p.weightKg ? String(p.weightKg) : prev.weight,
      }));
    },
    [patients],
  );

  // Opening the tool from a diary entry or a patient record passes the patient
  // id; the full details are applied once the patient list has loaded, since
  // the lookup above needs it. This previously only set the id, which left the
  // dropdown showing a name above empty fields.
  useEffect(() => {
    const id = location.state?.prefillPatientId;
    if (id && patients.length > 0) applyPatient(id);
  }, [location.state, patients, applyPatient]);

  useEffect(() => {
    if (location.state && location.state.prefillSymptoms) {
      setFormData((prev) => ({
        ...prev,
        name: location.state.prefillName || prev.name,
        symptoms: location.state.prefillSymptoms,
      }));
    }
  }, [location.state]);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return (
          formData.name &&
          formData.age &&
          formData.gender &&
          formData.height &&
          formData.weight
        );
      case 2:
        if (doshaMode === "manual") return formData.dosha && formData.season;
        return (
          quizAnswers.frame &&
          quizAnswers.digestion &&
          quizAnswers.sleep &&
          formData.season
        );
      case 3:
        return formData.symptoms.trim().length > 5;
      default:
        return false;
    }
  };

  const [doshaBreakdown, setDoshaBreakdown] = useState<{
    v: number;
    p: number;
    k: number;
  } | null>(null);

  const calculateDoshaBreakdown = () => {
    let v = 0,
      p = 0,
      k = 0;
    if (quizAnswers.frame === "Thin/Light") v += 40;
    if (quizAnswers.frame === "Medium/Athletic") p += 40;
    if (quizAnswers.frame === "Heavy/Solid") k += 40;
    if (quizAnswers.digestion === "Irregular/Gas") v += 30;
    if (quizAnswers.digestion === "Strong/Acidic") p += 30;
    if (quizAnswers.digestion === "Slow/Sluggish") k += 30;
    if (quizAnswers.sleep === "Light/Interrupted") v += 30;
    if (quizAnswers.sleep === "Moderate/Sound") p += 30;
    if (quizAnswers.sleep === "Deep/Prolonged") k += 30;
    return { v, p, k };
  };

  /**
   * Map the quiz totals onto one of the six dosha values the model was trained
   * on. The quiz previously wrote its raw display string ("Vata 40%, ...") into
   * the dosha field, which is outside that vocabulary: the backend silently
   * replaced it with a fallback before prediction, and it was persisted on the
   * record as though the clinician had chosen it.
   */
  const dominantDosha = (v: number, p: number, k: number): string => {
    const order = ["Vata", "Pitta", "Kapha"];
    const ranked = [
      { name: "Vata", score: v },
      { name: "Pitta", score: p },
      { name: "Kapha", score: k },
    ].sort((a, b) => b.score - a.score);
    if (ranked[0].score === ranked[1].score) {
      // A tie for the lead is reported as the combined constitution, which is
      // one of the values the encoder knows.
      const pair = [ranked[0].name, ranked[1].name].sort(
        (a, b) => order.indexOf(a) - order.indexOf(b),
      );
      return `${pair[0]}-${pair[1]}`;
    }
    return ranked[0].name;
  };

  const handleNext = () => {
    if (isStepValid()) {
      if (step === 2 && doshaMode === "quiz") {
        const breakdown = calculateDoshaBreakdown();
        setDoshaBreakdown(breakdown);
        setFormData((prev) => ({
          ...prev,
          dosha: dominantDosha(breakdown.v, breakdown.p, breakdown.k),
        }));
      }
      setStep(step + 1);
      setError(null);
    } else {
      setError("Please complete all patient data fields.");
    }
  };

  const runAnalysis = async () => {
    if (!isStepValid()) return;
    setIsAnalyzing(true);
    setError(null);
    setSavedSuccess(false);
    try {
      // Map display-label dosha values to backend encoder-compatible values
      const doshaMap: Record<string, string> = {
        "Vata (Air/Space)": "Vata",
        "Pitta (Fire/Water)": "Pitta",
        "Kapha (Water/Earth)": "Kapha",
      };
      // Map display-label season values to backend encoder-compatible values
      const seasonMap: Record<string, string> = {
        "Summer (Grishma)": "Summer",
        "Monsoon (Varsha)": "Monsoon",
        "Winter (Hemanta)": "Winter",
        "Spring (Vasanta)": "Spring",
      };

      const resolvedDosha = doshaMap[formData.dosha] || formData.dosha;
      const resolvedSeason = seasonMap[formData.season] || formData.season;

      const apiPayload = {
        Symptoms: formData.symptoms,
        Age: parseInt(formData.age),
        Height_cm: parseInt(formData.height || "170"),
        Weight_kg: parseInt(formData.weight || "70"),
        Gender: formData.gender,
        Body_Type_Dosha_Sanskrit: resolvedDosha,
        Season: resolvedSeason,
        Food_Habits: formData.foodHabits || "Vegetarian",
        Current_Medication: "Unknown",
        Allergies: "Unknown",
        Weather: formData.weather || "Moderate",
      };

      const data = await predictDisease(apiPayload);

      setResult(data);
      setShowResult(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "AI Analysis Server unreachable.";
      setError(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveToCloud = async () => {
    const currentUser = auth.currentUser;
    if (!result || !userData || !currentUser) return;
    if (!formData.name.trim()) {
      setError("A patient name is required before saving an assessment.");
      return;
    }

    // A clinical write is scoped by the practitioner's clinic, so there must be
    // one. This page is only routed to an approved doctor, who always has a
    // clinic — but the field is optional on the type now (an admin has none),
    // so the dependency is checked rather than assumed.
    const clinicId = userData.clinicId;
    if (!clinicId) {
      setError("Your account is not linked to a clinic. Please sign in again.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const uid = currentUser.uid;

      // Resolve the person first, then file the clinical event under them.
      // Selecting an existing patient is what turns separate visits into a
      // history instead of unrelated documents.
      let patientId = selectedPatientId;

      // Measurements ride along with the identity update so a returning patient
      // is not re-measured at every visit. Parsed defensively: an empty or
      // non-numeric field must not write NaN into the record.
      const heightCm = parseInt(formData.height, 10);
      const weightKg = parseInt(formData.weight, 10);

      if (patientId) {
        await updatePatient(patientId, {
          name: formData.name.trim(),
          age: formData.age,
          gender: formData.gender,
          dosha: formData.dosha,
          heightCm: Number.isFinite(heightCm) ? heightCm : undefined,
          weightKg: Number.isFinite(weightKg) ? weightKg : undefined,
        });
      } else {
        patientId = await createPatient(clinicId, uid, {
          name: formData.name,
          age: formData.age,
          gender: formData.gender,
          dosha: formData.dosha,
          heightCm: Number.isFinite(heightCm) ? heightCm : undefined,
          weightKg: Number.isFinite(weightKg) ? weightKg : undefined,
        });
        setSelectedPatientId(patientId);
      }

      await createAssessment(clinicId, uid, patientId, {
        symptoms: formData.symptoms,
        age: formData.age,
        gender: formData.gender,
        dosha: formData.dosha,
        season: formData.season,
        weather: formData.weather,
        foodHabits: formData.foodHabits,
        heightCm: formData.height ? parseInt(formData.height) : undefined,
        weightKg: formData.weight ? parseInt(formData.weight) : undefined,
        result,
      });

      setSavedPatientId(patientId);
      setSavedSuccess(true);
    } catch (err) {
      console.error("Error saving assessment:", err);
      const msg =
        err instanceof Error && err.name === "DomainError"
          ? err.message
          : "Failed to save assessment. Please check your connection and try again.";
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const isLowConfidence = result && result.confidence < CONFIDENCE_THRESHOLD;

  return (
    <div className="max-w-[1600px] mx-auto p-6 md:p-10 md:pt-4">
      <AnimatePresence mode="wait">
        {!showResult && !isAnalyzing && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-12"
          >
            {location.state?.prefillSymptoms && step === 1 && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl flex items-center gap-3 mx-6">
                <CheckCircle2 className="flex-shrink-0" size={20} />
                <p className="font-bold text-sm">
                  Patient symptoms have been securely loaded. Please complete
                  the demographics to proceed to the AI Analysis.
                </p>
              </div>
            )}

            <div className="mb-12 space-y-5 px-6">
              <div className="flex justify-between text-xs md:text-sm font-black uppercase tracking-widest text-slate-400">
                <span
                  className={step >= 1 ? "text-emerald-700 font-black" : ""}
                >
                  1. Data
                </span>
                <span
                  className={step >= 2 ? "text-emerald-700 font-black" : ""}
                >
                  2. Context
                </span>
                <span
                  className={step >= 3 ? "text-emerald-700 font-black" : ""}
                >
                  3. Symptoms
                </span>
              </div>
            </div>

            <div className="bg-white rounded-[3rem] shadow-[0_15px_60px_rgb(0,0,0,0.06)] border border-slate-100 p-8 md:p-16">
              {step === 1 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-10"
                >
                  <h1 className="text-4xl md:text-5xl font-black text-slate-950 tracking-tighter">
                    1. Demographics
                  </h1>

                  <div className="space-y-3 bg-emerald-50/60 p-6 md:p-8 rounded-3xl border-2 border-emerald-100">
                    <label className="text-lg font-bold text-slate-700 flex items-center gap-2">
                      <Users size={20} className="text-emerald-500" /> Existing
                      Patient
                    </label>
                    <select
                      value={selectedPatientId}
                      onChange={(e) => applyPatient(e.target.value)}
                      className="w-full p-6 text-xl rounded-3xl border-2 border-white bg-white focus:ring-4 focus:ring-emerald-200 outline-none font-bold"
                    >
                      <option value="">
                        New patient — create a record on save
                      </option>
                      {patients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.age ? ` · ${p.age}y` : ""}
                          {p.dosha ? ` · ${p.dosha}` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs font-bold text-slate-400 mt-2 ml-2">
                      Choosing an existing patient adds this assessment to their
                      history instead of creating a new record.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <label className="text-lg font-bold text-slate-700">
                      Patient Full Name
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className="w-full p-6 text-xl rounded-3xl border-2 border-slate-200/60 bg-slate-50 focus:ring-4 focus:ring-emerald-200 outline-none font-bold"
                      placeholder="e.g. Ananya Sharma"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
                    <div className="space-y-3">
                      <label className="text-lg font-bold text-slate-700">
                        Patient Age
                      </label>
                      <input
                        type="number"
                        name="age"
                        value={formData.age}
                        onChange={handleInputChange}
                        className="w-full p-6 text-xl rounded-3xl border-2 border-slate-200/60 bg-slate-50 focus:ring-4 focus:ring-emerald-200 outline-none font-bold"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-lg font-bold text-slate-700">
                        Patient Sex
                      </label>
                      <select
                        name="gender"
                        value={formData.gender}
                        onChange={handleInputChange}
                        className="w-full p-6 text-xl rounded-3xl border-2 border-slate-200/60 bg-slate-50 focus:ring-4 focus:ring-emerald-200 outline-none font-bold"
                      >
                        <option>Male</option>
                        <option>Female</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div className="space-y-3">
                      <label className="text-lg font-bold text-slate-700">
                        Height (cm)
                      </label>
                      <input
                        type="number"
                        name="height"
                        value={formData.height}
                        onChange={handleInputChange}
                        className="w-full p-6 text-xl rounded-3xl border-2 border-slate-200/60 bg-slate-50 focus:ring-4 focus:ring-emerald-200 outline-none font-bold"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-lg font-bold text-slate-700">
                        Weight (kg)
                      </label>
                      <input
                        type="number"
                        name="weight"
                        value={formData.weight}
                        onChange={handleInputChange}
                        className="w-full p-6 text-xl rounded-3xl border-2 border-slate-200/60 bg-slate-50 focus:ring-4 focus:ring-emerald-200 outline-none font-bold"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-10"
                >
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h1 className="text-4xl md:text-5xl font-black text-slate-950 tracking-tighter">
                      2. Context
                    </h1>
                    <div className="bg-slate-100 p-2 rounded-2xl flex gap-2 w-full md:w-auto">
                      <button
                        onClick={() => setDoshaMode("manual")}
                        className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold transition-all ${doshaMode === "manual" ? "bg-white shadow-md text-emerald-700" : "text-slate-500 hover:bg-slate-200"}`}
                      >
                        Manual
                      </button>
                      <button
                        onClick={() => setDoshaMode("quiz")}
                        className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${doshaMode === "quiz" ? "bg-white shadow-md text-emerald-700" : "text-slate-500 hover:bg-slate-200"}`}
                      >
                        <BrainCircuit size={18} /> AI Calculator
                      </button>
                    </div>
                  </div>

                  {doshaMode === "manual" ? (
                    <div className="space-y-10 bg-slate-50 p-6 md:p-10 rounded-3xl border border-slate-200/50">
                      <div className="space-y-3">
                        <label className="text-lg font-bold text-slate-700 flex items-center gap-2">
                          <Wind size={20} className="text-emerald-500" /> Known
                          Dosha
                        </label>
                        <select
                          name="dosha"
                          value={formData.dosha}
                          onChange={handleInputChange}
                          className="w-full p-6 text-xl rounded-3xl border-2 border-slate-200/60 bg-white focus:ring-4 focus:ring-emerald-200 outline-none font-bold"
                        >
                          <option value="Vata">Vata (Air/Space)</option>
                          <option value="Pitta">Pitta (Fire/Water)</option>
                          <option value="Kapha">Kapha (Water/Earth)</option>
                          <option value="Vata-Pitta">Vata-Pitta (Combined)</option>
                          <option value="Vata-Kapha">Vata-Kapha (Combined)</option>
                          <option value="Pitta-Kapha">Pitta-Kapha (Combined)</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-8 bg-emerald-50/50 p-6 md:p-10 rounded-3xl border-2 border-emerald-100">
                      <h3 className="text-2xl font-black text-emerald-900 mb-6 flex items-center gap-3">
                        <PieChart className="text-emerald-600" /> Algorithmic
                        Assessment
                      </h3>
                      <div className="space-y-3">
                        <label className="text-lg font-bold text-slate-700">
                          1. Body Frame
                        </label>
                        <select
                          value={quizAnswers.frame}
                          onChange={(e) =>
                            setQuizAnswers({
                              ...quizAnswers,
                              frame: e.target.value,
                            })
                          }
                          className="w-full p-6 text-xl rounded-3xl border-2 border-white bg-white focus:ring-4 focus:ring-emerald-200 outline-none font-bold"
                        >
                          <option value="">Select option...</option>
                          <option>Thin/Light</option>
                          <option>Medium/Athletic</option>
                          <option>Heavy/Solid</option>
                        </select>
                      </div>
                      <div className="space-y-3">
                        <label className="text-lg font-bold text-slate-700">
                          2. Digestion
                        </label>
                        <select
                          value={quizAnswers.digestion}
                          onChange={(e) =>
                            setQuizAnswers({
                              ...quizAnswers,
                              digestion: e.target.value,
                            })
                          }
                          className="w-full p-6 text-xl rounded-3xl border-2 border-white bg-white focus:ring-4 focus:ring-emerald-200 outline-none font-bold"
                        >
                          <option value="">Select option...</option>
                          <option>Irregular/Gas</option>
                          <option>Strong/Acidic</option>
                          <option>Slow/Sluggish</option>
                        </select>
                      </div>
                      <div className="space-y-3">
                        <label className="text-lg font-bold text-slate-700">
                          3. Sleep
                        </label>
                        <select
                          value={quizAnswers.sleep}
                          onChange={(e) =>
                            setQuizAnswers({
                              ...quizAnswers,
                              sleep: e.target.value,
                            })
                          }
                          className="w-full p-6 text-xl rounded-3xl border-2 border-white bg-white focus:ring-4 focus:ring-emerald-200 outline-none font-bold"
                        >
                          <option value="">Select option...</option>
                          <option>Light/Interrupted</option>
                          <option>Moderate/Sound</option>
                          <option>Deep/Prolonged</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 pt-6">
                    <label className="text-lg font-bold text-slate-700 flex items-center gap-2">
                      <Thermometer size={20} className="text-emerald-500" />{" "}
                      Current Season
                    </label>
                    <select
                      name="season"
                      value={formData.season}
                      onChange={handleInputChange}
                      className="w-full p-6 text-xl rounded-3xl border-2 border-slate-200/60 bg-slate-50 focus:ring-4 focus:ring-emerald-200 outline-none font-bold"
                    >
                      <option value="Summer">Summer (Grishma)</option>
                      <option value="Monsoon">Monsoon (Varsha)</option>
                      <option value="Winter">Winter (Hemanta)</option>
                      <option value="Spring">Spring (Vasanta)</option>
                      <option value="Autumn">Autumn (Sharad)</option>
                    </select>
                  </div>

                  <div className="space-y-3 pt-2">
                    <label className="text-lg font-bold text-slate-700 flex items-center gap-2">
                      <Wind size={20} className="text-emerald-500" />{" "}
                      Current Weather
                    </label>
                    <select
                      name="weather"
                      value={formData.weather}
                      onChange={handleInputChange}
                      className="w-full p-6 text-xl rounded-3xl border-2 border-slate-200/60 bg-slate-50 focus:ring-4 focus:ring-emerald-200 outline-none font-bold"
                    >
                      <option value="Moderate">Moderate</option>
                      <option value="Hot_humid">Hot & Humid</option>
                      <option value="Hot_dry">Hot & Dry</option>
                      <option value="Cold_dry">Cold & Dry</option>
                      <option value="Cold_humid">Cold & Humid</option>
                      <option value="Rainy">Rainy</option>
                      <option value="Cloudy">Cloudy</option>
                      <option value="Sunny">Sunny</option>
                      <option value="Windy">Windy</option>
                      <option value="Extreme_heat">Extreme Heat</option>
                      <option value="Extreme_cold">Extreme Cold</option>
                    </select>
                  </div>

                  <div className="space-y-3 pt-2">
                    <label className="text-lg font-bold text-slate-700 flex items-center gap-2">
                      <Leaf size={20} className="text-emerald-500" />{" "}
                      Food Habits
                    </label>
                    <select
                      name="foodHabits"
                      value={formData.foodHabits}
                      onChange={handleInputChange}
                      className="w-full p-6 text-xl rounded-3xl border-2 border-slate-200/60 bg-slate-50 focus:ring-4 focus:ring-emerald-200 outline-none font-bold"
                    >
                      <option value="Vegetarian">Vegetarian</option>
                      <option value="Non-vegetarian">Non-Vegetarian</option>
                      <option value="Vegan">Vegan</option>
                      <option value="Occasionally_non_veg">Occasionally Non-Veg</option>
                      <option value="Spicy_food_lover">Spicy Food Lover</option>
                      <option value="Sweet_food_lover">Sweet Food Lover</option>
                      <option value="Heavy_meals">Heavy Meals</option>
                      <option value="Light_meals">Light Meals</option>
                      <option value="Irregular_eating">Irregular Eating</option>
                    </select>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-10"
                >
                  <h1 className="text-4xl md:text-5xl font-black text-slate-950 tracking-tighter">
                    3. Clinical Symptoms
                  </h1>
                  <textarea
                    name="symptoms"
                    value={formData.symptoms}
                    onChange={handleInputChange}
                    className="w-full p-8 h-80 text-xl md:text-2xl font-medium rounded-[2rem] border-2 border-slate-200/60 bg-slate-50 focus:ring-4 focus:ring-emerald-200 outline-none resize-none shadow-inner"
                    placeholder="e.g. persistent chills and high fever for 3 days..."
                  ></textarea>
                </motion.div>
              )}

              {error && (
                <div className="mt-8 p-6 bg-red-100/60 border border-red-200 text-red-700 font-bold rounded-3xl flex gap-3">
                  <AlertCircle size={22} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="mt-16 flex justify-between items-center border-t-2 border-slate-100 pt-10">
                {step > 1 ? (
                  <button
                    onClick={() => setStep(step - 1)}
                    className="px-6 py-4 font-black text-slate-400 hover:text-slate-900 text-lg"
                  >
                    Back
                  </button>
                ) : (
                  <div />
                )}
                {step < 3 ? (
                  <button
                    onClick={handleNext}
                    className="bg-slate-950 text-white px-8 py-4 rounded-3xl font-black text-xl flex gap-3 hover:bg-slate-800 shadow-xl"
                  >
                    Next <ChevronRight size={22} />
                  </button>
                ) : (
                  <button
                    onClick={runAnalysis}
                    disabled={!formData.symptoms.trim()}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-8 py-4 rounded-3xl font-black text-lg md:text-2xl flex gap-3 shadow-xl disabled:opacity-50"
                  >
                    Run Diagnostic <Sparkles size={24} />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LOADING SCREEN */}
      {isAnalyzing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 min-h-screen bg-slate-950/80 backdrop-blur-xl flex items-center justify-center z-[300] p-6"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center p-12 md:p-20 space-y-8 bg-white/60 backdrop-blur-xl rounded-[4rem] shadow-2xl border-4 border-white text-center"
          >
            <div className="relative w-32 h-32 md:w-40 md:h-40 flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 border-8 border-emerald-100 border-t-emerald-600 rounded-full"
              />
              <BrainCircuit className="text-emerald-600 w-12 h-12 md:w-16 md:h-16 animate-pulse" />
            </div>
            <h3 className="text-3xl md:text-4xl font-black text-slate-950 tracking-tighter">
              Synthesizing Hybrid Intelligence
            </h3>
          </motion.div>
        </motion.div>
      )}

      {/* RESULTS DASHBOARD */}
      {showResult && result && (
        <motion.div
          key="result"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-12 pb-20"
        >
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 no-print">
            <div>
              <button
                onClick={() => setShowResult(false)}
                className="text-emerald-600 font-black text-sm mb-4 hover:underline flex gap-1"
              >
                - Start New Analysis
              </button>
              <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-slate-950">
                Report: {formData.name}
              </h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
              <button
                onClick={() => window.print()}
                className="bg-white border-2 border-slate-200/60 shadow-lg px-8 py-4 rounded-full font-black text-lg flex items-center justify-center gap-3 hover:bg-slate-50 w-full sm:w-auto"
              >
                <Download size={22} /> Export PDF
              </button>
              <button
                onClick={saveToCloud}
                disabled={savedSuccess || isSaving}
                className={`px-8 py-4 rounded-full font-black text-lg flex items-center justify-center gap-3 shadow-lg transition-all w-full sm:w-auto ${savedSuccess ? "bg-teal-600 text-white" : "bg-slate-950 text-white hover:bg-slate-800"}`}
              >
                {isSaving ? (
                  "Saving..."
                ) : savedSuccess ? (
                  <>
                    <CheckCircle2 size={22} /> Saved to Cloud
                  </>
                ) : (
                  <>
                    <Save size={22} /> Save Record
                  </>
                )}
              </button>
            </div>
          </div>

          {savedSuccess && savedPatientId && (
            <div className="bg-emerald-50 border-2 border-emerald-200 p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-4 mb-4 no-print">
              <CheckCircle2 className="text-emerald-600 w-8 h-8 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-black text-emerald-900 text-lg">
                  Assessment saved to the patient's history
                </h4>
                <p className="text-emerald-800 font-medium">
                  Share this patient code so they can view their own record and
                  assessment history:{" "}
                  <strong className="font-mono tracking-widest">
                    {savedPatientId}
                  </strong>
                </p>
              </div>
            </div>
          )}

          {isLowConfidence && (
            <div className="bg-orange-50 border-2 border-orange-200 p-6 rounded-2xl flex gap-4 items-center mb-4">
              <AlertCircle className="text-orange-600 w-8 h-8 flex-shrink-0" />
              <div>
                <h4 className="font-black text-orange-900 text-lg">
                  Clinical Review Required
                </h4>
                <p className="text-orange-800 font-medium">
                  The patient's symptoms are too broad. The AI confidence is
                  below the safety threshold. Do not prescribe solely based on
                  this prediction.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-1 space-y-10">
              <div
                className={`text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden print-shadow-none ${isLowConfidence ? "bg-orange-950" : "bg-slate-950"}`}
              >
                <div className="absolute -right-4 -bottom-4 opacity-10">
                  <Activity size={200} />
                </div>
                <p className="text-slate-400 text-sm font-black uppercase tracking-widest mb-3">
                  ML Decision
                </p>
                <h3
                  className={`text-4xl md:text-5xl font-black mb-10 leading-tight ${isLowConfidence ? "text-orange-400" : "text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300"}`}
                >
                  {isLowConfidence ? "Inconclusive Data" : result.prediction}
                </h3>
                <div className="flex items-center justify-between mt-10 border-t border-slate-700/50 pt-10">
                  <div>
                    <p className="text-slate-400 text-lg font-bold">
                      Model Score
                    </p>
                    <p
                      className={`text-4xl md:text-5xl font-black ${isLowConfidence ? "text-orange-500" : ""}`}
                    >
                      {result.confidence}%
                    </p>
                    <p className="text-slate-500 text-xs font-semibold mt-2 max-w-xs">
                      The model's raw output score, not a calibrated probability
                      that the prediction is correct.
                    </p>
                  </div>
                </div>
              </div>

              {/* AI X-RAY CARD — renders the model's real per-feature
                  contributions for the predicted condition. Values are the
                  model's own terms (coefficient x feature value); they are not
                  probabilities and not causal claims. */}
              <div className="bg-white p-10 rounded-[3rem] border border-slate-200/60 shadow-sm print-shadow-none">
                <h4 className="font-black text-slate-950 mb-2 text-xl flex items-center gap-2">
                  <ActivitySquare className="text-emerald-500" /> AI X-Ray
                </h4>
                <p className="text-slate-500 text-sm font-semibold mb-8">
                  The model's own contributions to this result. This is not a
                  probability.
                </p>
                {result.explanation && result.explanation.features.length > 0 ? (
                  <div className="space-y-6">
                    {result.explanation.features.map((feature, idx) => {
                      // Bars are scaled against the largest contribution so
                      // they show relative weight, since contributions are
                      // unbounded model terms rather than percentages.
                      const peak = Math.max(
                        ...result.explanation!.features.map((f) =>
                          Math.abs(f.contribution),
                        ),
                      );
                      const width = peak > 0
                        ? (Math.abs(feature.contribution) / peak) * 100
                        : 0;
                      const supports = feature.direction === "supports";
                      return (
                        <div key={idx}>
                          <div className="flex justify-between text-sm font-bold text-slate-700 mb-2 gap-3">
                            <span className="uppercase truncate">
                              {feature.feature}
                              {feature.input_value &&
                                feature.group === "symptom" && (
                                  <span className="text-slate-400 normal-case font-semibold">
                                    {" "}
                                    ({feature.input_value})
                                  </span>
                                )}
                            </span>
                            <span
                              className={
                                supports ? "text-emerald-600" : "text-rose-500"
                              }
                            >
                              {feature.contribution >= 0 ? "+" : ""}
                              {feature.contribution.toFixed(2)}
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-3">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${width}%` }}
                              transition={{ duration: 0.8, delay: idx * 0.08 }}
                              className={`h-3 rounded-full ${
                                supports
                                  ? "bg-gradient-to-r from-emerald-400 to-teal-500"
                                  : "bg-gradient-to-r from-rose-400 to-orange-400"
                              }`}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-xs text-slate-400 font-medium leading-relaxed pt-2 border-t border-slate-100">
                      {result.explanation.note}
                    </p>
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm font-semibold">
                    {isLowConfidence
                      ? "No explanation is shown because the model's confidence is below the safety threshold."
                      : "This model does not expose per-feature contributions, so none are shown."}
                  </p>
                )}
              </div>
            </div>

            <div className="lg:col-span-2 space-y-10">
              <div className="bg-white p-8 md:p-12 rounded-[3rem] border border-slate-200/60 shadow-sm flex flex-col md:flex-row justify-between print-shadow-none gap-6">
                <div>
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-sm mb-2">
                    Calculated Dosha Matrix
                  </p>
                  <p className="text-2xl font-black text-slate-900">
                    {formData.dosha}
                  </p>
                  {doshaBreakdown && (
                    <p className="text-slate-500 text-sm font-semibold mt-1">
                      Quiz score: Vata {doshaBreakdown.v} · Pitta{" "}
                      {doshaBreakdown.p} · Kapha {doshaBreakdown.k}
                    </p>
                  )}
                </div>
                <div className="md:text-right">
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-sm mb-2">
                    Age / Sex
                  </p>
                  <p className="text-2xl font-black text-slate-900">
                    {formData.age} yrs / {formData.gender}
                  </p>
                </div>
              </div>

              {/* CONTEXTUAL REASONING CARD */}
              <div className="bg-white p-8 md:p-16 rounded-[3rem] border border-slate-200/60 shadow-sm print-shadow-none">
                <h4 className="font-black text-slate-950 mb-8 md:mb-10 flex items-center gap-3 text-2xl md:text-3xl">
                  <BrainCircuit className="text-emerald-600" /> Ayurvedic AI Contextual Analysis
                </h4>
                
                {result.recommendation ? (
                  <div className="prose max-w-none text-slate-800 leading-relaxed text-lg whitespace-pre-wrap font-semibold">
                    {result.recommendation.replace(/\*\*/g, '')}
                    <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-sm font-medium">
                      ⚠️ <strong>Important Disclaimer:</strong> This AI-generated analysis is for informational and educational purposes only. It is not a substitute for professional medical diagnosis, advice, or treatment. Always consult a qualified healthcare professional for any health concerns.
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 font-semibold">
                    No contextual analysis text was returned for this result.
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
