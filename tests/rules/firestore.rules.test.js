/**
 * Firestore security-rule tests for ArogyaAI.
 *
 * Runs against the Firestore emulator using the rules in /firestore.rules.
 * Every assertion below corresponds to a security guarantee claimed in
 * SECURITY.md, so a passing run is evidence for those claims rather than an
 * assertion about them.
 *
 * Start the emulator first:
 *   firebase emulators:start --only firestore --project arogyaai-cloud-ad667
 * Then:
 *   cd tests/rules && npm test
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { readFileSync } from "node:fs";
import { test, before, after, beforeEach } from "node:test";

const PROJECT_ID = "arogyaai-cloud-ad667";
const RULES = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");

let testEnv;

const DOCTOR_A = { uid: "doctor-a", role: "doctor", clinicId: "CLIN01", email: "a@clinic.test" };
const DOCTOR_B = { uid: "doctor-b", role: "doctor", clinicId: "CLIN02", email: "b@clinic.test" };
// patient-1 is linked (via patientId) to the patient record P001.
const PATIENT_1 = { uid: "patient-1", role: "patient", clinicId: "CLIN01", email: "p1@test.test", patientId: "P001" };
// patient-2 is unlinked, so it owns no patient record.
const PATIENT_2 = { uid: "patient-2", role: "patient", clinicId: "CLIN01", email: "p2@test.test" };
// patient-3 is linked to P003, a LEGACY record with no `createdBy` field.
// Records created before that field existed look like this, and they are the
// ones most likely to carry a wrong name — so the update path must handle them.
const PATIENT_3 = { uid: "patient-3", role: "patient", clinicId: "CLIN01", email: "p3@test.test", patientId: "P003" };
// The platform operator. Provisioned out-of-band, and deliberately WITHOUT a
// clinicId: an operator belongs to no clinic, so the real document has no such
// key. Seeding it that way is what proves the rules never read the field
// directly — a direct read of a missing key is an evaluation error, not false.
const ADMIN = { uid: "admin-1", role: "admin", email: "admin@arogyaai.test" };

/** A context whose caller has a provisioned users/{uid} profile. */
function as(user) {
  return testEnv.authenticatedContext(user.uid).firestore();
}

function anon() {
  return testEnv.unauthenticatedContext().firestore();
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const u of [DOCTOR_A, DOCTOR_B, PATIENT_1, PATIENT_2, PATIENT_3, ADMIN]) {
      const profile = { email: u.email, role: u.role };
      if (u.clinicId) profile.clinicId = u.clinicId;
      if (u.patientId) profile.patientId = u.patientId;
      await setDoc(doc(db, "users", u.uid), profile);
    }
    // Patient identity (person) in CLIN01, and one in CLIN02.
    await setDoc(doc(db, "patients", "P001"), {
      name: "Ananya Sharma", age: "30", gender: "Female", dosha: "Pitta",
      clinicId: "CLIN01", createdBy: "doctor-a",
    });
    await setDoc(doc(db, "patients", "P002"), {
      name: "Ravi Verma", age: "41", gender: "Male", dosha: "Vata",
      clinicId: "CLIN01", createdBy: "doctor-a",
    });
    await setDoc(doc(db, "patients", "PB01"), {
      name: "Beta Person", age: "50", gender: "Male", dosha: "Kapha",
      clinicId: "CLIN02", createdBy: "doctor-b",
    });
    // A legacy record: no `createdBy` at all. Reading a missing field in a rule
    // raises an evaluation error, so this shape is what broke patient self-edit
    // on exactly the records that needed it.
    await setDoc(doc(db, "patients", "P003"), {
      name: "Legacy Name", age: "45", gender: "Female", dosha: "Vata",
      clinicId: "CLIN01",
    });
    // Assessments (clinical events) under each patient.
    await setDoc(doc(db, "patients", "P001", "assessments", "A001"), {
      patientId: "P001", clinicId: "CLIN01", symptoms: "fever",
      prediction: "Malaria", mlPrediction: "Malaria", confidence: 70,
      createdBy: "doctor-a",
    });
    await setDoc(doc(db, "patients", "PB01", "assessments", "AB01"), {
      patientId: "PB01", clinicId: "CLIN02", symptoms: "cough",
      prediction: "Bronchitis", confidence: 60, createdBy: "doctor-b",
    });
    await setDoc(doc(db, "patient_logs", "log1"), {
      userId: "patient-1", clinicId: "CLIN01", symptoms: "headache",
    });
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES, host: "127.0.0.1", port: 8080 },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed();
});

// ---------------------------------------------------------------------------
// Baseline: unauthenticated access
// ---------------------------------------------------------------------------
test("unauthenticated cannot read users, patients, assessments or logs", async () => {
  const db = anon();
  await assertFails(getDoc(doc(db, "users", "doctor-a")));
  await assertFails(getDoc(doc(db, "patients", "P001")));
  await assertFails(getDoc(doc(db, "patients", "P001", "assessments", "A001")));
  await assertFails(getDoc(doc(db, "patient_logs", "log1")));
});

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
test("a user can read their own profile", async () => {
  await assertSucceeds(getDoc(doc(as(DOCTOR_A), "users", "doctor-a")));
});

