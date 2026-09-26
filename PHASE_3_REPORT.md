# ArogyaAI — Phase 3 Report: Authorization & Security

**Branch:** `feature/final-year-rebuild` · **Previous commit:** `39035bb`
**Scope:** eliminate client-controlled roles, add backend token verification,
version-control Firestore rules, tighten CORS, add security tests.
**Rule honoured:** security was not weakened to make tests pass — see §5.

---

## 1. Security audit performed first

| Check | Method | Result |
|---|---|---|
| Rules in version control? | repo scan | ❌ none — no `firestore.rules`, `firebase.json`, `.firebaserc` |
| Live rules readable? | Firebase CLI / gcloud / service account | ❌ none available |
| Can I still establish the live posture? | unauthenticated REST probe against `arogyaai-cloud-ad667` | ✅ **`403 PERMISSION_DENIED` on `users` and `patients`** |
| Credentials on disk? | repo scan for admin SDK keys | ✅ none |
| Tooling | Java, firebase-tools | installed during this phase to enable real rules testing |

**Conclusion recorded honestly:** the deployed rules are **not** open (403, not
200), but their *text* could not be read, so they cannot be quoted. I did not
guess them — I wrote the intended rules into version control, proved them in the
emulator, and left deployment to the project owner. That limit is stated in
`SECURITY.md` §6.1.

---

## 2. Files created (8)

| File | Purpose |
|---|---|
| `firestore.rules` | The security model: role-gated registration, immutable role/clinic, clinic-scoped records, append-only logs, default-deny |
| `firebase.json` | Firestore + emulator configuration |
| `firestore.indexes.json` | (empty index set; declared so deploys are valid) |
| `.firebaserc` | pins the authoritative project `arogyaai-cloud-ad667` |
| `backend/core/security.py` | Firebase ID-token verification + `require_user` dependency |
| `tests/test_security.py` | 14 unit tests for token verification |
| `tests/rules/firestore.rules.test.js` | 29 emulator tests for the rules |
| `.env.example` | documents every environment variable, placeholders only |
| `SECURITY.md` | rewritten: enforced guarantees + explicit gaps |

## 3. Files modified (6)

| File | Change |
|---|---|
| `backend/api/routes/prediction.py` | `/api/predict` now depends on `require_user` |
| `backend/core/config.py` | added `FIREBASE_PROJECT_ID`, `AUTH_REQUIRED`, cert URL; **CORS wildcard removed** |
| `frontend/src/services/api.ts` | sends `Authorization: Bearer <idToken>`; structured `ApiError` |
| `frontend/src/pages/LoginPage.tsx` | validate-then-create registration; invite-gated doctor path; no client-chosen role |
| `tests/test_backend_api.py` | dependency override for pipeline tests + new `TestBackendAPIAuthorization` class |
| `.gitignore` | ignores emulator logs/artifacts and test `node_modules` |

## 4. What changed, and why it is now safe

1. **Client can no longer choose its role.** Registration writes `role: "patient"`
   or, for a practitioner, a code that Firestore independently validates as
   existing, unused, and issued for the claimed clinic.
2. **Role and clinic are immutable** after creation, so an existing account
   cannot be promoted by an update.
3. **Clinical records are clinic-scoped** in the rules, not merely filtered in
   the UI.
4. **`/api/predict` requires a verified Firebase ID token.** Identity comes from
   the token, never the request body.
5. **The backend holds no service-account key** — verification uses Google's
   public certificates, so there is no privileged credential to leak.
6. **CORS is an allowlist.** The `*` + `allow_credentials` combination is gone;
   it would have let any site call the API with a user's session.

## 5. A test caught a real hole — fixed in the rule, not the test

The first rules run was **26 pass / 1 fail**: a *used* invite still granted doctor,
because the rule checked only that the invite existed. I fixed the rule to require
`used == false`. On review I then found a second, narrower hole myself — a valid
invite could be redeemed against *any* clinic — and bound each invite to one
clinic. Both fixes live in `firestore.rules`; no assertion was relaxed.

## 6. Verification evidence

| Check | Command | Result |
|---|---|---|
| Rules tests | `cd tests/rules && node --test` | ✅ **29/29 pass** (emulator, real rules) |
| Backend tests | `python -m unittest discover -s tests` | ✅ **32/32 pass** |
| Token unit tests | `python -m unittest tests.test_security` | ✅ **14/14 pass** |
| `alg: none` attack | included above | ✅ rejected |
| Missing token → API | `TestBackendAPIAuthorization` | ✅ **401 `MISSING_TOKEN`** |
| Malformed token → API | " | ✅ **401 `INVALID_TOKEN`** |
| Valid token → API | " | ✅ **200**, reaches pipeline |
| Public endpoints | `/`, `/api/health` | ✅ **200 without a token** |
| 401 leaks internals? | " | ✅ no traceback/key material |
| Frontend build | `npm run build` | ✅ exit 0 (770 kB) |
| Frontend types | `npx tsc -b` | ✅ exit 0 |

The security tests run **with the override removed**, so they exercise the real
dependency rather than a stub.

## 7. Behaviour changes

- `/api/predict` **now returns 401 without a token.** This is the intended
  control. The frontend was updated in the same commit to attach the token, so
  the working flow is preserved for signed-in users.
- CORS now rejects origins outside the allowlist (previously any origin).

**Not yet verified end-to-end against a real Firebase session.** The token
round-trip is proven at the unit level and the route level, but a full
browser→Firebase→API call needs a live signed-in user. I have not claimed it works.

## 8. Remaining risks / gaps (also in `SECURITY.md` §6)

1. **The new rules are not deployed.** They are proven in the emulator and
   committed; publishing to `arogyaai-cloud-ad667` needs a console/CLI action.
2. **No stable patient identity** — Phase 4.
3. **Invites are created manually**; no admin role was invented for it.
4. **No rate limiting** on `/api/predict`.
5. **The API is not clinic-aware**; clinic scoping is enforced by Firestore rules.
6. `AUTH_REQUIRED=false` disables verification (local debugging only; default on).

## 9. Git

Committed on `feature/final-year-rebuild`. Rollback: `git revert <sha>` restores
the previous backend and removes the rules files; no data migration occurred.

## 10. Phase 4 recommendation

**Database / patient domain model** — stable `patientId`, `patients/{id}/assessments/{id}`,
and a patient's own read path, so `patients` stops being one row per diagnosis.
This also closes gap §8.2 and lets the API become clinic-aware (gap §8.5).

*STOP — awaiting approval before Phase 4.*
