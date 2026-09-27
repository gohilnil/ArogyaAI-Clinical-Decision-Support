#!/usr/bin/env python3
"""Migrate legacy patient documents that embed a clinical event.

The Phase 4 model splits two things that were once one document:

    patients/{patientId}                              a PERSON (identity only)
    patients/{patientId}/assessments/{assessmentId}   a CLINICAL EVENT

Two patient documents in the live project predate that split and carry the
clinical fields inline (verified 2026-09-27):

    patients/pulyKEw2dWSGEN2neyq2   diagnosis "Tension Headache"  confidence 44
    patients/ggWnxQIfd1KWeiauMAyL   diagnosis "Diarrhea"          confidence 69

The UI reads identity off the patient and lists events from the subcollection,
so those records render as "No assessments yet" and the recorded analysis is
invisible even though it exists.

This script converts each such document into a proper assessment subdocument.
It is DRY-RUN by default. Behaviour:

  * no flags        -> report only, writes nothing (safe to run anytime)
  * --apply         -> creates the missing assessment subdocuments
  * --apply --prune -> additionally removes the obsolete inline clinical fields,
                       and ONLY after confirming the assessment exists. Removal
                       destroys the original copy of that data, so it is opt-in
                       and never implied by --apply alone.

It is idempotent: an assessment this script already created is tagged
`migratedFrom` and is not created twice.

Auth reuses the OAuth token the Firebase CLI stores. The token rotates, so if
this fails with 401 run `firebase projects:list` first.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

PROJECT = "arogyaai-cloud-ad667"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"

# Marker written onto every assessment this script creates, so a re-run can
# recognise its own work and an operator can tell migrated data from recorded.
MIGRATION_TAG = "legacy-embedded-patient-doc"

# A patient document is "legacy" when it carries clinical fields inline.
LEGACY_CLINICAL_FIELDS = ("diagnosis", "confidence", "symptoms")


def access_token() -> str:
    path = os.path.expanduser("~/.config/configstore/firebase-tools.json")
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)["tokens"]["access_token"]


def request(url: str, method: str = "GET", body=None, token: str = ""):
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Content-Type", "application/json")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as exc:
        return exc.code, {"error": exc.read().decode()[:300]}


def scalar(fields: dict) -> dict:
    """Flatten Firestore's typed field wrapper into plain Python values."""
    out = {}
    for key, wrapped in fields.items():
        for kind in (
            "stringValue",
            "booleanValue",
            "integerValue",
            "doubleValue",
            "timestampValue",
        ):
            if kind in wrapped:
                out[key] = wrapped[kind]
                break
        else:
            if "nullValue" in wrapped:
                out[key] = None
            elif "mapValue" in wrapped:
                out[key] = scalar(wrapped["mapValue"].get("fields", {}))
            elif "arrayValue" in wrapped:
                out[key] = wrapped["arrayValue"].get("values", [])
    return out


def list_docs(path: str, token: str):
    status, body = request(f"{BASE}/{path}?pageSize=300", token=token)
    if status != 200 or not isinstance(body, dict):
        print(f"  ERROR reading {path}: HTTP {status} {str(body)[:200]}")
        return []
    docs = []
    for doc in body.get("documents", []):
        item = scalar(doc.get("fields", {}))
        item["__id"] = doc["name"].split("/")[-1]
        docs.append(item)
    return docs


def is_legacy(patient: dict) -> bool:
    return any(field in patient for field in LEGACY_CLINICAL_FIELDS)