test("a user cannot read another user's profile", async () => {
  await assertFails(getDoc(doc(as(DOCTOR_A), "users", "doctor-b")));
  await assertFails(getDoc(doc(as(PATIENT_1), "users", "doctor-a")));
});

test("registration may self-create a patient profile", async () => {
  const db = testEnv.authenticatedContext("new-patient").firestore();
  await assertSucceeds(
    setDoc(doc(db, "users", "new-patient"), {
      email: "new@test.test", role: "patient", clinicId: "CLIN01",
    }),
  );
});

// The approval workflow replaced invites: a doctor self-registers into a
// `pending` state and only an admin can move them out of it. These tests pin
// both halves — that self-registration lands pending, and that the pending
// state actually gates access.
test("registration self-creates a doctor in the pending state", async () => {
  const db = testEnv.authenticatedContext("new-doctor").firestore();
  await assertSucceeds(
    setDoc(doc(db, "users", "new-doctor"), {
      email: "nd@clinic.test", role: "doctor", clinicId: "CLIN01", status: "pending",
    }),
  );
});

test("registration CANNOT self-create an approved doctor", async () => {
  // Self-approving at registration would make the admin gate theatre.
  const db = testEnv.authenticatedContext("self-approver").firestore();
  await assertFails(
    setDoc(doc(db, "users", "self-approver"), {
      email: "sa@test.test", role: "doctor", clinicId: "CLIN01", status: "approved",
    }),
  );
});

test("a doctor cannot register without an explicit pending status", async () => {
  const db = testEnv.authenticatedContext("no-status").firestore();
  await assertFails(
    setDoc(doc(db, "users", "no-status"), {
      email: "ns@test.test", role: "doctor", clinicId: "CLIN01",
    }),
  );
});

test("a pending doctor can read only their own profile", async () => {
  const db = testEnv.authenticatedContext("pending-doc").firestore();
  await setDoc(doc(db, "users", "pending-doc"), {
    email: "pd@clinic.test", role: "doctor", clinicId: "CLIN01", status: "pending",
  });
  await assertSucceeds(getDoc(doc(db, "users", "pending-doc")));
  await assertFails(getDoc(doc(db, "patients", "P001")));
  await assertFails(getDocs(collection(db, "patients")));
});

test("only an admin can approve a pending doctor", async () => {
  const db = testEnv.authenticatedContext("awaiting").firestore();
  await setDoc(doc(db, "users", "awaiting"), {
    email: "aw@clinic.test", role: "doctor", clinicId: "CLIN01", status: "pending",
  });
  // The doctor themself cannot flip their own status.
  await assertFails(updateDoc(doc(db, "users", "awaiting"), { status: "approved" }));
  // An admin can.
  await assertSucceeds(
    updateDoc(doc(as(ADMIN), "users", "awaiting"), { status: "approved" }),
  );
});

test("an admin can reject a pending doctor", async () => {
  await assertSucceeds(
    updateDoc(doc(as(ADMIN), "users", "patient-2"), { role: "doctor", status: "rejected" }),
  );
});

test("an admin cannot set an unknown status", async () => {
  await assertFails(
    updateDoc(doc(as(ADMIN), "users", "patient-2"), { status: "superuser" }),
  );
});

test("a user cannot promote themselves by updating their role", async () => {
  await assertFails(
    updateDoc(doc(as(PATIENT_1), "users", "patient-1"), { role: "doctor" }),
  );
});

test("a user cannot change their clinicId", async () => {
  await assertFails(
    updateDoc(doc(as(PATIENT_1), "users", "patient-1"), { clinicId: "CLIN02" }),
  );
});

test("a user cannot update another user's profile", async () => {
  await assertFails(
    updateDoc(doc(as(PATIENT_1), "users", "doctor-a"), { role: "patient" }),
  );
});

test("a user cannot delete their own profile", async () => {
  await assertFails(deleteDoc(doc(as(PATIENT_1), "users", "patient-1")));
});

// --- patient account linking (capability model) ----------------------------
test("a patient MAY link to an existing patient record in their clinic", async () => {
  const db = testEnv.authenticatedContext("linker").firestore();
  await setDoc(doc(db, "users", "linker"), {
    email: "l@test.test", role: "patient", clinicId: "CLIN01",
  });
  await assertSucceeds(
    updateDoc(doc(db, "users", "linker"), { patientId: "P002" }),
  );
});

test("a patient CANNOT link to a patient record in another clinic", async () => {
  const db = testEnv.authenticatedContext("crosslink").firestore();
  await setDoc(doc(db, "users", "crosslink"), {
    email: "c@test.test", role: "patient", clinicId: "CLIN01",
  });
  await assertFails(
    updateDoc(doc(db, "users", "crosslink"), { patientId: "PB01" }),
  );
});

