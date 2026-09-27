// Delivering a patient code to the person it belongs to.
//
// A patient code is the `patients/{patientId}` document id: a long, unguessable
// string. That unguessability IS the security model — the code is a capability,
// so anyone holding it can read that record, and it must not be shortened or
// derived from a name. The old flow left the delivery entirely manual: a
// practitioner read the code off a screen and the patient retyped it, which is
// where transcription errors came from.
//
// What this module removes is the retyping, not the capability. It builds a
// link the patient can simply open, and a message that is ready to send, so the
// code travels by copy rather than by hand.

/** The app's own origin, used to build an absolute share link. */
function origin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

/**
 * A link that opens the portal with this patient code ready to accept.
 *
 * The code rides in the query string, which the login screen and the profile
 * page both read. It deliberately does NOT auto-link on load: opening a link
 * must not silently attach a health record to whatever account is signed in on
 * that device. The patient sees the code already filled in and presses save,
 * so the action that links the record is still an explicit one.
 */
export function patientLink(code: string): string {
  const trimmed = code.trim();
  return `${origin()}/?patient=${encodeURIComponent(trimmed)}`;
}

/**
 * A message a practitioner can send as-is.
 *
 * Plain text rather than a mailto: or SMS: URL because those hand the content
 * to an external app whose behaviour differs per platform, and a practitioner
 * usually has their own channel (WhatsApp, a printout, the front desk). The
 * text is what they need; where it goes is their call.
 */
export function patientMessage(
  code: string,
  patientName: string,
  clinicName: string,
): string {
  const who = patientName?.trim() || "there";
  const clinic = clinicName?.trim();
  return [
    `Hello ${who},`,
    "",
    `Your ArogyaAI health record is ready to view.`,
    clinic ? `Clinic: ${clinic}` : "",
    `Your patient code: ${code.trim()}`,
    "",
    `Open this link and the code will be filled in for you:`,
    patientLink(code),
    "",
    `Sign in (or create a patient account), then press "Save Patient Code" to see your own history and diary.`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** Read a patient code handed over in the URL, or null when there is none. */
export function patientCodeFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("patient");
  const code = (raw || "").trim();
  return code || null;
}
