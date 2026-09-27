import { useEffect, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  Building,
  Save,
  Copy,
  Check,
  Users,
  MapPin,
  Phone,
  Mail,
  FileText,
} from "lucide-react";
import { getClinic, saveClinic } from "../../services/firestore";
import type { UserData } from "../../types";
import { useToast } from "../../components/ui/toast-context";
import { SectionCard } from "../../components/ui/SectionCard";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Textarea } from "../../components/ui/Textarea";
import { Button } from "../../components/ui/Button";

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

/**
 * A practitioner's settings: the clinic ID they share, the patient-code
 * explanation, and the clinic's own organisational details.
 *
 * Behaviour is unchanged from the previous combined settings page — the same
 * read on mount, the same save path, and the same "a missing clinic document is
 * a normal first-run state, not an error" handling.
 */
export default function DoctorProfile({
  user,
  userData,
}: {
  user: FirebaseUser | null;
  userData: UserData | null;
}) {
  const toast = useToast();
  const [clinicLoading, setClinicLoading] = useState(false);
  const [clinicForm, setClinicForm] = useState<ClinicForm>(EMPTY_CLINIC);
  const [clinicSaving, setClinicSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const clinicId = userData?.clinicId || "";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!clinicId) {
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
  }, [clinicId]);

  /**
   * Copy with visible confirmation rather than a silent no-op. Falls back to a
   * visible failure where the clipboard API is unavailable, so the button never
   * lies about having copied.
   */
  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error("Could not copy — please select and copy the code manually.");
      return;
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
  };

  const handleSaveClinic = async () => {
    if (!user) return;
    if (!clinicForm.name.trim()) {
      toast.error("A clinic name is required.");
      return;
    }
    setClinicSaving(true);
    try {
      await saveClinic(clinicId, user.uid, clinicForm);
      toast.success("Clinic details saved.");
    } catch (e) {
      console.error("Could not save clinic details:", e);
      toast.error("Could not save the clinic details. Please try again.");
    } finally {
      setClinicSaving(false);
    }
  };

  return (
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
          <strong>Patient Records</strong> and use <strong>Send to patient</strong>{" "}
          to copy a ready link or message, or copy the code itself. The patient
          enters it on their settings page under{" "}
          <strong>Link your health record</strong> to see their own history and
          diary. It is the record's document id, so it never changes and cannot
          be guessed from a name.
        </p>
      </div>

      <SectionCard
        title="Clinic details"
        icon={<Building size={22} />}
        description="Shown to your practitioners and patients, and visible to the platform administrator for oversight. Only you and your colleagues can edit it."
      >
        {clinicLoading ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Clinic name" className="md:col-span-2">
                <Input
                  value={clinicForm.name}
                  onChange={(e) => setClinicForm({ ...clinicForm, name: e.target.value })}
                  placeholder="e.g. Sunrise Ayurveda Clinic"
                />
              </Field>
              <Field label="Type">
                <Input
                  value={clinicForm.type}
                  onChange={(e) => setClinicForm({ ...clinicForm, type: e.target.value })}
                  placeholder="Ayurvedic Clinic"
                />
              </Field>
              <Field label="Registration no.">
                <Input
                  value={clinicForm.registrationNo}
                  onChange={(e) =>
                    setClinicForm({ ...clinicForm, registrationNo: e.target.value })
                  }
                  placeholder="Optional"
                />
              </Field>
              <Field label="Address" className="md:col-span-2">
                <Input
                  value={clinicForm.addressLine1}
                  onChange={(e) =>
                    setClinicForm({ ...clinicForm, addressLine1: e.target.value })
                  }
                  placeholder="Street address"
                />
              </Field>
              <Field label="Address line 2" className="md:col-span-2">
                <Input
                  value={clinicForm.addressLine2}
                  onChange={(e) =>
                    setClinicForm({ ...clinicForm, addressLine2: e.target.value })
                  }
                  placeholder="Area, landmark (optional)"
                />
              </Field>
              <Field label="City">
                <Input
                  value={clinicForm.city}
                  onChange={(e) => setClinicForm({ ...clinicForm, city: e.target.value })}
                />
              </Field>
              <Field label="State">
                <Input
                  value={clinicForm.state}
                  onChange={(e) => setClinicForm({ ...clinicForm, state: e.target.value })}
                />
              </Field>
              <Field label="Postal code">
                <Input
                  value={clinicForm.postalCode}
                  onChange={(e) =>
                    setClinicForm({ ...clinicForm, postalCode: e.target.value })
                  }
                />
              </Field>
              <Field label="Country">
                <Input
                  value={clinicForm.country}
                  onChange={(e) => setClinicForm({ ...clinicForm, country: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <Input
                  type="tel"
                  value={clinicForm.phone}
                  onChange={(e) => setClinicForm({ ...clinicForm, phone: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={clinicForm.email}
                  onChange={(e) => setClinicForm({ ...clinicForm, email: e.target.value })}
                />
              </Field>
              <Field label="Notes" className="md:col-span-2">
                <Textarea
                  value={clinicForm.notes}
                  onChange={(e) => setClinicForm({ ...clinicForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Opening hours, departments, anything a patient should know."
                />
              </Field>
            </div>

            <Button
              variant="success"
              fullWidth
              size="lg"
              loading={clinicSaving}
              icon={<Save size={20} />}
              onClick={handleSaveClinic}
            >
              Save clinic details
            </Button>

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
      </SectionCard>

      <p className="text-xs font-medium text-slate-400 leading-relaxed">
        Account details such as your email and approval status are fixed by the
        platform, and managed by an administrator. Clinical records remain under
        your clinic's control.
      </p>
    </div>
  );
}