test("registration CANNOT link to a non-existent patient record", async () => {
  const db = testEnv.authenticatedContext("fakelink").firestore();
  await assertFails(
    setDoc(doc(db, "users", "fakelink"), {
      email: "f@test.test", role: "patient", clinicId: "CLIN01", patientId: "NOPE99",
    }),
  );
});

// ---------------------------------------------------------------------------
// patients (identity)
// ---------------------------------------------------------------------------
test("a doctor can read a patient in their own clinic", async () => {
  await assertSucceeds(getDoc(doc(as(DOCTOR_A), "patients", "P001")));
});

test("a doctor CANNOT read a patient in another clinic", async () => {
  await assertFails(getDoc(doc(as(DOCTOR_A), "patients", "PB01")));
  await assertFails(getDoc(doc(as(DOCTOR_B), "patients", "P001")));
});

test("a linked patient can read their own record", async () => {
  await assertSucceeds(getDoc(doc(as(PATIENT_1), "patients", "P001")));
});

test("a patient CANNOT read another patient's record", async () => {
  await assertFails(getDoc(doc(as(PATIENT_1), "patients", "P002")));
});

test("an unlinked patient cannot read any patient record", async () => {
  await assertFails(getDoc(doc(as(PATIENT_2), "patients", "P001")));
});

test("a doctor can list patients filtered by their own clinic", async () => {
  await assertSucceeds(
    getDocs(query(collection(as(DOCTOR_A), "patients"), where("clinicId", "==", "CLIN01"))),
  );
});

test("a doctor CANNOT list patients of another clinic", async () => {
  await assertFails(
    getDocs(query(collection(as(DOCTOR_A), "patients"), where("clinicId", "==", "CLIN02"))),
  );
});

test("a patient cannot list the patients collection", async () => {
  await assertFails(
    getDocs(query(collection(as(PATIENT_1), "patients"), where("clinicId", "==", "CLIN01"))),
  );
});

test("a doctor can create a patient in their own clinic", async () => {
  await assertSucceeds(
    addDoc(collection(as(DOCTOR_A), "patients"), {
      name: "Gamma", age: "22", gender: "Other", dosha: "Vata",
      clinicId: "CLIN01", createdBy: "doctor-a",
    }),
  );
});

test("a doctor CANNOT create a patient for another clinic", async () => {
  await assertFails(
    addDoc(collection(as(DOCTOR_A), "patients"), {
      name: "Sneaky", age: "22", gender: "Other", dosha: "Vata",
      clinicId: "CLIN02", createdBy: "doctor-a",
    }),
  );
});

test("a doctor cannot attribute a created patient to another doctor", async () => {
  await assertFails(
    addDoc(collection(as(DOCTOR_A), "patients"), {
      name: "Forged", age: "22", gender: "Other", dosha: "Vata",
      clinicId: "CLIN01", createdBy: "doctor-b",
    }),
  );
});

test("a patient cannot create a clinical patient record", async () => {
  await assertFails(
    addDoc(collection(as(PATIENT_1), "patients"), {
      name: "Self", age: "30", gender: "Female", dosha: "Pitta",
      clinicId: "CLIN01", createdBy: "patient-1",
    }),
  );
});

test("a doctor CANNOT move a patient into another clinic", async () => {
  await assertFails(
    updateDoc(doc(as(DOCTOR_A), "patients", "P001"), { clinicId: "CLIN02" }),
  );
});

test("a doctor can update a patient in their own clinic", async () => {
  await assertSucceeds(
    updateDoc(doc(as(DOCTOR_A), "patients", "P001"), { dosha: "Vata-Pitta" }),
  );
});

test("a doctor cannot modify a patient in another clinic", async () => {
  await assertFails(
    updateDoc(doc(as(DOCTOR_A), "patients", "PB01"), { name: "Tampered" }),
  );
});

// A record is created by whoever registers the patient, so it is often named
// before the patient links an account. Letting the linked patient correct their
// OWN identity is what stops a wrong name being permanent. The update stays
// confined to identity fields, and clinicId/createdBy remain immutable.
test("a linked patient CAN correct their own identity fields", async () => {
  await assertSucceeds(
    updateDoc(doc(as(PATIENT_1), "patients", "P001"), { name: "Ananya S. Sharma" }),
  );
  await assertSucceeds(
    updateDoc(doc(as(PATIENT_1), "patients", "P001"), { heightCm: 164 }),
  );
});

// The bug this pins: `createdBy` is absent on records created before that field
// existed, and reading a missing field in a rule raises an evaluation error that
// denies the whole request. Comparing createdBy directly therefore rejected every
// edit to a legacy record — the exact records most likely to carry a wrong name.
test("a patient CAN correct a LEGACY record that has no createdBy field", async () => {
  await assertSucceeds(
    updateDoc(doc(as(PATIENT_3), "patients", "P003"), { name: "Corrected Name" }),
  );
});

