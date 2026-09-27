import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Building,
  Shield,
  CheckCircle2,
  AlertCircle,
  Save,
  UserRound,
  Copy,
  Check,
  Users,
  MapPin,
  Phone,
  Mail,
  FileText,
} from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  attachMyOrphanedLogs,
  getClinic,
  getPatient,
  linkPatientAccount,
  saveClinic,
  updatePatient,
} from "../services/firestore";
import { patientCodeFromUrl } from "../services/patientCode";
import type { Patient, UserData } from "../types";

/** Clinic details, held as strings because every input is text. */
interface ClinicForm {
  name: string;
  type: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  registrationNo: string;
  notes: string;
}

const EMPTY_CLINIC: ClinicForm = {
  name: "",
  type: "Ayurvedic Clinic",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
  phone: "",
  email: "",
  registrationNo: "",
  notes: "",
};

/** Editable identity fields, held as strings because every input is text. */
interface RecordForm {
  name: string;
  age: string;
  gender: string;
  dosha: string;
  heightCm: string;
  weightKg: string;
}

const EMPTY_FORM: RecordForm = {
  name: "",
  age: "",
  gender: "Male",
  dosha: "Vata",
  heightCm: "",
  weightKg: "",
};

const DOSHAS = [
  "Vata",
  "Pitta",
  "Kapha",
  "Vata-Pitta",
  "Vata-Kapha",
  "Pitta-Kapha",
];

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

  // The patient's own record, loaded once the account is linked to one.
  const [record, setRecord] = useState<Patient | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [form, setForm] = useState<RecordForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // The clinic's organisational details, maintained by its practitioners.
  const [clinicLoading, setClinicLoading] = useState(false);
  const [clinicForm, setClinicForm] = useState<ClinicForm>(EMPTY_CLINIC);
  const [clinicSaving, setClinicSaving] = useState(false);
  const [clinicMessage, setClinicMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // Tracks which value was last copied, so the button shows a tick briefly.
  const [copied, setCopied] = useState<string | null>(null);

  const linkedId = userData?.patientId || "";
  const clinicId = userData?.clinicId || "";

  // userData arrives asynchronously from the auth listener, so the input cannot
  // be seeded in useState alone. Adopt the linked code once it is known, without
  // clobbering anything the user has typed since.
  useEffect(() => {
    if (userData?.patientId) setPatientCode(userData.patientId);
  }, [userData?.patientId]);

  /**
   * Adopt a code handed over in the link (?patient=...).
   *
   * A practitioner sends the patient a link instead of reading the code aloud,
   * so the field arrives already filled. This only PRE-FILLS: it does not link
   * anything. The patient still presses save, which is what keeps "opening a
   * link" from silently attaching a health record to whatever account happens
   * to be signed in on that device.
   *
   * It does not overwrite an already-linked account, which would misrepresent
   * the current link.
   */
  useEffect(() => {
    const fromUrl = patientCodeFromUrl();
    if (fromUrl && !userData?.patientId) setPatientCode(fromUrl);
  }, [userData?.patientId]);

  /**
   * Load the linked record so the patient can see and correct what is stored.
   *
   * This exists because a record is named by whoever registers the patient, and
   * the patient may link to it long afterwards — so the stored name can be
   * someone else's, or simply wrong. Without this the details were permanent.
   */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!linkedId) {
        setRecord(null);
        return;
      }
      setRecordLoading(true);
      try {
        const p = await getPatient(linkedId);
        if (cancelled) return;
        setRecord(p);
        if (p) {
          setForm({
            name: p.name || "",
            age: p.age || "",
            gender: p.gender || "Male",
            dosha: p.dosha || "Vata",
            heightCm: p.heightCm ? String(p.heightCm) : "",
            weightKg: p.weightKg ? String(p.weightKg) : "",
          });
        }
      } catch (e) {
        console.error("Could not load your health record:", e);
      } finally {
        if (!cancelled) setRecordLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [linkedId]);

  /**
   * Load the clinic's organisational details for a practitioner.
   *
   * The document id IS the clinic ID, so there is no lookup indirection. A
   * missing document is a normal first-run state rather than an error: the
   * clinic exists as an id on every account, but may have no details recorded.
   */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (userData?.role !== "doctor" || !clinicId) {
        setClinicForm(EMPTY_CLINIC);
        return;
      }
      setClinicLoading(true);
      try {
        const c = await getClinic(clinicId);
        if (cancelled) return;
        setClinicForm(
          c
            ? {
                name: c.name || "",
                type: c.type || "Ayurvedic Clinic",
                addressLine1: c.addressLine1 || "",
                addressLine2: c.addressLine2 || "",
                city: c.city || "",
                state: c.state || "",
                postalCode: c.postalCode || "",
                country: c.country || "India",
                phone: c.phone || "",
                email: c.email || "",
                registrationNo: c.registrationNo || "",
                notes: c.notes || "",
              }
            : EMPTY_CLINIC,
        );
      } catch (e) {
        console.error("Could not load clinic details:", e);
      } finally {
        if (!cancelled) setClinicLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [userData?.role, clinicId]);

  /**
   * Persist the clinic's details.
   *
   * Any practitioner of the clinic may do this — the details are shared
   * organisational facts, not a per-person record — and the rules bind the id
   * to the caller's own clinic.
   */
  const handleSaveClinic = async () => {
    if (!user) return;
    if (!clinicForm.name.trim()) {
      setClinicMessage({ ok: false, text: "A clinic name is required." });
      return;
    }
    setClinicSaving(true);
    setClinicMessage(null);
    try {
      await saveClinic(clinicId, user.uid, clinicForm);
      setClinicMessage({ ok: true, text: "Clinic details saved." });
    } catch (e) {
      console.error("Could not save clinic details:", e);
      setClinicMessage({
        ok: false,
        text: "Could not save the clinic details. Please try again.",
      });
    } finally {
      setClinicSaving(false);
    }
  };

  /**
   * Save the patient's own corrections.
   *
   * Only the identity fields are sent, and the rules confirm the caller owns
   * this record. Height and weight are parsed defensively so an empty field
   * cannot write NaN into the record.
   */
  const handleSaveRecord = async () => {
    if (!record) return;
    if (!form.name.trim()) {
      setSaveMessage({ ok: false, text: "Your name cannot be empty." });
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const height = parseInt(form.heightCm, 10);
      const weight = parseInt(form.weightKg, 10);
      await updatePatient(record.id, {
        name: form.name.trim(),
        age: form.age.trim(),
        gender: form.gender,
        dosha: form.dosha,
        heightCm: Number.isFinite(height) ? height : undefined,
        weightKg: Number.isFinite(weight) ? weight : undefined,
      });
      setSaveMessage({ ok: true, text: "Saved. Your record has been updated." });
      setForm((prev) => ({ ...prev, name: prev.name.trim() }));
    } catch (e) {
      console.error("Could not save your record:", e);
      setSaveMessage({
        ok: false,
        text: "Could not save your changes. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Redeem (or clear) the clinician-issued patient code. This is what links the
   * account to exactly one patients/{id} record, so the patient can read their
   * own history. Firestore rules verify the target exists and is in the same
   * clinic; they reject anything else.
   *
   * Linking also adopts any diary entries written BEFORE the link, which is what
   * makes them visible to the patient's history and usable by a practitioner.
   * That adoption runs after the link succeeds and is best-effort: failing to
   * attach an old entry must not undo a successful link.
   */
  const handleLink = async () => {
    if (!user) return;
    setLinking(true);
    setLinkMessage(null);
    const code = patientCode.trim();
    try {
      await linkPatientAccount(user.uid, code);
      let attached = 0;
      if (code) {
        attached = await attachMyOrphanedLogs(user.uid, code).catch((e) => {
          console.error("Could not attach earlier diary entries:", e);
          return 0;
        });
      }
      setLinkMessage({
        ok: true,
        text: code
          ? attached > 0
            ? `Linked. Your assessment history is now available, and ${attached} earlier diary ${attached === 1 ? "entry is" : "entries are"} now attached to it.`
            : "Linked. Your assessment history is now available."
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

  const field =
    "w-full p-4 rounded-2xl border-2 border-slate-200 focus:border-emerald-500 outline-none font-bold";
  const label = "text-sm font-black uppercase tracking-widest text-slate-400";

  /**
   * Copy with visible confirmation rather than a silent no-op. Falls back to a
   * plain text selection where the clipboard API is unavailable (some browsers
   * deny it outside secure contexts), so the button never lies about copying.
   */
  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API unavailable: degrade to a visible failure instead of
      // claiming success.
      setCopied(null);
      return;
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
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
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h4 className="font-black text-blue-900 flex items-center gap-2 mb-1">
                  <Building size={20} /> Your Clinic ID
                </h4>
                <p className="text-blue-800 text-sm font-medium">
                  Patients enter this code at registration to join your clinic.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-white px-6 py-3 rounded-xl border border-blue-200 font-mono font-black text-2xl text-blue-600 tracking-widest">
                  {clinicId}
                </div>
                <button
                  onClick={() => copyText("clinic", clinicId)}
                  aria-label="Copy Clinic ID"
                  className="p-3 rounded-xl border border-blue-200 text-blue-600 hover:bg-white transition-colors"
                >
                  {copied === "clinic" ? <Check size={20} /> : <Copy size={20} />}
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200/60 p-6 md:p-8 rounded-[2rem]">
              <h4 className="font-black text-slate-900 flex items-center gap-2 mb-1">
                <Users className="text-emerald-500" size={20} /> Patient Codes
              </h4>
              <p className="text-slate-500 font-medium text-sm">
                Every patient record has a code. Open the patient in{" "}
                <strong>Patient Records</strong> and use{" "}
                <strong>Send to patient</strong> to copy a ready link or message,
                or copy the code itself. The patient enters it on this page under{" "}
                <strong>Link Your Health Record</strong> to see their own history
                and diary. It is the record's document id, so it never changes and
                cannot be guessed from a name.
              </p>
            </div>

            {/* Clinic details. The clinic ID exists on every account, but until
                this existed there was nowhere to record what the clinic
                actually IS — its name, address or contact. Maintained by any
                practitioner of the clinic, since these are shared
                organisational facts rather than a per-person record. */}
            <div className="bg-white border border-slate-200/60 p-6 md:p-8 rounded-[2rem]">
              <div className="flex items-center gap-3 mb-1">
                <Building className="text-emerald-500" size={20} />
                <h4 className="font-black text-slate-900">Clinic Details</h4>
              </div>
              <p className="text-slate-500 font-medium text-sm mb-6">
                Shown to your practitioners and patients, and visible to the
                platform administrator for oversight. Only you and your
                colleagues can edit it.
              </p>

              {clinicLoading ? (
                <div className="space-y-3" aria-busy="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-12 rounded-2xl bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <label className={label} htmlFor="clinic-name">
                        Clinic Name
                      </label>
                      <input
                        id="clinic-name"
                        type="text"
                        value={clinicForm.name}
                        onChange={(e) =>
                          setClinicForm({ ...clinicForm, name: e.target.value })
                        }
                        placeholder="e.g. Sunrise Ayurveda Clinic"
                        className={field}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={label} htmlFor="clinic-type">
                        Type
                      </label>
                      <input
                        id="clinic-type"
                        type="text"
                        value={clinicForm.type}
                        onChange={(e) =>
                          setClinicForm({ ...clinicForm, type: e.target.value })
                        }
                        placeholder="Ayurvedic Clinic"
                        className={field}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={label} htmlFor="clinic-reg">
                        Registration No.
                      </label>
                      <input
                        id="clinic-reg"
                        type="text"
                        value={clinicForm.registrationNo}
                        onChange={(e) =>
                          setClinicForm({ ...clinicForm, registrationNo: e.target.value })
                        }
                        placeholder="Optional"
                        className={field}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className={label} htmlFor="clinic-addr1">
                        Address
                      </label>
                      <input
                        id="clinic-addr1"
                        type="text"
                        value={clinicForm.addressLine1}
                        onChange={(e) =>
                          setClinicForm({ ...clinicForm, addressLine1: e.target.value })
                        }
                        placeholder="Street address"
                        className={field}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <input
                        type="text"
                        aria-label="Address line 2"
                        value={clinicForm.addressLine2}
                        onChange={(e) =>
                          setClinicForm({ ...clinicForm, addressLine2: e.target.value })
                        }
                        placeholder="Area, landmark (optional)"
                        className={field}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={label} htmlFor="clinic-city">
                        City
                      </label>
                      <input
                        id="clinic-city"
                        type="text"
                        value={clinicForm.city}
                        onChange={(e) =>
                          setClinicForm({ ...clinicForm, city: e.target.value })
                        }
                        className={field}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={label} htmlFor="clinic-state">
                        State
                      </label>
                      <input
                        id="clinic-state"
                        type="text"
                        value={clinicForm.state}
                        onChange={(e) =>
                          setClinicForm({ ...clinicForm, state: e.target.value })
                        }
                        className={field}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={label} htmlFor="clinic-postal">
                        Postal Code
                      </label>
                      <input
                        id="clinic-postal"
                        type="text"
                        value={clinicForm.postalCode}
                        onChange={(e) =>
                          setClinicForm({ ...clinicForm, postalCode: e.target.value })
                        }
                        className={field}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={label} htmlFor="clinic-country">
                        Country
                      </label>
                      <input
                        id="clinic-country"
                        type="text"
                        value={clinicForm.country}
                        onChange={(e) =>
                          setClinicForm({ ...clinicForm, country: e.target.value })
                        }
                        className={field}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={label} htmlFor="clinic-phone">
                        Phone
                      </label>
                      <input
                        id="clinic-phone"
                        type="tel"
                        value={clinicForm.phone}
                        onChange={(e) =>
                          setClinicForm({ ...clinicForm, phone: e.target.value })
                        }
                        className={field}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={label} htmlFor="clinic-email">
                        Email
                      </label>
                      <input
                        id="clinic-email"
                        type="email"
                        value={clinicForm.email}
                        onChange={(e) =>
                          setClinicForm({ ...clinicForm, email: e.target.value })
                        }
                        className={field}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className={label} htmlFor="clinic-notes">
                        Notes
                      </label>
                      <textarea
                        id="clinic-notes"
                        value={clinicForm.notes}
                        onChange={(e) =>
                          setClinicForm({ ...clinicForm, notes: e.target.value })
                        }
                        rows={3}
                        placeholder="Opening hours, departments, anything a patient should know."
                        className={`${field} resize-none`}
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSaveClinic}
                    disabled={clinicSaving}
                    className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Save size={20} />
                    {clinicSaving ? "Saving..." : "Save Clinic Details"}
                  </button>

                  {clinicMessage && (
                    <div
                      className={`p-4 rounded-2xl font-bold text-sm flex items-start gap-2 ${clinicMessage.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}
                    >
                      {clinicMessage.ok ? (
                        <CheckCircle2 size={18} className="flex-shrink-0" />
                      ) : (
                        <AlertCircle size={18} className="flex-shrink-0" />
                      )}
                      {clinicMessage.text}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-4 pt-2 text-xs font-bold text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <MapPin size={13} /> {clinicForm.city || "No city yet"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Phone size={13} /> {clinicForm.phone || "No phone yet"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Mail size={13} /> {clinicForm.email || "No email yet"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <FileText size={13} /> Clinic ID {clinicId}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* An administrator's own account, shown read-only.
            There is deliberately nothing to EDIT here. An operator works
            across every clinic and belongs to none, so the clinic field that
            used to live on this page described a tenancy that does not exist
            and has been removed. Role and email are fixed by the rules in any
            case — an administrator cannot be created or promoted from the
            client. Account management happens in the panel, not on one's own
            profile. */}
        {userData?.role === "admin" && (
          <div className="space-y-6">
            <div className="bg-purple-50 border border-purple-200 p-6 rounded-2xl">
              <h4 className="font-black text-purple-900 flex items-center gap-2 mb-1">
                <Shield size={20} /> Platform Administrator
              </h4>
              <p className="text-purple-800 text-sm font-medium">
                You manage accounts and onboarding across every clinic. Clinical
                records are not visible to this role by design — patients,
                assessments and diaries stay under clinic control.
              </p>
            </div>

            <div className="bg-white border border-slate-200/60 p-6 md:p-8 rounded-[2rem]">
              <h4 className="font-black text-slate-900 flex items-center gap-2 mb-6">
                <Shield className="text-purple-500" size={20} /> Your Account
              </h4>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <dt className={label}>Email</dt>
                  <dd className="font-bold text-slate-700 break-words">
                    {user?.email || "—"}
                  </dd>
                </div>
                <div>
                  <dt className={label}>Role</dt>
                  <dd className="font-bold text-slate-700">Platform administrator</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className={label}>Scope</dt>
                  <dd className="font-bold text-slate-700">
                    All clinics. This account is not filed under a clinic —
                    an operator belongs to none.
                  </dd>
                </div>
              </dl>
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

            {/* Correct your own details. A record is named by whoever registers
                the patient, so it can be wrong or belong to the wrong person by
                the time the account is linked. Without this the details were
                permanent and the patient had no way to fix them. */}
            {linkedId && (
              <div className="space-y-5 pt-6 border-t border-slate-100">
                <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <UserRound className="text-emerald-500" size={20} /> Your Health
                  Record Details
                </h4>
                <p className="text-slate-500 font-medium text-sm">
                  These details are stored on your record and are visible to your
                  practitioners. Correct anything that is wrong.
                </p>

                {recordLoading ? (
                  <p className="text-slate-400 font-bold text-sm">
                    Loading your record...
                  </p>
                ) : !record ? (
                  <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-4 font-bold text-sm">
                    Your linked record could not be found. Ask your practitioner
                    to confirm your patient code.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2 md:col-span-2">
                        <label className={label}>Full Name</label>
                        <input
                          type="text"
                          value={form.name}
                          onChange={(e) =>
                            setForm({ ...form, name: e.target.value })
                          }
                          className={field}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className={label}>Age</label>
                        <input
                          type="number"
                          value={form.age}
                          onChange={(e) =>
                            setForm({ ...form, age: e.target.value })
                          }
                          className={field}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className={label}>Sex</label>
                        <select
                          value={form.gender}
                          onChange={(e) =>
                            setForm({ ...form, gender: e.target.value })
                          }
                          className={field}
                        >
                          <option>Male</option>
                          <option>Female</option>
                          <option>Other</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className={label}>Prakriti (Dosha)</label>
                        <select
                          value={form.dosha}
                          onChange={(e) =>
                            setForm({ ...form, dosha: e.target.value })
                          }
                          className={field}
                        >
                          {DOSHAS.map((d) => (
                            <option key={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className={label}>Height (cm)</label>
                        <input
                          type="number"
                          value={form.heightCm}
                          onChange={(e) =>
                            setForm({ ...form, heightCm: e.target.value })
                          }
                          className={field}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className={label}>Weight (kg)</label>
                        <input
                          type="number"
                          value={form.weightKg}
                          onChange={(e) =>
                            setForm({ ...form, weightKg: e.target.value })
                          }
                          className={field}
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleSaveRecord}
                      disabled={saving}
                      className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Save size={20} />
                      {saving ? "Saving..." : "Save My Details"}
                    </button>

                    {saveMessage && (
                      <div
                        className={`p-4 rounded-2xl font-bold text-sm flex items-start gap-2 ${saveMessage.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}
                      >
                        {saveMessage.ok ? (
                          <CheckCircle2 size={18} className="flex-shrink-0" />
                        ) : (
                          <AlertCircle size={18} className="flex-shrink-0" />
                        )}
                        {saveMessage.text}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
