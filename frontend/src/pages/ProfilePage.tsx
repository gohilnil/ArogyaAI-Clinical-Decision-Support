import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Building, Shield, CheckCircle2, AlertCircle } from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import { linkPatientAccount } from "../services/firestore";
import { getApiBaseUrl } from "../services/api";
import type { UserData } from "../types";

// --- PROFILE SETTINGS COMPONENT ---
export default function ProfileSettings({
  user,
  userData,
}: {
  user: FirebaseUser | null;
  userData: UserData | null;
}) {
  const [patientCode, setPatientCode] = useState(userData?.patientId || "");
  const [linking, setLinking] = useState(false);
  const [linkMessage, setLinkMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  // The API base URL override, seeded from the stored override only (not from
  // the resolved default). Pre-filling the effective default would invite a
  // clinician to "save" it and pin a localhost address in a deployed browser.
  const [apiUrl, setApiUrl] = useState(
    () => localStorage.getItem("renderUrl") || "",
  );
  const [urlMessage, setUrlMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const effectiveApiUrl = getApiBaseUrl();

  // userData arrives asynchronously from the auth listener, so the input cannot
  // be seeded in useState alone. Adopt the linked code once it is known, without
  // clobbering anything the user has typed since.
  useEffect(() => {
    if (userData?.patientId) setPatientCode(userData.patientId);
  }, [userData?.patientId]);

  /** Accept only an http(s) origin; anything else would silently break every
   *  API call, which is the failure this field introduced when unvalidated. */
  const saveApiUrl = () => {
    const trimmed = apiUrl.trim().replace(/\/+$/, "");
    if (!trimmed) {
      localStorage.removeItem("renderUrl");
      setApiUrl(getApiBaseUrl());
      setUrlMessage({ ok: true, text: "Cleared. Using the built-in default." });
      return;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("scheme");
      }
    } catch {
      setUrlMessage({
        ok: false,
        text: "Enter a full http:// or https:// address.",
      });
      return;
    }
    localStorage.setItem("renderUrl", trimmed);
    setApiUrl(trimmed);
    setUrlMessage({ ok: true, text: "Saved. New requests use this address." });
  };

  /**
   * Redeem (or clear) the clinician-issued patient code. This is what links the
   * account to exactly one patients/{id} record, so the patient can read their
   * own history. Firestore rules verify the target exists and is in the same
   * clinic; they reject anything else.
   */
  const handleLink = async () => {
    if (!user) return;
    setLinking(true);
    setLinkMessage(null);
    try {
      await linkPatientAccount(user.uid, patientCode);
      setLinkMessage({
        ok: true,
        text: patientCode.trim()
          ? "Linked. Your assessment history is now available."
          : "Unlinked. Your account is no longer connected to a health record.",
      });
    } catch (e) {
      console.error("Error linking patient account:", e);
      setLinkMessage({
        ok: false,
        text: "Could not link that code. Please check it with your practitioner and try again.",
      });
    } finally {
      setLinking(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-8 p-10"
    >
      <div>
        <h1 className="text-4xl font-black text-slate-950 tracking-tighter mb-2">
          Account Settings
        </h1>
        <p className="text-slate-500 font-medium text-lg">
          Manage your {userData?.role} profile details.
        </p>
      </div>

      <div className="bg-white p-10 rounded-[2rem] border border-slate-200/60 shadow-sm space-y-8">
        <div className="flex items-center gap-6 pb-8 border-b border-slate-100">
          <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-black text-3xl">
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-900">
              {user?.email || "User"}
            </h3>
            <p className="text-slate-500 font-bold capitalize">
              {userData?.role} Account
            </p>
          </div>
        </div>

        {userData?.role === "doctor" && (
          <div className="bg-blue-50 border border-blue-200 p-6 rounded-2xl flex items-center justify-between">
            <div>
              <h4 className="font-black text-blue-900 flex items-center gap-2 mb-1">
                <Building size={20} /> Your Clinic ID
              </h4>
              <p className="text-blue-800 text-sm font-medium">
                Give this code to your patients so they can link their accounts
                to your clinic.
              </p>
            </div>
            <div className="bg-white px-6 py-3 rounded-xl border border-blue-200 font-mono font-black text-2xl text-blue-600 tracking-widest">
              {userData.clinicId}
            </div>
          </div>
        )}

        {userData?.role === "patient" && (
          <>
            <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl">
              <h4 className="font-black text-emerald-900 flex items-center gap-2 mb-1">
                <Shield size={20} /> Privacy & Data Sharing
              </h4>
              <p className="text-emerald-800 text-sm font-medium">
                Your health record is accessible only to your own account and to
                practitioners of Clinic ID{" "}
                <strong>{userData.clinicId}</strong>, enforced by database
                security rules.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <Building className="text-emerald-500" size={20} /> Link Your
                Health Record
              </h4>
              <p className="text-slate-500 font-medium text-sm">
                Ask your practitioner for your patient code, then enter it here
                to view your own assessment history.
              </p>
              <input
                type="text"
                value={patientCode}
                onChange={(e) => setPatientCode(e.target.value)}
                placeholder="Enter your patient code"
                className="w-full p-4 rounded-2xl border-2 border-slate-200 focus:border-emerald-500 outline-none font-mono font-bold text-lg"
              />
              <button
                onClick={handleLink}
                disabled={linking}
                className="w-full bg-slate-950 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-50"
              >
                {linking ? "Linking..." : "Save Patient Code"}
              </button>

              {linkMessage && (
                <div
                  className={`p-4 rounded-2xl font-bold text-sm flex items-start gap-2 ${linkMessage.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}
                >
                  {linkMessage.ok ? (
                    <CheckCircle2 size={18} className="flex-shrink-0" />
                  ) : (
                    <AlertCircle size={18} className="flex-shrink-0" />
                  )}
                  {linkMessage.text}
                </div>
              )}
            </div>
          </>
        )}

        {userData?.role === "doctor" && (
          <div className="space-y-6 pt-4">
            <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Shield className="text-emerald-500" /> AI Engine Configuration
            </h4>
            <p className="text-slate-500 font-medium">
              The Ayurvedic AI explanation is generated securely on the backend
              server. No API keys are stored in the browser.
            </p>

            <div className="space-y-3 mt-4">
              <label className="text-sm font-black uppercase tracking-widest text-slate-400">
                Backend API Base URL
              </label>
              <p className="text-slate-500 font-medium text-sm">
                Where this browser sends prediction requests. Leave blank to use
                the address the app was built with.
              </p>
              <p className="text-slate-400 font-medium text-xs">
                Currently in use:{" "}
                <span className="font-mono">{effectiveApiUrl}</span>
              </p>
              <div className="relative">
                <Shield className="absolute left-4 top-4 text-slate-400 w-6 h-6" />
                <input
                  type="url"
                  value={apiUrl}
                  onChange={(e) => {
                    setApiUrl(e.target.value);
                    setUrlMessage(null);
                  }}
                  placeholder="https://your-backend.example.com"
                  className="w-full pl-14 pr-6 py-4 rounded-2xl border-2 border-slate-200 focus:border-emerald-500 outline-none font-bold text-lg font-mono"
                />
              </div>
              <button
                onClick={saveApiUrl}
                className="w-full bg-slate-950 text-white py-3 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-slate-800"
              >
                Save API URL
              </button>

              {urlMessage && (
                <div
                  className={`p-4 rounded-2xl font-bold text-sm flex items-start gap-2 ${urlMessage.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}
                >
                  {urlMessage.ok ? (
                    <CheckCircle2 size={18} className="flex-shrink-0" />
                  ) : (
                    <AlertCircle size={18} className="flex-shrink-0" />
                  )}
                  {urlMessage.text}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
