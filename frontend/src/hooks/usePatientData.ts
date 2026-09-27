// Everything a patient page needs about the signed-in account's own records,
// loaded once and reused.
//
// The dashboard, the history list and the assessment detail page all read the
// same four things — the linked patient record, that patient's assessments, the
// account's own diary entries, and the clinic's organisational details. Loading
// them per page with copy-pasted effect code meant the same three-way "is it
// linked? do we have a clinic?" branching was written three times and drifted.
//
// Access is exactly what the rules already permit for a patient: their own
// patient doc, that patient's assessments, diaries keyed on their own uid, and
// their own clinic doc. Nothing here widens the patient's reach.

import { useCallback, useEffect, useState } from "react";
import {
  getClinic,
  getPatient,
  listMyLogs,
  listPatientAssessments,
} from "../services/firestore";
import type { Assessment, Clinic, Patient, PatientLog, UserData } from "../types";

export interface PatientData {
  /** The linked patient record, or null when the account is not linked (or the
   *  record could not be found). */
  patient: Patient | null;
  assessments: Assessment[];
  logs: PatientLog[];
  clinic: Clinic | null;
  loading: boolean;
  /** Set when a fetch failed, so the page shows a retry instead of empty cards
   *  that would read as "you have no records". */
  error: string | null;
  reload: () => void;
}

export function usePatientData(
  userId: string | null,
  userData: UserData | null,
): PatientData {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [logs, setLogs] = useState<PatientLog[]>([]);
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const linked = Boolean(userData?.patientId);
  const patientId = userData?.patientId || "";
  const clinicId = userData?.clinicId || "";

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        // The diary is always available — it is keyed on the account — so it is
        // fetched regardless of whether a patient code has been redeemed.
        const diary = await listMyLogs(userId);
        if (cancelled) return;
        setLogs(diary);

        // The clinical record and the clinic doc each require more than the
        // account id, and are simply absent until those links exist.
        const [p, a, c] = await Promise.all([
          linked && patientId ? getPatient(patientId) : Promise.resolve(null),
          linked && patientId && clinicId
            ? listPatientAssessments(clinicId, patientId)
            : Promise.resolve<Assessment[]>([]),
          clinicId ? getClinic(clinicId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setPatient(p);
        setAssessments(a);
        setClinic(c);
      } catch (e) {
        if (cancelled) return;
        console.error("Could not load your health record:", e);
        setError(
          "We could not load your health records just now. Please check your connection and try again.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [userId, linked, patientId, clinicId, nonce]);

  return { patient, assessments, logs, clinic, loading, error, reload };
}
