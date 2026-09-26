# ArogyaAI — Security Model

> This document states only what the code and rules **actually enforce**. Each
> guarantee below is backed by an executable test; the enforcement mechanism is
> named so the claim can be checked. Gaps are listed explicitly in
> [§6 Known gaps](#6-known-gaps) rather than glossed over.

---

## 1. Threat model

The assets worth protecting are **clinical records** (`patients`), **patient
diary entries** (`patient_logs`) and the **ability to write them**. The system
assumes an attacker who:

- has the public Firebase web configuration (it ships in the bundle by design)
- can call the Firestore REST API and the ArogyaAI API directly, bypassing the UI
- can register an account and modify any request the client makes

Anything a client sends about *who it is* or *what it is allowed to be* is
therefore untrusted. Authorization is decided by Firestore rules and by the
backend, never by the UI.

## 2. Authentication vs authorization

These are separate concerns enforced in separate places:

| Concern | Mechanism | Location |
|---|---|---|
| Who is calling? | Firebase ID token (RS256, verified against Google's public certs) | `backend/core/security.py` |
| What may they reach? | Firestore rules keyed on the caller's own `users/{uid}` | `firestore.rules` |

Signing in grants nothing by itself. Every Firestore rule that returns data
first resolves the caller's profile document and checks its `role` and `clinicId`.

## 3. Enforced guarantees

### 3.1 Registration cannot choose its own privilege

A client can create exactly one `users/{uid}` document — its own — and the rule
constrains the role it may declare:

- `role == 'patient'` is permitted freely.
- `role == 'doctor'` additionally requires an **invite code** that (a) exists,
  (b) has not been used, and (c) was issued for the *same* `clinicId` being
  claimed. The clinic is taken from the invite, never from the registrant.

*Enforced by:* `firestore.rules` → `match /users/{userId}` → `allow create`.
*Verified by:* `tests/rules/firestore.rules.test.js` —
"registration CANNOT self-create a doctor without an invite",
"...with a used invite", "a valid invite CANNOT be redeemed against a different
clinic", "a non-existent invite code is refused".

### 3.2 Privilege cannot be escalated after creation

`role`, `clinicId` and `email` are **immutable** on update: a request that
changes any of them is denied. Deleting a profile is denied outright.

*Enforced by:* `allow update` comparison against `resource.data`; `allow delete: if false`.
*Verified by:* "a user cannot promote themselves by updating their role",
"a user cannot change their clinicId", "a user cannot delete their own profile".

### 3.3 Clinic isolation of clinical records

A practitioner may read or write a `patients` document — and any assessment
beneath it — only when its `clinicId` equals the practitioner's own, and may
never move a record into another clinic.

*Enforced by:* `match /patients/{patientId}` and
`match /patients/{patientId}/assessments/{assessmentId}` using `myClinic()`,
with `request.resource.data.clinicId == resource.data.clinicId` on update.
*Verified by:* "a doctor can read a patient in their own clinic", "a doctor
CANNOT read a patient in another clinic", "a doctor CANNOT create a patient for
another clinic", "a doctor CANNOT move a patient into another clinic", "a doctor
CANNOT read an assessment in another clinic", "a doctor CANNOT create an
assessment for another clinic".

Assessments written under another clinic, or filed under a patient id that does
not match the path, are refused:
*Verified by:* "a doctor CANNOT file an assessment under a mismatched patientId".

### 3.4 A patient can read exactly their own record

A patient account is linked to one `patients/{id}` document by redeeming a
clinician-issued code, stored as `users/{uid}.patientId`. The rules grant read
access only where that stored value equals the document's id, so a patient can
read their own record and assessment history and **nothing else**.

The link itself is guarded: it may only point at a patient that exists and
belongs to the account's own clinic, so a patient cannot link to a record in
another clinic, nor to a code that does not exist.

*Enforced by:* `ownsPatient(patientId)` and `validPatientLink(...)` in
`firestore.rules`.
*Verified by:* "a linked patient can read their own record", "a patient CANNOT
read another patient's record", "an unlinked patient cannot read any patient
record", "a linked patient can read their own assessment history", "a patient
CANNOT read another patient's assessments", "an unlinked patient cannot read any
assessment history", "a patient MAY link to an existing patient record in their
clinic", "a patient CANNOT link to a patient record in another clinic",
"registration CANNOT link to a non-existent patient record".

A patient cannot enumerate the `patients` collection, cannot create or modify a
clinical record, and cannot run the clinic-wide assessment query:
*Verified by:* "a patient cannot list the patients collection", "a patient
cannot create a clinical patient record", "a patient cannot modify their own
record", "a patient cannot create an assessment", "a patient cannot run a
collection-group query over assessments".

### 3.5 Diary entries are owned, clinic-bound and append-only

A `patient_logs` entry may be created only with `userId` equal to the caller's
own uid, and `clinicId` equal to the caller's **own** clinic — so a patient
cannot forge an entry attributed to someone else, nor write one into another
clinic's feed. Entries cannot be modified or deleted by anyone.

*Verified by:* "a patient can create their own log entry", "a patient CANNOT
write a log entry attributed to someone else", "a user CANNOT write a log entry
into another clinic", "logs are append-only".

### 3.5a Invite codes cannot be enumerated

An invite may be fetched by its exact code but the collection may **not** be
listed. `get` and `list` are separate rules for this reason: a single `read`
would also authorise a query, letting any signed-in account discover every
invite and its `clinicId`, then register as a doctor in a clinic of their
choosing. The code is treated as a capability that must be presented, not
discovered.

*Enforced by:* `match /invites/{code}` → `allow get` / `allow list: if false`.
*Verified by:* "an invite can be fetched by code but NOT enumerated".

*Consequence for operators:* issuer-side code entropy now matters, since the code
is the only secret. Use a long random code (the console generates one; do not
hand-write short codes).

### 3.6 Unauthenticated requests are refused

- Firestore: unauthenticated reads of `users`, `patients` and `patient_logs` are denied.
- API: `POST /api/predict` returns `401` without a valid token.

*Verified by:* rules test "unauthenticated cannot read users, patients or
patient_logs"; `tests/test_backend_api.py` → `TestBackendAPIAuthorization`.

### 3.7 Unknown paths are denied

A catch-all rule denies everything not explicitly matched, so adding a
collection without a rule fails closed.

*Verified by:* "a collection with no rule is denied by default".

### 3.8 API token verification is strict

A request to `/api/predict` is accepted only when the bearer token's signature,
`aud`, `iss`, `exp`/`iat` and non-empty `sub` all validate. Rejected: wrong
signing key, expired token, wrong audience, wrong issuer, empty subject, unknown
key id, missing `kid`, malformed input, and the unsigned `alg: none` attack.

*Enforced by:* `backend/core/security.py`.
*Verified by:* `tests/test_security.py` (14 tests).

The backend holds **no service-account private key**. Verification uses Google's
public certificates, so there is no long-lived privileged credential on the
server to leak.

### 3.9 Errors do not leak internals

A `401` body contains a stable code (`MISSING_TOKEN` / `INVALID_TOKEN`) and a
generic message — never the token, a stack trace, or key material.

*Verified by:* "test_invalid_token_raises_401_without_leaking_detail",
"test_unauthorized_response_does_not_leak_internals".

### 3.10 CORS is an allowlist

The wildcard origin was removed. Only the origins in `AROGYA_CORS_ORIGINS`
(default: local dev ports plus the deployed frontend) may call the API with
credentials. A wildcard combined with `allow_credentials` would let any site
reuse a user's session.

## 4. Data flow of an authorized prediction

```
browser: currentUser.getIdToken()
   └─ Authorization: Bearer <id_token>
        └─ FastAPI  require_user()
             ├─ verify signature against Google's public certs
             ├─ check aud / iss / exp / iat / sub
             └─ attach verified claims  →  handler runs
                  └─ Firestore writes are independently authorized by rules
```

The caller's identity comes from the **token**, never from the JSON body.

## 5. How to run the security tests

```bash
# Backend token verification and route protection
python -m unittest tests.test_security tests.test_backend_api

# Firestore rules. Needs Java on PATH (the emulator shells out to `java
# -version` and exits with "Could not spawn" if it cannot find it).
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jre-21.0.12.101-hotspot"
export PATH="$JAVA_HOME/bin:$PATH"
firebase emulators:exec --only firestore --project arogyaai-cloud-ad667 \
  "cd tests/rules && npm test"
```

**Status: 61/61 rules tests pass**, executed against the emulator with Temurin
JRE 21.0.12.1 — not merely syntax-checked. This includes the regressions for the
clinic-binding and invite-enumeration fixes in §3.5 and §3.5a, and query-level
coverage for the list queries the UI issues (a `getDoc` test does not prove a
`getDocs` query is authorised — Firestore denies the whole result set if the
query's own constraints cannot satisfy the rule).

The rules those tests exercise are the ones in this repository. Whether the
*deployed* rules match them is a separate question, still open (§6.1).

## 6. Known gaps

These are real and are **not** claimed as solved:

1. **The live rules could not be read.** No Firebase CLI session, service
   account or console access was available, so the currently deployed rules
   cannot be quoted here. What *was* established by direct probe:
   unauthenticated reads of `users` and `patients` return `403
   PERMISSION_DENIED`, so the deployed rules are **not** open. The rules in this
   repository are the intended target and still need to be **deployed**.
2. **Legacy per-diagnosis documents are not migrated.** Records written before
   Phase 4 use the old shape (one document per diagnosis, identity copied in,
   `diagnosis` instead of `prediction`). They are deliberately left in place and
   are not displayed, because deciding whether two such rows are the same person
   is a clinical-safety judgement that cannot be automated safely. See
   `PHASE_4_MIGRATION_PLAN.md` §4.
3. **Invite documents are created manually** (console or admin SDK), which
   bypasses the rules by design. There is no self-service invite UI, and an
   admin role was deliberately not invented.
4. **Rate limiting is per-process, not shared.** `/api/predict` now enforces a
   per-caller ceiling (`AROGYA_RATE_LIMIT_PER_MINUTE`, default 30/min) keyed on
   the verified uid, implemented as an in-process sliding window
   (`backend/core/rate_limit.py`). It is honest about its limit: the counter
   lives in the process, so if the service is ever scaled horizontally each
   instance enforces its own ceiling and the effective limit multiplies by the
   instance count. A shared store is the correct fix *if* that ever happens;
   adding one now would be infrastructure the project does not need. The tracked
   caller map is bounded at 10k entries, evicting least-recently-used callers so
   a flood of distinct accounts cannot exhaust memory.
5. **The API does not check the caller's clinic.** It has no Firestore
   credentials and never touches the database; it is a stateless ML + Gemini
   service. All data authorization therefore happens in Firestore rules, and the
   prediction endpoint itself is not clinic-aware. Stated plainly rather than
   implied to be more.
6. **`AROGYA_AUTH_REQUIRED=false` disables verification.** It exists solely for
   local debugging, defaults to on, and is not set in any deployment file.
7. **The patient link is a capability code, not a verified identity.** A patient
   code is unguessable in practice and the rules check the target exists in the
   same clinic, but redeeming a code another person shared would grant access to
   that record. This is a deliberate trade-off: email verification is not
   required for the demo's unverified accounts, so `email_verified` could not be
   used as the link. Stated here so it is not mistaken for identity proof.
