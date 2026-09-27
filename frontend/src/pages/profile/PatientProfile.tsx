import { useEffect, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  Shield,
  CheckCircle2,
  AlertCircle,
  Save,
  UserRound,
  Link2Off,
  Building,
  Lock,
  Eye,
  EyeOff,
  LogOut,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "../../config/firebase";
import {
  attachMyOrphanedLogs,
  getPatient,
  linkPatientAccount,
  updatePatient,
} from "../../services/firestore";
import { patientCodeFromUrl } from "../../services/patientCode";
import type { Patient, UserData } from "../../types";
import { useToast } from "../../components/ui/toast-context";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { SectionCard } from "../../components/ui/SectionCard";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { Tabs, TabPanel } from "../../components/ui/Tabs";
import { Badge } from "../../components/ui/Badge";

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

/**
 * The patient's own settings, in three sections.
 *
 * The patient view was previously interleaved with the practitioner and admin
 * controls inside one long page, so finding "link my record" meant scrolling
 * past a clinic form that did not apply. Splitting by role and sectioning the
 * patient view makes each task findable, and the privacy section states exactly
 * what the security rules permit rather than a reassuring generality.
 */
export default function PatientProfile({
  user,
  userData,
}: {
  user: FirebaseUser | null;
  userData: UserData | null;
}) {
  const toast = useToast();
  const [tab, setTab] = useState("record");

  const [patientCode, setPatientCode] = useState(userData?.patientId || "");
  const [linking, setLinking] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const [record, setRecord] = useState<Patient | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [form, setForm] = useState<RecordForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const linkedId = userData?.patientId || "";

  // Adopt the linked code once the profile arrives, and pre-fill a code handed
  // over in the URL. The URL case only PRE-FILLS — it never links on load, so
  // opening a link cannot silently attach a record to whatever account is
  // signed in on the device.
  useEffect(() => {
    if (userData?.patientId) setPatientCode(userData.patientId);
  }, [userData?.patientId]);

  useEffect(() => {
    const fromUrl = patientCodeFromUrl();
    if (fromUrl && !userData?.patientId) setPatientCode(fromUrl);
  }, [userData?.patientId]);

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

  const handleSaveRecord = async () => {
    if (!record) return;
    if (!form.name.trim()) {
      toast.error("Your name cannot be empty.");
      return;
    }
    setSaving(true);
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
      toast.success("Your record has been updated.");
    } catch (e) {
      console.error("Could not save your record:", e);
      toast.error("Could not save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleLink = async () => {
    if (!user) return;
    setLinking(true);
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
      toast.success(
        code
          ? attached > 0
            ? `Linked. Your assessment history is now available, and ${attached} earlier diary ${attached === 1 ? "entry is" : "entries are"} now attached.`
            : "Linked. Your assessment history is now available."
          : "Unlinked. Your account is no longer connected to a health record.",
      );
    } catch (e) {
      console.error("Error linking patient account:", e);
      toast.error(
        "Could not link that code. Please check it with your practitioner and try again.",
      );
    } finally {
      setLinking(false);
    }
  };

  const confirmAndUnlink = async () => {
    setConfirmUnlink(false);
    setPatientCode("");
    // Defer to handleLink's own state machine by setting the code empty first.
    if (!user) return;
    setLinking(true);
    try {
      await linkPatientAccount(user.uid, "");
      toast.success("Unlinked. Your account is no longer connected to a health record.");
    } catch (e) {
      console.error("Could not unlink the record:", e);
      toast.error("Could not unlink. Please try again.");
    } finally {
      setLinking(false);
    }
  };

  return (
    <>
      <Tabs
        tabs={[
          { id: "record", label: "Health record", icon: <UserRound size={15} /> },
          { id: "account", label: "Account", icon: <Shield size={15} /> },
          { id: "privacy", label: "Privacy", icon: <Lock size={15} /> },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-8"
      />

      <TabPanel id="record" active={tab}>
        <div className="space-y-8">
          {/* Link / unlink the patient code. */}
          <SectionCard
            title={linkedId ? "Your health record is linked" : "Link your health record"}
            icon={linkedId ? <CheckCircle2 size={22} /> : <Link2Off size={22} />}
            iconTone={
              linkedId
                ? "bg-emerald-100 text-emerald-600"
                : "bg-amber-100 text-amber-600"
            }
            description={
              linkedId
                ? "Your account is connected to exactly one health record. Unlinking stops your assessment history from appearing here."
                : "Ask your practitioner for your patient code, then enter it here to view your own assessment history."
            }
          >
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                <Shield size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs font-medium text-emerald-800 leading-relaxed">
                  Your patient code is the record's identifier, so it is never
                  shown to anyone but you and your clinic. The security rules
                  verify the code belongs to your clinic before linking it.
                </p>
              </div>

              {!linkedId && (
                <>
                  <Field
                    label="Patient code"
                    hint="Your practitioner gives you this after your first assessment."
                  >
                    <div className="relative">
                      <Input
                        type={showCode ? "text" : "password"}
                        value={patientCode}
                        onChange={(e) => setPatientCode(e.target.value)}
                        placeholder="Paste your patient code"
                        mono
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCode((s) => !s)}
                        aria-label={showCode ? "Hide patient code" : "Show patient code"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-700 transition-colors"
                      >
                        {showCode ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </Field>
                  <Button
                    fullWidth
                    size="lg"
                    loading={linking}
                    disabled={!patientCode.trim()}
                    icon={<CheckCircle2 size={20} />}
                    onClick={handleLink}
                  >
                    Link my record
                  </Button>
                </>
              )}

              {linkedId && (
                <Button
                  variant="secondary"
                  onClick={() => setConfirmUnlink(true)}
                  disabled={linking}
                >
                  Unlink this record
                </Button>
              )}
            </div>
          </SectionCard>

          {/* Correct the identity details on the linked record. */}
          {linkedId && (
            <SectionCard
              title="Your record details"
              icon={<UserRound size={22} />}
              iconTone="bg-blue-100 text-blue-600"
              description="These are stored on your health record and visible to your practitioners. Correct anything that is wrong."
            >
              {recordLoading ? (
                <p className="text-slate-400 font-bold text-sm">
                  Loading your record…
                </p>
              ) : !record ? (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm font-bold text-amber-800">
                    Your linked record could not be found. Ask your practitioner
                    to confirm your patient code.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Full name" required className="sm:col-span-2">
                      <Input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    </Field>
                    <Field label="Age">
                      <Input
                        type="number"
                        value={form.age}
                        onChange={(e) => setForm({ ...form, age: e.target.value })}
                      />
                    </Field>
                    <Field label="Sex">
                      <Select
                        value={form.gender}
                        onChange={(e) => setForm({ ...form, gender: e.target.value })}
                      >
                        <option>Male</option>
                        <option>Female</option>
                        <option>Other</option>
                      </Select>
                    </Field>
                    <Field
                      label="Prakriti (dosha)"
                      hint="Your constitution, if your practitioner has assessed it."
                    >
                      <Select
                        value={form.dosha}
                        onChange={(e) => setForm({ ...form, dosha: e.target.value })}
                      >
                        {DOSHAS.map((d) => (
                          <option key={d}>{d}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Height (cm)">
                      <Input
                        type="number"
                        value={form.heightCm}
                        onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
                      />
                    </Field>
                    <Field label="Weight (kg)">
                      <Input
                        type="number"
                        value={form.weightKg}
                        onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
                      />
                    </Field>
                  </div>
                  <Button
                    variant="success"
                    fullWidth
                    size="lg"
                    loading={saving}
                    icon={<Save size={20} />}
                    onClick={handleSaveRecord}
                  >
                    Save my details
                  </Button>
                </div>
              )}
            </SectionCard>
          )}
        </div>
      </TabPanel>

      <TabPanel id="account" active={tab}>
        <SectionCard
          title="Your account"
          icon={<Shield size={22} />}
          iconTone="bg-purple-100 text-purple-600"
        >
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <dt className="text-xs font-black uppercase tracking-widest text-slate-400">
                Email
              </dt>
              <dd className="font-bold text-slate-700 break-words">
                {user?.email || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-black uppercase tracking-widest text-slate-400">
                Role
              </dt>
              <dd className="font-bold text-slate-700">Patient</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-black uppercase tracking-widest text-slate-400">
                Clinic
              </dt>
              <dd className="font-bold text-slate-700 flex items-center gap-2">
                <Building size={15} className="text-slate-400" aria-hidden="true" />
                Clinic ID {userData?.clinicId}
                <Badge tone="neutral">
                  {linkedId ? "Record linked" : "No record linked"}
                </Badge>
              </dd>
            </div>
          </dl>

          <div className="pt-6 mt-6 border-t border-slate-100">
            <Button
              variant="secondary"
              icon={<LogOut size={18} />}
              onClick={() => signOut(auth)}
            >
              Sign out
            </Button>
          </div>
        </SectionCard>
      </TabPanel>

      <TabPanel id="privacy" active={tab}>
        <SectionCard
          title="Privacy & data sharing"
          icon={<Lock size={22} />}
          iconTone="bg-emerald-100 text-emerald-600"
          description="What the database security rules actually allow. These are enforced on the server, not by hiding things in the app."
        >
          <ul className="space-y-4">
            <li className="flex items-start gap-3">
              <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-black text-sm text-slate-800">
                  You see only your own record
                </p>
                <p className="text-sm font-medium text-slate-500 mt-0.5 leading-relaxed">
                  Your account can read exactly one health record — the one your
                  patient code is linked to — and its assessment history.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-black text-sm text-slate-800">
                  Your clinic's practitioners can read your records
                </p>
                <p className="text-sm font-medium text-slate-500 mt-0.5 leading-relaxed">
                  Practitioners of Clinic ID {userData?.clinicId} can read the
                  patients and records belonging to your clinic. No other clinic
                  can.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-black text-sm text-slate-800">
                  Your diary is yours to manage
                </p>
                <p className="text-sm font-medium text-slate-500 mt-0.5 leading-relaxed">
                  You can edit and delete your own diary entries. A practitioner
                  can read them but cannot change or remove them.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Shield size={18} className="text-slate-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-black text-sm text-slate-800">
                  Assessments are retained
                </p>
                <p className="text-sm font-medium text-slate-500 mt-0.5 leading-relaxed">
                  A recorded assessment is never rewritten or deleted, so your
                  clinical history stays intact and auditable.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Shield size={18} className="text-slate-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-black text-sm text-slate-800">
                  The platform administrator cannot read your clinical data
                </p>
                <p className="text-sm font-medium text-slate-500 mt-0.5 leading-relaxed">
                  An operator manages accounts across clinics but is denied
                  patients, assessments and diaries by the rules.
                </p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </TabPanel>

      <ConfirmDialog
        open={confirmUnlink}
        title="Unlink your health record?"
        message="Your assessment history will stop appearing in your portal. Your diary entries are kept. You can link again at any time with the same code."
        confirmLabel="Unlink"
        tone="danger"
        busy={linking}
        onConfirm={confirmAndUnlink}
        onCancel={() => setConfirmUnlink(false)}
      />
    </>
  );
}