test("a legacy record cannot silently GAIN a createdBy value", async () => {
  // The safe read compares defaults, so "absent" stays absent rather than
  // letting an update quietly claim authorship.
  await assertFails(
    updateDoc(doc(as(PATIENT_3), "patients", "P003"), {
      name: "Corrected Name",
      createdBy: "patient-3",
    }),
  );
});

test("a doctor can also correct a legacy record in their own clinic", async () => {
  await assertSucceeds(
    updateDoc(doc(as(DOCTOR_A), "patients", "P003"), { name: "Doctor Corrected" }),
  );
});

test("a patient CANNOT modify a record they are not linked to", async () => {
  await assertFails(
    updateDoc(doc(as(PATIENT_1), "patients", "P002"), { name: "Not Mine" }),
  );
  await assertFails(
    updateDoc(doc(as(PATIENT_2), "patients", "P001"), { name: "Not Mine" }),
  );
});

test("a patient cannot move their record to another clinic", async () => {
  await assertFails(
    updateDoc(doc(as(PATIENT_1), "patients", "P001"), { clinicId: "CLIN02" }),
  );
});

test("a patient cannot reassign who created their record", async () => {
  await assertFails(
    updateDoc(doc(as(PATIENT_1), "patients", "P001"), { createdBy: "patient-1" }),
  );
});

test("a patient cannot smuggle a non-identity field into the update", async () => {
  // Confining the allowed keys is what keeps "correct my name" from becoming a
  // way to write clinical data straight onto a patient document.
  await assertFails(
    updateDoc(doc(as(PATIENT_1), "patients", "P001"), {
      name: "Ananya S. Sharma",
      diagnosis: "Self-diagnosed",
    }),
  );
  await assertFails(
    updateDoc(doc(as(PATIENT_1), "patients", "P001"), {
      name: "Ananya S. Sharma",
      confidence: 99,
    }),
  );
});

test("patients cannot be deleted from a client", async () => {
  await assertFails(deleteDoc(doc(as(DOCTOR_A), "patients", "P001")));
});

// ---------------------------------------------------------------------------
// assessments (clinical events)
// ---------------------------------------------------------------------------
test("a doctor can read an assessment in their own clinic", async () => {
  await assertSucceeds(
    getDoc(doc(as(DOCTOR_A), "patients", "P001", "assessments", "A001")),
  );
});

test("a doctor CANNOT read an assessment in another clinic", async () => {
  await assertFails(
    getDoc(doc(as(DOCTOR_A), "patients", "PB01", "assessments", "AB01")),
  );
});

// Regression: a practitioner's list of a subcollection is authorised by the
// SAME rule as a single read, and Firestore denies the whole result set unless
// the query's own constraints satisfy it. The doctor branch checks
// resource.data.clinicId, so an UNFILTERED read of this subcollection is
// denied — even for a patient the practitioner created.
//
// That asymmetry shipped: the patient's own history page worked (its branch is
// path-scoped and needs no filter) while a practitioner opening the same
// patient got "Could not load this patient record." The client now always
// filters by clinicId; these two tests pin the behaviour on both sides so the
// filter cannot be dropped again.
test("a doctor CANNOT list a patient's assessments without a clinicId filter", async () => {
  await assertFails(
    getDocs(collection(as(DOCTOR_A), "patients", "P001", "assessments")),
  );
});

test("a doctor can list a patient's assessments filtered by their clinic", async () => {
  await assertSucceeds(
    getDocs(
      query(
        collection(as(DOCTOR_A), "patients", "P001", "assessments"),
        where("clinicId", "==", "CLIN01"),
      ),
    ),
  );
});

test("a linked patient can read their own assessment history", async () => {
  await assertSucceeds(
    getDocs(collection(as(PATIENT_1), "patients", "P001", "assessments")),
  );
});

test("a patient CANNOT read another patient's assessments", async () => {
  await assertFails(
    getDocs(collection(as(PATIENT_1), "patients", "P002", "assessments")),
  );
});

test("an unlinked patient cannot read any assessment history", async () => {
  await assertFails(
    getDocs(collection(as(PATIENT_2), "patients", "P001", "assessments")),
  );
});

test("a doctor can create an assessment in their own clinic", async () => {
  await assertSucceeds(
    addDoc(collection(as(DOCTOR_A), "patients", "P001", "assessments"), {
      patientId: "P001", clinicId: "CLIN01", symptoms: "cough",
      prediction: "Bronchitis", confidence: 55, createdBy: "doctor-a",
    }),
  );
});

test("a doctor CANNOT create an assessment for another clinic", async () => {
  await assertFails(
    addDoc(collection(as(DOCTOR_A), "patients", "P001", "assessments"), {
      patientId: "P001", clinicId: "CLIN02", symptoms: "cough",
      prediction: "Bronchitis", confidence: 55, createdBy: "doctor-a",
    }),
  );
});

