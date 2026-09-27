import { useState } from "react";
import type * as React from "react";
import { motion } from "framer-motion";
import { Leaf, Mail, Lock, LogIn, Building, Shield } from "lucide-react";
import { auth, db } from "../config/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  deleteUser,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

/**
 * Registration failure messages have to outlive this component.
 *
 * Registration creates the Auth account BEFORE it can validate the invite or
 * write the profile document, because the rules only allow a signed-in caller
 * to read an invite. So `onAuthStateChanged` fires mid-registration, App stops
 * rendering LoginPage, and the failure is then thrown by a component that is no
 * longer mounted. Setting state there does nothing, and after the rollback
 * signs the account out, a *fresh* LoginPage mounts showing nothing at all —
 * the user saw registration "succeed" and then bounce back with no message.
 *
 * The error is therefore written to sessionStorage, which survives the unmount
 * and is cleared on read so it cannot reappear on a later visit.
 */
const AUTH_ERROR_KEY = "arogyaai.authError";

function stashAuthError(message: string) {
  try {
    sessionStorage.setItem(AUTH_ERROR_KEY, message);
  } catch {
    // Private mode or a storage-disabled browser: fall back to component state,
    // which still covers every failure that happens while this page is mounted.
  }
}

function takeStashedAuthError(): string {
  try {
    const message = sessionStorage.getItem(AUTH_ERROR_KEY);
    if (message === null) return "";
    sessionStorage.removeItem(AUTH_ERROR_KEY);
    return message;
  } catch {
    return "";
  }
}

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState(takeStashedAuthError);
  /** Positive confirmation shown after a reset email is requested. */
  const [resetNotice, setResetNotice] = useState("");
  const [selectedRole, setSelectedRole] = useState<"patient" | "doctor">(
    "patient",
  );
  const [clinicIdInput, setClinicIdInput] = useState("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  /** True while a sign-in/registration request is in flight, so the form
   *  cannot be submitted twice and the user sees that work is happening. */
  const [isSubmitting, setIsSubmitting] = useState(false);

  type RegistrationPlan =
    | { role: "patient"; clinicId: string }
    | { role: "doctor"; clinicId: string; inviteCode: string };

  /**
   * Validate the registration inputs and resolve the profile to be written.
   *
   * Runs BEFORE the auth account is created, so an invalid invite or clinic
   * cannot leave an orphaned account behind.
   *
   * The role is still not taken on trust: Firestore rules independently verify
   * that a `doctor` claim is backed by an unused invite issued for the same
   * clinic, so a tampered client cannot grant itself practitioner access. The
   * checks here only produce a clearer message than a permission error would.
   */
  const planRegistration = async (): Promise<RegistrationPlan> => {
    if (selectedRole === "doctor") {
      const code = inviteCodeInput.trim().toUpperCase();
      if (!code) {
        throw new Error(
          "A practitioner invite code is required to register a clinic account.",
        );
      }

      const inviteSnap = await getDoc(doc(db, "invites", code));
      if (!inviteSnap.exists()) {
        throw new Error(
          "That practitioner invite code is not valid. Ask the clinic administrator for a current code.",
        );
      }
      const invite = inviteSnap.data() as { used?: boolean; clinicId?: string };
      if (invite.used) {
        throw new Error("That invite code has already been used.");
      }
      if (!invite.clinicId) {
        throw new Error("That invite code is not linked to a clinic.");
      }
      // The clinic comes from the invite, never from the registrant.
      return { role: "doctor", clinicId: invite.clinicId, inviteCode: code };
    }

    const clinicId = clinicIdInput.trim().toUpperCase();
    if (clinicId.length !== 6) {
      throw new Error(
        "Patients must enter a valid 6-character Clinic ID provided by their doctor.",
      );
    }
    return { role: "patient", clinicId };
  };

  /** Write users/{uid}, consuming the invite for a clinic account. */
  const writeProfile = async (
    uid: string,
    userEmail: string | null,
    plan: RegistrationPlan,
  ): Promise<void> => {
    if (plan.role === "doctor") {
      await setDoc(doc(db, "users", uid), {
        email: userEmail,
        role: "doctor",
        clinicId: plan.clinicId,
        inviteCode: plan.inviteCode,
      });
      await updateDoc(doc(db, "invites", plan.inviteCode), { used: true });
      return;
    }

    await setDoc(doc(db, "users", uid), {
      email: userEmail,
      role: "patient",
      clinicId: plan.clinicId,
    });
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setAuthError("");
    setIsSubmitting(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        return;
      }

      // The account is created BEFORE the invite is looked up, because the
      // rules only allow a signed-in caller to fetch an invite by code. The
      // previous order read the invite while signed out, which the rules
      // denied — so practitioner registration could not complete at all.
      //
      // The no-orphan invariant is preserved by removing the account if the
      // profile cannot be written, rather than by validating first.
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );

      try {
        const plan = await planRegistration();
        await writeProfile(
          userCredential.user.uid,
          userCredential.user.email,
          plan,
        );
      } catch (profileError) {
        // The profile is the account's source of truth. If it could not be
        // written the account is unusable, so remove it rather than leave a
        // user who can sign in but has no role.
        await deleteUser(userCredential.user).catch(() => signOut(auth));
        throw profileError;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.replace("Firebase: ", "") : "Authentication failed.";
      // Registration failures happen after this component has unmounted, so the
      // message is stashed as well as set. See AUTH_ERROR_KEY above.
      stashAuthError(msg);
      setAuthError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (isSubmitting) return;
    setAuthError("");
    setIsSubmitting(true);
    const provider = new GoogleAuthProvider();
    try {
      // Sign in first, as in handleAuth: the invite lookup below is only
      // permitted for a signed-in caller.
      const userCredential = await signInWithPopup(auth, provider);
      const userDocRef = doc(db, "users", userCredential.user.uid);
      const userDocSnap = await getDoc(userDocRef);

      // An existing profile needs no provisioning, and a sign-in attempt by an
      // account that has none is left to the app's null-profile handling.
      if (userDocSnap.exists() || isLogin) return;

      try {
        const plan = await planRegistration();
        await writeProfile(
          userCredential.user.uid,
          userCredential.user.email,
          plan,
        );
      } catch (profileError) {
        // Registration did not complete, so the account has no role and is
        // unusable; remove it rather than leave it half-provisioned.
        await deleteUser(userCredential.user).catch(() => signOut(auth));
        throw profileError;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.replace("Firebase: ", "") : "Google authentication failed.";
      stashAuthError(msg);
      setAuthError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Send a password-reset email for the address in the form.
   *
   * Firebase deliberately does not reveal whether an address is registered, so
   * this reports the same success message either way. Saying "no such account"
   * would turn the form into an oracle for which emails exist.
   */
  const handlePasswordReset = async () => {
    const address = email.trim();
    if (!address) {
      setAuthError("Enter your email address first, then choose Reset password.");
      return;
    }
    if (isSubmitting) return;
    setAuthError("");
    setIsSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, address);
      setResetNotice(
        `If an account exists for ${address}, a password reset link is on its way. Check your inbox and spam folder.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.replace("Firebase: ", "") : "Could not send the reset email.";
      setAuthError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
      <div className="min-h-screen bg-slate-900 grid grid-cols-1 lg:grid-cols-2">
        <div className="bg-emerald-950 p-10 lg:p-20 flex flex-col justify-between relative overflow-hidden hidden lg:flex">
          <div className="absolute inset-0 opacity-10 bg-[url('https://grainy-gradients.vercel.app/gradients/6.png')] bg-cover"></div>
          <div className="relative z-10 flex items-center gap-3">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-700 p-3 rounded-2xl">
              <Leaf className="text-white w-8 h-8" />
            </div>
            <span className="text-3xl font-black tracking-tight text-white">
              Arogya<span className="text-emerald-400">AI</span>
            </span>
          </div>
          <div className="relative z-10 space-y-6">
            <h1 className="text-5xl lg:text-6xl font-black tracking-tighter text-white leading-tight">
              Hybrid Intelligence for Ayurveda
            </h1>
            <p className="text-emerald-200/80 font-medium text-lg lg:text-xl max-w-xl">
              A professional assistant combining traditional Machine Learning
              accuracy with Generative AI reasoning.
            </p>
          </div>
          <div className="relative z-10 text-emerald-600 text-sm font-medium">
            {new Date().getFullYear()} Secure Cloud Dashboard.
          </div>
        </div>

        <div className="bg-slate-50 p-6 sm:p-10 lg:p-20 flex flex-col items-center justify-center">
          <div className="max-w-md w-full space-y-8">
            <div className="space-y-3 text-center lg:text-left">
              <h2 className="text-4xl lg:text-5xl font-black text-slate-950 tracking-tighter">
                {isLogin ? "Welcome Back" : "Create Account"}
              </h2>
              <p className="text-slate-500 text-base lg:text-lg font-medium">
                {isLogin
                  ? "Sign in to access your portal."
                  : "Join the ArogyaAI network."}
              </p>
            </div>

            {!isLogin && (
              <div className="bg-slate-200/50 p-1.5 rounded-2xl flex relative shadow-inner">
                <div
                  className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-white rounded-xl shadow-sm transition-transform duration-300 ease-in-out ${selectedRole === "doctor" ? "translate-x-full left-0" : "translate-x-0 left-1.5"}`}
                ></div>
                <button
                  onClick={() => setSelectedRole("patient")}
                  className={`flex-1 py-3 font-bold text-sm z-10 transition-colors ${selectedRole === "patient" ? "text-emerald-600" : "text-slate-500"}`}
                >
                  I am a Patient
                </button>
                <button
                  onClick={() => setSelectedRole("doctor")}
                  className={`flex-1 py-3 font-bold text-sm z-10 transition-colors ${selectedRole === "doctor" ? "text-emerald-600" : "text-slate-500"}`}
                >
                  I am a Practitioner
                </button>
              </div>
            )}

            {authError && (
              <div className="p-4 bg-red-100 text-red-700 font-bold rounded-xl text-sm">
                {authError}
              </div>
            )}

            {resetNotice && (
              <div className="p-4 bg-emerald-100 text-emerald-800 font-bold rounded-xl text-sm">
                {resetNotice}
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-5 top-4 text-slate-400 w-6 h-6" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-4 pl-14 rounded-2xl border border-slate-200/60 bg-white focus:ring-4 focus:ring-emerald-200 outline-none font-bold shadow-inner"
                  placeholder="Email Address"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-5 top-4 text-slate-400 w-6 h-6" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-4 pl-14 rounded-2xl border border-slate-200/60 bg-white focus:ring-4 focus:ring-emerald-200 outline-none font-bold shadow-inner"
                  placeholder="Password (min 6 chars)"
                />
              </div>

              {!isLogin && selectedRole === "patient" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="relative"
                >
                  <Building className="absolute left-5 top-4 text-slate-400 w-6 h-6" />
                  <input
                    type="text"
                    required
                    value={clinicIdInput}
                    onChange={(e) => setClinicIdInput(e.target.value)}
                    maxLength={6}
                    className="w-full p-4 pl-14 rounded-2xl border-2 border-emerald-200/60 bg-emerald-50 focus:ring-4 focus:ring-emerald-200 outline-none font-black text-emerald-900 tracking-widest uppercase shadow-inner"
                    placeholder="Enter 6-Character Clinic ID"
                  />
                  <p className="text-xs font-bold text-slate-400 mt-2 ml-2">
                    Ask your doctor for their specific Clinic ID code to link
                    your accounts.
                  </p>
                </motion.div>
              )}

              {!isLogin && selectedRole === "doctor" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="relative"
                >
                  <Shield className="absolute left-5 top-4 text-slate-400 w-6 h-6" />
                  <input
                    type="text"
                    required
                    value={inviteCodeInput}
                    onChange={(e) => setInviteCodeInput(e.target.value)}
                    className="w-full p-4 pl-14 rounded-2xl border-2 border-slate-300 bg-slate-50 focus:ring-4 focus:ring-emerald-200 outline-none font-black text-slate-900 tracking-widest uppercase shadow-inner"
                    placeholder="Practitioner Invite Code"
                  />
                  <p className="text-xs font-bold text-slate-400 mt-2 ml-2">
                    Clinic accounts require an invite code issued by the
                    administrator. This prevents anyone from self-registering as
                    a practitioner.
                  </p>
                </motion.div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-slate-950 text-white py-4 rounded-2xl font-black text-xl flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-xl shadow-slate-950/20 mt-4 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting
                  ? "Please wait..."
                  : isLogin
                    ? "Sign In"
                    : "Register"}{" "}
                <LogIn size={22} />
              </button>

              {isLogin && (
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={isSubmitting}
                  className="w-full text-center text-slate-500 font-bold text-sm hover:text-emerald-600 transition-colors disabled:opacity-60"
                >
                  Forgot your password? Send a reset link.
                </button>
              )}
            </form>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink-0 mx-4 text-slate-400 font-bold text-xs uppercase tracking-widest">
                OR
              </span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleAuth}
              className="w-full bg-white text-slate-700 border-2 border-slate-200 py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-4 hover:bg-slate-50 transition-all shadow-sm"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>

            <button
              onClick={() => setIsLogin(!isLogin)}
              className="w-full text-center text-slate-500 font-bold text-sm hover:text-emerald-600 transition-colors"
            >
              {isLogin
                ? "Don't have an account? Register here."
                : "Already have an account? Sign in."}
            </button>
          </div>
        </div>
      </div>
  );
}
