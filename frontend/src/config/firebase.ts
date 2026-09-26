import { initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD9py-UHwil1VIalAnDLv-kJft_KyZxFQU",
  authDomain: "arogyaai-cloud-ad667.firebaseapp.com",
  projectId: "arogyaai-cloud-ad667",
  storageBucket: "arogyaai-cloud-ad667.firebasestorage.app",
  messagingSenderId: "819345312280",
  appId: "1:819345312280:web:ab1116f04029694153d16d",
  measurementId: "G-HLP6DE4FYS",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the Authentication and Database modules so our React app can use them
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * Point the app at the local Firebase emulators.
 *
 * Opt-in only: it requires VITE_USE_FIREBASE_EMULATORS=true at build time, so
 * production and preview builds are unaffected and the default is the real
 * project. This exists because the alternative for testing the authenticated
 * flows is to create accounts in the live project — which would test whatever
 * rules happen to be deployed there rather than the rules in this repository,
 * and would leave real accounts and documents behind.
 */
if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  console.info(
    "[ArogyaAI] Using local Firebase emulators (auth 9099, firestore 8080).",
  );
}