test("a doctor CANNOT file an assessment under a mismatched patientId", async () => {
  await assertFails(
    addDoc(collection(as(DOCTOR_A), "patients", "P001", "assessments"), {
      patientId: "P002", clinicId: "CLIN01", symptoms: "cough",
      prediction: "Bronchitis", confidence: 55, createdBy: "doctor-a",
    }),
  );
});

test("a patient cannot create an assessment", async () => {
  await assertFails(
    addDoc(collection(as(PATIENT_1), "patients", "P001", "assessments"), {
      patientId: "P001", clinicId: "CLIN01", symptoms: "self-diagnosis",
      prediction: "X", confidence: 99, createdBy: "patient-1",
    }),
  );
});

test("assessments are append-only", async () => {
  await assertFails(
    updateDoc(doc(as(DOCTOR_A), "patients", "P001", "assessments", "A001"), {
      prediction: "Tampered",
    }),
  );
  await assertFails(
    deleteDoc(doc(as(DOCTOR_A), "patients", "P001", "assessments", "A001")),
  );
});

test("a doctor can read assessments across their clinic via collection group", async () => {
  await assertSucceeds(
    getDocs(
      query(collectionGroup(as(DOCTOR_A), "assessments"), where("clinicId", "==", "CLIN01")),
    ),
  );
});

test("a doctor CANNOT read another clinic's assessments via collection group", async () => {
  await assertFails(
    getDocs(
      query(collectionGroup(as(DOCTOR_A), "assessments"), where("clinicId", "==", "CLIN02")),
    ),
  );
});

test("a patient cannot run a collection-group query over assessments", async () => {
  await assertFails(
    getDocs(
      query(collectionGroup(as(PATIENT_1), "assessments"), where("clinicId", "==", "CLIN01")),
    ),
  );
});

// ---------------------------------------------------------------------------
// patient_logs
// ---------------------------------------------------------------------------
test("a patient can create their own log entry", async () => {
  await assertSucceeds(
    addDoc(collection(as(PATIENT_2), "patient_logs"), {
      userId: "patient-2", clinicId: "CLIN01", symptoms: "fatigue",
    }),
  );
});

test("a patient CANNOT write a log entry attributed to someone else", async () => {
  await assertFails(
    addDoc(collection(as(PATIENT_2), "patient_logs"), {
      userId: "patient-1", clinicId: "CLIN01", symptoms: "spoofed",
    }),
  );
});

// Regression: the create rule once checked only that clinicId was a string, so
// a signed-in user could write an entry into a clinic they do not belong to and
// have its practitioners read it. clinicId must be the writer's own clinic.
test("a user CANNOT write a log entry into another clinic", async () => {
  await assertFails(
    addDoc(collection(as(PATIENT_1), "patient_logs"), {
      userId: "patient-1", clinicId: "CLIN02", symptoms: "cross-tenant",
    }),
  );
  await assertFails(
    addDoc(collection(as(DOCTOR_A), "patient_logs"), {
      userId: "doctor-a", clinicId: "CLIN02", symptoms: "cross-tenant",
    }),
  );
});

test("a patient can read their own log but not another patient's", async () => {
  await assertSucceeds(getDoc(doc(as(PATIENT_1), "patient_logs", "log1")));
  await assertFails(getDoc(doc(as(PATIENT_2), "patient_logs", "log1")));
});

test("a doctor can read logs belonging to their clinic", async () => {
  await assertSucceeds(getDoc(doc(as(DOCTOR_A), "patient_logs", "log1")));
});

// The clinician diary tab issues exactly this list query (listClinicLogs).
// It was previously covered only by single-document reads, which do not test
// query authorisation: Firestore evaluates a list against the same rule, and
// denies the WHOLE result set if the query's own constraints cannot satisfy
// it. A rule that passes a getDoc test can still fail every real query.
test("a doctor can LIST their clinic's logs with the query the UI issues", async () => {
  await assertSucceeds(
    getDocs(
      query(collection(as(DOCTOR_A), "patient_logs"), where("clinicId", "==", "CLIN01")),
    ),
  );
});

test("a doctor CANNOT list another clinic's logs", async () => {
  await assertFails(
    getDocs(
      query(collection(as(DOCTOR_A), "patient_logs"), where("clinicId", "==", "CLIN02")),
    ),
  );
});

test("a patient CANNOT list the clinic log feed", async () => {
  // A patient may read their own entry by id, but must not be able to sweep
  // the whole clinic's diary feed.
  await assertFails(
    getDocs(
      query(collection(as(PATIENT_1), "patient_logs"), where("clinicId", "==", "CLIN01")),
    ),
  );
});

test("logs are append-only", async () => {
  await assertFails(
    updateDoc(doc(as(PATIENT_1), "patient_logs", "log1"), { symptoms: "edited" }),
  );
  await assertFails(deleteDoc(doc(as(PATIENT_1), "patient_logs", "log1")));
});