def build_assessment(patient: dict) -> dict:
    """Map the inline clinical fields onto the current assessment shape."""
    diagnosis = patient.get("diagnosis") or ""
    age = patient.get("age")
    return {
        "patientId": patient["__id"],
        "clinicId": patient.get("clinicId", ""),
        "symptoms": patient.get("symptoms") or "",
        "age": "" if age is None else str(age),
        "gender": patient.get("gender") or "",
        "dosha": patient.get("dosha") or "",
        "season": "",
        "weather": "",
        "foodHabits": "",
        "prediction": diagnosis,
        # The inline record predates the confidence gate, so its stored label is
        # the model's raw output; record it as such rather than inventing one.
        "mlPrediction": diagnosis,
        "confidence": patient.get("confidence", 0),
        "aiReport": "",
        # Preserve the original instant so history ordering stays truthful.
        "createdAt": {"timestampValue": patient["createdAt"]},
        "migratedFrom": MIGRATION_TAG,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the changes")
    parser.add_argument(
        "--prune",
        action="store_true",
        help="ALSO delete the obsolete inline fields (only with --apply)",
    )
    args = parser.parse_args()

    if args.prune and not args.apply:
        print("--prune requires --apply (it writes). Refusing.")
        return 2

    token = access_token()
    patients = list_docs("patients", token)
    legacy = [p for p in patients if is_legacy(p)]

    print("=" * 70)
    print(f"PATIENTS: {len(patients)}   LEGACY (inline clinical fields): {len(legacy)}")
    print("=" * 70)
    if not legacy:
        print("Nothing to migrate.")
        return 0

    planned = []
    for patient in legacy:
        pid = patient["__id"]
        clinic = patient.get("clinicId", "")
        assessment_id = f"legacy_{pid}"
        existing = list_docs(f"patients/{pid}/assessments", token)
        already = any(a.get("migratedFrom") == MIGRATION_TAG for a in existing)
        planned.append((patient, assessment_id, already, existing))

        print(f"\npatient {pid}  name={patient.get('name')!r}  clinic={clinic!r}")
        print(f"  inline diagnosis={patient.get('diagnosis')!r} "
              f"confidence={patient.get('confidence')!r}")
        print(f"  existing assessments: {len(existing)}"
              + ("  (already migrated)" if already else ""))
        if not clinic:
            print("  SKIP: patient has no clinicId; an assessment cannot be scoped.")
        elif already:
            print("  SKIP: assessment already present.")
        else:
            print(f"  WOULD CREATE patients/{pid}/assessments/{assessment_id}")

    if not args.apply:
        print("\n" + "=" * 70)
        print("DRY RUN - nothing written. Re-run with --apply to migrate.")
        print("=" * 70)
        return 0

    print("\n" + "=" * 70)
    print("APPLYING")
    print("=" * 70)
    created = 0
    for patient, assessment_id, already, _ in planned:
        pid = patient["__id"]
        clinic = patient.get("clinicId", "")
        if already or not clinic:
            continue
        url = f"{BASE}/patients/{pid}/assessments/{assessment_id}"
        status, body = request(
            url, method="PATCH", body={"fields": _wrap(build_assessment(patient))},
            token=token,
        )
        print(f"  create patients/{pid}/assessments/{assessment_id} -> HTTP {status}")
        if status == 200:
            created += 1
        else:
            print(f"     {str(body)[:200]}")

    # Verify before any pruning: an assessment must exist and be tagged.
    print("\n" + "=" * 70)
    print("VERIFY")
    print("=" * 70)
    verified = []
    for patient, assessment_id, _, _ in planned:
        pid = patient["__id"]
        docs = list_docs(f"patients/{pid}/assessments", token)
        found = [a for a in docs if a.get("migratedFrom") == MIGRATION_TAG]
        print(f"  patients/{pid}: {len(docs)} assessment(s), "
              f"{len(found)} migrated")
        if found:
            verified.append(pid)

    if args.prune:
        print("\n" + "=" * 70)
        print("PRUNING obsolete inline fields (assessment verified present)")
        print("=" * 70)
        for patient in legacy:
            pid = patient["__id"]
            if pid not in verified:
                print(f"  patients/{pid}: SKIP - no verified migration")
                continue
            mask = "&".join(
                f"updateMask.fieldPaths={f}"
                for f in LEGACY_CLINICAL_FIELDS
                if f in patient
            )
            # A field present in updateMask but absent from the body is deleted.
            url = f"{BASE}/patients/{pid}?{mask}"
            status, _ = request(url, method="PATCH", body={"fields": {}}, token=token)
            print(f"  patients/{pid}: remove {LEGACY_CLINICAL_FIELDS} -> HTTP {status}")

    print(f"\nCreated {created} assessment(s).")
    return 0


def _wrap(values: dict) -> dict:
    """Wrap plain Python values into Firestore's typed field shape."""
    out = {}
    for key, value in values.items():
        if isinstance(value, dict):
            out[key] = value  # already a typed wrapper, e.g. timestampValue
        elif isinstance(value, bool):
            out[key] = {"booleanValue": value}
        elif isinstance(value, int):
            out[key] = {"integerValue": str(value)}
        elif isinstance(value, float):
            out[key] = {"doubleValue": value}
        elif value is None:
            out[key] = {"nullValue": None}
        else:
            out[key] = {"stringValue": str(value)}
    return out


if __name__ == "__main__":
    sys.exit(main())
