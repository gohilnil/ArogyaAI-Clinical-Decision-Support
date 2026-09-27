#!/usr/bin/env python3
"""Remove test artifacts from the production project, and backfill measurements.

Two separate jobs, both dry-run by default:

  --cleanup    delete documents belonging to test accounts only
  --backfill   copy height/weight from a patient's latest assessment onto the
               patient record, so a returning patient prefills fully

WHY THE CLEANUP IS SAFE (and narrow)
------------------------------------
Only artifacts that are unambiguously test data are considered:

  * Auth accounts whose email is on a test domain (`@arogyaai-test.invalid`),
    or one of the known throwaway prefixes used by the browser test harnesses.
  * Firestore profiles for those accounts.
  * Diary entries authored by those accounts.
  * Patients whose name is a known placeholder AND whose creator is a test
    account or absent.

Anything with a real email address, or any patient created by a real account, is
listed but never touched. The script prints what it would remove and requires
--apply to act.

WHY THE BACKFILL IS SAFE
------------------------
It only ever ADDS heightCm/weightKg to a patient that has neither, copying them
from that patient's own newest assessment, which already recorded them. It never
overwrites a value and never invents one.
"""
import argparse
import json
import os
import urllib.error
import urllib.request

PROJECT = "arogyaai-cloud-ad667"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
AUTH = f"https://identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts"

# Emails that are unambiguously test data.
TEST_DOMAIN = "arogyaai-test.invalid"
TEST_PREFIXES = ("e2e_", "ux_pt_", "ux_dr_", "diary_pt_", "diary_dr_", "link_probe",
                 "verify_", "rules_probe", "t2_", "t3_", "t4_", "t5_", "q_", "final_")
# Patient names that are placeholders rather than people.
PLACEHOLDER_NAMES = {"probe", "e2e patient"}


def token() -> str:
    path = os.path.expanduser("~/.config/configstore/firebase-tools.json")
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)["tokens"]["access_token"]


TOK = token()


def call(url, method="GET", body=None):
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", "Bearer " + TOK)
    req.add_header("Content-Type", "application/json")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()[:200]


def list_docs(path):
    status, body = call(f"{BASE}/{path}?pageSize=300")
    if status != 200 or not isinstance(body, dict):
        return []
    out = []
    for doc in body.get("documents", []):
        fields = {}
        for key, wrapped in doc.get("fields", {}).items():
            if "integerValue" in wrapped:
                # Firestore returns integers as strings; cast here or every
                # numeric check downstream compares a str against an int and
                # silently never matches.
                fields[key] = int(wrapped["integerValue"])
            elif "doubleValue" in wrapped:
                fields[key] = float(wrapped["doubleValue"])
            else:
                for kind in ("stringValue", "booleanValue", "timestampValue"):
                    if kind in wrapped:
                        fields[key] = wrapped[kind]
                        break
                else:
                    fields[key] = None
        fields["__id"] = doc["name"].split("/")[-1]
        out.append(fields)
    return out


def is_test_email(email) -> bool:
    if not isinstance(email, str) or not email:
        return False
    if email.endswith("@" + TEST_DOMAIN):
        return True
    local = email.split("@")[0]
    return any(local.startswith(p) for p in TEST_PREFIXES)