// An entry written before the account was linked carries no patientId, so it
// appears in the clinic diary but cannot be opened for analysis against a
// patient and never reaches the patient's own history. The single permitted
// update is letting the author attach it to their OWN linked record.
test("a linked patient can attach their own entry to their patient record", async () => {
  await assertSucceeds(
    updateDoc(doc(as(PATIENT_1), "patient_logs", "log1"), { patientId: "P001" }),
  );
});

test("a patient CANNOT attach their entry to someone else's record", async () => {
  await assertFails(
    updateDoc(doc(as(PATIENT_1), "patient_logs", "log1"), { patientId: "P002" }),
  );
});

test("an UNLINKED patient cannot attach an entry", async () => {
  // patient-2 has no patientId, so there is no record to attach to.
  await assertFails(
    updateDoc(doc(as(PATIENT_2), "patient_logs", "log1"), { patientId: "P001" }),
  );
});

test("a patient CANNOT attach another account's entry", async () => {
  await assertFails(
    updateDoc(doc(as(PATIENT_2), "patient_logs", "log1"), { patientId: "P002" }),
  );
});

test("attaching cannot smuggle any other change", async () => {
  // Confining the update to `patientId` is what keeps the diary trustworthy;
  // without it "attach" would be a way to rewrite clinical history.
  await assertFails(
    updateDoc(doc(as(PATIENT_1), "patient_logs", "log1"), {
      patientId: "P001",
      symptoms: "rewritten",
    }),
  );
  await assertFails(
    updateDoc(doc(as(PATIENT_1), "patient_logs", "log1"), {
      patientId: "P001",
      clinicId: "CLIN02",
    }),
  );
});

test("a doctor cannot attach a patient's entry", async () => {
  await assertFails(
    updateDoc(doc(as(DOCTOR_A), "patient_logs", "log1"), { patientId: "P001" }),
  );
});

// ---------------------------------------------------------------------------
// clinics — the entity a practitioner maintains
// ---------------------------------------------------------------------------
// A patient is NEVER gated on approval: holding a clinic ID is sufficient. Only
// practitioners wait for an admin decision. This is asserted explicitly because
// it is a product requirement, not an accident of the rules.
test("a patient account is usable immediately, with no approval step", async () => {
  const db = testEnv.authenticatedContext("instant-patient").firestore();
  await assertSucceeds(
    setDoc(doc(db, "users", "instant-patient"), {
      email: "ip@test.test", role: "patient", clinicId: "CLIN01",
    }),
  );
});

/** Create CLIN01's details record as one of its own practitioners. */
async function seedClinic01() {
  await setDoc(doc(as(DOCTOR_A), "clinics", "CLIN01"), {
    name: "Sunrise Ayurveda", city: "Ahmedabad", createdBy: "doctor-a",
  });
}

test("a doctor of the clinic can create its details record", async () => {
  await assertSucceeds(
    setDoc(doc(as(DOCTOR_A), "clinics", "CLIN01"), {
      name: "Sunrise Ayurveda", city: "Ahmedabad", createdBy: "doctor-a",
    }),
  );
});

test("a doctor CANNOT create a clinic record for another clinic", async () => {
  await assertFails(
    setDoc(doc(as(DOCTOR_A), "clinics", "CLIN02"), {
      name: "Someone Else's Clinic", createdBy: "doctor-a",
    }),
  );
});

test("a clinic record is readable by its own clinic and admin, not others", async () => {
  await seedClinic01();
  await assertSucceeds(getDoc(doc(as(DOCTOR_A), "clinics", "CLIN01")));
  await assertSucceeds(getDoc(doc(as(PATIENT_1), "clinics", "CLIN01")));
  await assertSucceeds(getDoc(doc(as(ADMIN), "clinics", "CLIN01")));
  // A practitioner of another clinic cannot read it.
  await assertFails(getDoc(doc(as(DOCTOR_B), "clinics", "CLIN01")));
});

test("a doctor can update their clinic's details", async () => {
  await seedClinic01();
  await assertSucceeds(
    updateDoc(doc(as(DOCTOR_A), "clinics", "CLIN01"), {
      phone: "+91 99999 00000", city: "Surat",
    }),
  );
});

test("another clinic's doctor cannot update these details", async () => {
  await seedClinic01();
  await assertFails(
    updateDoc(doc(as(DOCTOR_B), "clinics", "CLIN01"), { city: "Tampered" }),
  );
});

test("a doctor cannot rewrite who created the clinic record", async () => {
  await seedClinic01();
  await assertFails(
    updateDoc(doc(as(DOCTOR_A), "clinics", "CLIN01"), { createdBy: "doctor-b" }),
  );
});

test("a clinic update cannot smuggle in an arbitrary field", async () => {
  await seedClinic01();
  await assertFails(
    updateDoc(doc(as(DOCTOR_A), "clinics", "CLIN01"), { verified: true }),
  );
});

