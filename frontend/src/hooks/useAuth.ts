import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import type { UserData } from "../types";

/**
 * Tracks the Firebase auth session and the matching users/{uid} profile.
 *
 * The profile is watched with a live listener rather than read once. A
 * one-shot read is not sufficient here, and the reason is a real ordering
 * problem rather than a preference:
 *
 *   registration creates the auth account, THEN writes the profile document.
 *   `onAuthStateChanged` fires during account creation, before that write
 *   commits, so a single getDoc observes no document and the new account sits
 *   with no role until the page is manually reloaded. The same one-shot read is
 *   why redeeming a patient code in Profile required a reload to take effect.
 *
 * WHY SNAPSHOTS WITH PENDING WRITES ARE HELD BACK
 * ------------------------------------------------
 * A snapshot is only acted on once the document reflects acknowledged server
 * state. This matters because every clinic-scoped query is authorised by a rule
 * that reads the caller's own profile document:
 *
 *     patients: allow read if (isDoctor() && ...)
 *     isDoctor()  ->  get(users/{uid}).data.role == 'doctor'
 *
 * During registration the profile write is applied locally first, so the
 * listener fires with the new document before the server has it. Publishing
 * that snapshot let the dashboard issue its clinic query in the same window,
 * and the server evaluated the rule against a profile that did not exist yet:
 * `get()` returned null, `.data` raised a null-value evaluation error, and the
 * whole clinic query was denied. A freshly registered practitioner saw
 * "Could not load clinic statistics" and an empty dashboard until they
 * reloaded; a returning user never saw it, which is the signature of a race
 * present only on the first load after registration.
 *
 * `metadata.hasPendingWrites` is the signal, NOT `metadata.fromCache`. That was
 * measured against the emulator rather than assumed: for an unacknowledged
 * local write the listener reports `fromCache: false` with
 * `hasPendingWrites: true`, so a fromCache check passes straight through and
 * the race survives. A query issued while the write is pending reproduces the
 * denial exactly; the same query issued after acknowledgement succeeds.
 *
 * THE TIMEOUT IS DELIBERATE
 * -------------------------
 * If the server cannot be reached, the write never acknowledges and no
 * server-confirmed snapshot ever arrives. Waiting indefinitely would strand the
 * app on the loading screen, so after a grace period the held value is
 * published and an offline or flaky connection degrades to the previous
 * behaviour instead of hanging. A query issued then fails on its own, and the
 * pages already render that error.
 */
const SERVER_CONFIRM_TIMEOUT_MS = 4000;

export function useAuth() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    // The profile listener is tied to the current account, so it is torn down
    // and re-established whenever the signed-in identity changes.
    let unsubscribeProfile: (() => void) | null = null;
    let confirmTimer: ReturnType<typeof setTimeout> | null = null;

    const clearConfirmTimer = () => {
      if (confirmTimer !== null) {
        clearTimeout(confirmTimer);
        confirmTimer = null;
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;
      clearConfirmTimer();

      if (!currentUser) {
        setUser(null);
        setUserData(null);
        setAuthLoading(false);
        return;
      }

      setUser(currentUser);

      unsubscribeProfile = onSnapshot(
        doc(db, "users", currentUser.uid),
        { includeMetadataChanges: true },
        (snapshot) => {
          const publish = () => {
            setUserData(snapshot.exists() ? (snapshot.data() as UserData) : null);
            setAuthLoading(false);
          };

          if (!snapshot.metadata.hasPendingWrites) {
            // Acknowledged server state: authoritative, publish immediately.
            clearConfirmTimer();
            publish();
            return;
          }

          // The write is not acknowledged yet, so the profile may not exist
          // server-side and every rule that reads it would deny. Hold this value
          // back, but do not wait forever if the server is unreachable.
          if (confirmTimer === null) {
            confirmTimer = setTimeout(() => {
              confirmTimer = null;
              publish();
            }, SERVER_CONFIRM_TIMEOUT_MS);
          }
        },
        (error) => {
          console.error("Could not load the user profile:", error);
          clearConfirmTimer();
          setUserData(null);
          setAuthLoading(false);
        },
      );
    });

    return () => {
      clearConfirmTimer();
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, []);

  return { user, userData, authLoading };
}