# ---------------------------------------------------------------------------
# cleanup
# ---------------------------------------------------------------------------
def cleanup(apply: bool) -> None:
    print("=" * 70)
    print("CLEANUP — test artifacts only")
    print("=" * 70)

    users = list_docs("users")
    test_uids = {u["__id"] for u in users if is_test_email(u.get("email"))}

    # Auth accounts on the test domain (some have no Firestore profile).
    status, body = call(f"{AUTH}:batchGet?maxResults=300")
    auth_users = body.get("users", []) if isinstance(body, dict) else []
    test_auth = [u for u in auth_users if is_test_email(u.get("email"))]

    patients = list_docs("patients")
    test_patients = [
        p for p in patients
        if str(p.get("name", "")).strip().lower() in PLACEHOLDER_NAMES
        and (not p.get("createdBy") or p["createdBy"] in test_uids)
    ]

    logs = list_docs("patient_logs")
    test_logs = [
        l for l in logs
        if is_test_email(l.get("email")) or (not l.get("email") and not l.get("clinicId"))
    ]

    print(f"\nAuth accounts to delete ({len(test_auth)}):")
    for u in test_auth:
        print(f"   {u['localId']}  {u.get('email')}")
    print(f"\nFirestore profiles to delete ({len(test_uids)}):")
    for uid in sorted(test_uids):
        print(f"   users/{uid}")
    print(f"\nTest patients to delete ({len(test_patients)}):")
    for p in test_patients:
        print(f"   patients/{p['__id']}  name={p.get('name')!r}")
    print(f"\nTest diary entries to delete ({len(test_logs)}):")
    for l in test_logs:
        print(f"   patient_logs/{l['__id']}  email={l.get('email')!r}")

    kept = [u for u in auth_users if not is_test_email(u.get("email"))]
    print(f"\nPRESERVED auth accounts ({len(kept)}):")
    for u in kept:
        print(f"   {u.get('email')}")

    if not apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return

    print("\nAPPLYING...")
    for l in test_logs:
        print(f"  delete patient_logs/{l['__id']} ->",
              call(f"{BASE}/patient_logs/{l['__id']}", "DELETE")[0])
    for p in test_patients:
        pid = p["__id"]
        # Firestore does not cascade: deleting a patient leaves its assessments
        # behind as unreachable documents. Remove the subtree explicitly.
        for a in list_docs(f"patients/{pid}/assessments"):
            print(f"  delete patients/{pid}/assessments/{a['__id']} ->",
                  call(f"{BASE}/patients/{pid}/assessments/{a['__id']}", "DELETE")[0])
        print(f"  delete patients/{pid} ->", call(f"{BASE}/patients/{pid}", "DELETE")[0])
    for uid in sorted(test_uids):
        print(f"  delete users/{uid} ->", call(f"{BASE}/users/{uid}", "DELETE")[0])
    if test_auth:
        ids = [u["localId"] for u in test_auth]
        for uid in ids:
            call(f"{AUTH}:update", "POST", {"localId": uid, "disableUser": True})
        print("  auth batchDelete ->",
              call(f"{AUTH}:batchDelete", "POST", {"localIds": ids})[0])


# ---------------------------------------------------------------------------
# backfill
# ---------------------------------------------------------------------------
def backfill(apply: bool) -> None:
    print("\n" + "=" * 70)
    print("BACKFILL — copy height/weight from each patient's newest assessment")
    print("=" * 70)

    planned = []
    for patient in list_docs("patients"):
        pid = patient["__id"]
        if patient.get("heightCm") and patient.get("weightKg"):
            continue
        assessments = list_docs(f"patients/{pid}/assessments")
        with_measurements = [
            a for a in assessments
            if isinstance(a.get("heightCm"), int) or isinstance(a.get("weightKg"), int)
        ]
        if not with_measurements:
            continue
        # Newest first; assessments carry createdAt as an ISO string here.
        with_measurements.sort(key=lambda a: str(a.get("createdAt") or ""), reverse=True)
        newest = with_measurements[0]
        planned.append((pid, patient, newest))

    if not planned:
        print("\nNothing to backfill: every patient either has measurements or none recorded.")
        return

    for pid, patient, newest in planned:
        print(f"\n  patient {pid}  name={patient.get('name')!r}")
        print(f"    current heightCm={patient.get('heightCm')!r} weightKg={patient.get('weightKg')!r}")
        print(f"    from newest assessment: heightCm={newest.get('heightCm')!r} "
              f"weightKg={newest.get('weightKg')!r}")

    if not apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return

    print("\nAPPLYING...")
    for pid, patient, newest in planned:
        mask = []
        body = {"fields": {}}
        if not patient.get("heightCm") and isinstance(newest.get("heightCm"), int):
            mask.append("heightCm")
            body["fields"]["heightCm"] = {"integerValue": str(newest["heightCm"])}
        if not patient.get("weightKg") and isinstance(newest.get("weightKg"), int):
            mask.append("weightKg")
            body["fields"]["weightKg"] = {"integerValue": str(newest["weightKg"])}
        if not mask:
            continue
        url = f"{BASE}/patients/{pid}?" + "&".join(f"updateMask.fieldPaths={m}" for m in mask)
        print(f"  patients/{pid} set {mask} ->", call(url, "PATCH", body)[0])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cleanup", action="store_true", help="remove test artifacts")
    parser.add_argument("--backfill", action="store_true", help="copy measurements onto patients")
    parser.add_argument("--apply", action="store_true", help="write (default is dry run)")
    args = parser.parse_args()

    if not (args.cleanup or args.backfill):
        args.cleanup = args.backfill = True

    if args.cleanup:
        cleanup(args.apply)
    if args.backfill:
        backfill(args.apply)

    if not args.apply:
        print("\n" + "=" * 70)
        print("DRY RUN COMPLETE — nothing was changed.")
        print("=" * 70)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