test("a patient cannot create or edit their clinic's record", async () => {
  await assertFails(
    setDoc(doc(as(PATIENT_1), "clinics", "CLIN01"), {
      name: "Patient Made This", createdBy: "patient-1",
    }),
  );
  await seedClinic01();
  await assertFails(
    updateDoc(doc(as(PATIENT_1), "clinics", "CLIN01"), { phone: "000" }),
  );
});

test("a clinic record cannot be deleted", async () => {
  await seedClinic01();
  await assertFails(deleteDoc(doc(as(DOCTOR_A), "clinics", "CLIN01")));
});

test("a collection with no rule is denied by default", async () => {
  await assertFails(getDoc(doc(as(DOCTOR_A), "audit_logs", "anything")));
  await assertFails(
    setDoc(doc(as(DOCTOR_A), "audit_logs", "anything"), { x: 1 }),
  );
});

// ---------------------------------------------------------------------------
// admin — account management only, deliberately NOT clinical data
// ---------------------------------------------------------------------------
test("an admin can read any user profile", async () => {
  await assertSucceeds(getDoc(doc(as(ADMIN), "users", "doctor-a")));
  await assertSucceeds(getDoc(doc(as(ADMIN), "users", "patient-1")));
});

test("an admin can correct a user's clinic", async () => {
  // The strand-an-account case: a profile registered into the wrong clinic.
  await assertSucceeds(
    updateDoc(doc(as(ADMIN), "users", "patient-2"), { clinicId: "CLIN02" }),
  );
});

test("an admin can correct a user's role", async () => {
  await assertSucceeds(
    updateDoc(doc(as(ADMIN), "users", "patient-2"), { role: "doctor" }),
  );
});

test("an admin CANNOT set an unknown role", async () => {
  await assertFails(
    updateDoc(doc(as(ADMIN), "users", "patient-2"), { role: "superadmin" }),
  );
});

test("an admin CANNOT set an invalid clinic id", async () => {
  await assertFails(
    updateDoc(doc(as(ADMIN), "users", "patient-2"), { clinicId: "NOPE" }),
  );
});

test("an admin update cannot smuggle extra fields", async () => {
  await assertFails(
    updateDoc(doc(as(ADMIN), "users", "patient-2"), {
      clinicId: "CLIN02",
      selfGranted: true,
    }),
  );
});

test("a non-admin CANNOT correct another user's profile", async () => {
  await assertFails(
    updateDoc(doc(as(DOCTOR_A), "users", "patient-1"), { clinicId: "CLIN02" }),
  );
});

test("an admin cannot self-mint an admin profile at registration", async () => {
  // The admin path for creation is deliberately absent: provisioning happens
  // out-of-band, so no client — including a real admin — can create one.
  await assertFails(
    setDoc(doc(as(ADMIN), "users", "self-made-admin"), {
      email: "x@y.test", role: "admin", clinicId: "CLIN01",
    }),
  );
});

test("an admin can delete a user profile", async () => {
  await assertSucceeds(deleteDoc(doc(as(ADMIN), "users", "patient-2")));
  await assertFails(deleteDoc(doc(as(DOCTOR_A), "users", "patient-2")));
});

test("admin gains NOTHING over clinical data", async () => {
  // Separation of duties: the operator who manages accounts still cannot read
  // a patient's identity, assessments, or diary. These are the privacy line.
  await assertFails(getDoc(doc(as(ADMIN), "patients", "P001")));
  await assertFails(
    getDoc(doc(as(ADMIN), "patients", "P001", "assessments", "A001")),
  );
  await assertFails(getDoc(doc(as(ADMIN), "patient_logs", "log1")));
  await assertFails(
    getDocs(
      query(
        collectionGroup(as(ADMIN), "assessments"),
        where("clinicId", "==", "CLIN01"),
      ),
    ),
  );
  await assertFails(
    addDoc(collection(as(ADMIN), "patients"), {
      name: "Admin Patient", clinicId: "CLIN01", createdBy: "admin-1",
    }),
  );
});

// ---------------------------------------------------------------------------
// Admin and tenancy (clinic + patient link)
// ---------------------------------------------------------------------------
// An operator works across every clinic and belongs to none, so an admin
// carries NO clinic and NO patient link — the fields are forbidden, not merely
// optional. A patient or doctor must carry a real clinic: it is the tenancy
// boundary their clinical reads are scoped by.

test("an admin MAY NOT carry a clinic, even a well-formed one", async () => {
  await assertFails(
    updateDoc(doc(as(ADMIN), "users", "admin-1"), { clinicId: "CLIN02" }),
  );
});

test("an admin cannot carry a malformed clinic either", async () => {
  // "NOTSIX" would NOT be a valid case here — it is exactly six characters.
  // The malformed values are genuinely the wrong length.
  await assertFails(
    updateDoc(doc(as(ADMIN), "users", "admin-1"), { clinicId: "SHORT" }),
  );
  await assertFails(
    updateDoc(doc(as(ADMIN), "users", "admin-1"), { clinicId: "TOOLONG9" }),
  );
});

test("an admin CANNOT give a patient an empty clinic", async () => {
  // The exemption is for the admin ROLE, not for the caller. A patient with no
  // clinic would be a record no clinic-scoped query could ever reach.
  await assertFails(
    updateDoc(doc(as(ADMIN), "users", "patient-2"), { clinicId: "" }),
  );
});

test("an admin CANNOT give a doctor an empty clinic", async () => {
  await assertFails(
    updateDoc(doc(as(ADMIN), "users", "doctor-a"), { clinicId: "" }),
  );
});

test("promoting an account to admin REQUIRES clearing its clinic", async () => {
  // Otherwise the promoted account would keep asserting a tenancy its new role
  // does not have — the exact confusion the role split removes.
  await assertFails(
    updateDoc(doc(as(ADMIN), "users", "doctor-a"), { role: "admin" }),
  );
});

test("promoting an account to admin works once the clinic is cleared", async () => {
  await assertSucceeds(
    updateDoc(doc(as(ADMIN), "users", "doctor-a"), {
      role: "admin",
      clinicId: "",
    }),
  );
});

test("promoting a LINKED patient to admin REQUIRES clearing the link too", async () => {
  // patient-1 is linked to P001. A stale link on an admin would attach a
  // clinical record to an account that cannot read it.
  await assertFails(
    updateDoc(doc(as(ADMIN), "users", "patient-1"), {
      role: "admin",
      clinicId: "",
    }),
  );
});

test("promoting a linked patient to admin works once clinic and link are cleared", async () => {
  await assertSucceeds(
    updateDoc(doc(as(ADMIN), "users", "patient-1"), {
      role: "admin",
      clinicId: "",
      patientId: "",
    }),
  );
});

test("an admin cannot be given a patient link", async () => {
  await assertFails(
    updateDoc(doc(as(ADMIN), "users", "admin-1"), { patientId: "P001" }),
  );
});

test("a patient cannot clear their own clinic to escape the boundary", async () => {
  await assertFails(
    updateDoc(doc(as(PATIENT_1), "users", "patient-1"), { clinicId: "" }),
  );
});

// --- audit log -------------------------------------------------------------
// Append-only accountability trail. A client-written log is not tamper-proof,
// but the rules still enforce everything they structurally can.

const AUDIT = (actorUid = "admin-1") => ({
  actorUid,
  actorEmail: "admin@arogyaai.test",
  action: "status-approved",
  summary: "Approved someone.",
  targetId: "awaiting",
  targetLabel: "aw@clinic.test",
  before: {},
  after: { status: "approved" },
  at: serverTimestamp(),
});

test("an admin can write an audit entry", async () => {
  await assertSucceeds(addDoc(collection(as(ADMIN), "audit_logs"), AUDIT()));
});

test("a non-admin CANNOT write an audit entry", async () => {
  await assertFails(
    addDoc(collection(as(DOCTOR_A), "audit_logs"), AUDIT("doctor-a")),
  );
});

test("an unauthenticated caller cannot write an audit entry", async () => {
  await assertFails(addDoc(collection(anon(), "audit_logs"), AUDIT("nobody")));
});

test("an admin CANNOT attribute an audit entry to somebody else", async () => {
  // Otherwise the trail could be used to frame another operator.
  await assertFails(
    addDoc(collection(as(ADMIN), "audit_logs"), AUDIT("doctor-a")),
  );
});

test("an audit entry without an action is refused", async () => {
  await assertFails(
    addDoc(collection(as(ADMIN), "audit_logs"), { ...AUDIT(), action: "" }),
  );
});

test("an audit entry must carry a timestamp", async () => {
  const { at, ...noTimestamp } = AUDIT();
  void at;
  await assertFails(addDoc(collection(as(ADMIN), "audit_logs"), noTimestamp));
});

test("a non-admin CANNOT read the audit log", async () => {
  await assertFails(getDocs(collection(as(DOCTOR_A), "audit_logs")));
  await assertFails(getDocs(collection(as(PATIENT_1), "audit_logs")));
});

test("an admin CAN read the audit log", async () => {
  await assertSucceeds(getDocs(collection(as(ADMIN), "audit_logs")));
});

test("an audit entry is immutable once written", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "audit_logs", "e1"), {
      actorUid: "admin-1", actorEmail: "admin@arogyaai.test",
      action: "status-approved", summary: "x", targetId: "t",
      targetLabel: "", before: {}, after: {}, at: new Date(),
    });
  });
  await assertFails(
    updateDoc(doc(as(ADMIN), "audit_logs", "e1"), { summary: "rewritten" }),
  );
  await assertFails(deleteDoc(doc(as(ADMIN), "audit_logs", "e1")));
});
