// Single place where the frontend talks to the ArogyaAI backend.
// The API base URL resolves in the same order as before the refactor:
//   1. a user-configured Render URL (localStorage, set on the Profile page)
//   2. VITE_API_URL from the build environment
//   3. local development default
import { auth } from "../config/firebase";
import type { AnalysisResult } from "../types";

export interface PredictPayload {
  Symptoms: string;
  Age: number;
  Height_cm: number;
  Weight_kg: number;
  Gender: string;
  Body_Type_Dosha_Sanskrit: string;
  Season: string;
  Food_Habits: string;
  Current_Medication: string;
  Allergies: string;
  Weather: string;
}

export function getApiBaseUrl(): string {
  const renderUrl = localStorage.getItem("renderUrl") || "";
  return renderUrl || import.meta.env.VITE_API_URL || "http://localhost:8000";
}

/** Thrown for a non-2xx API response, carrying the HTTP status. */
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Pull a human-readable message out of the backend's error body. The API
 * returns either a FastAPI validation list (`detail: [...]`) or the structured
 * envelope `detail: { error: { code, message } }`. Neither is shown raw.
 */
async function readError(response: Response): Promise<ApiError> {
  let message = `Request failed (${response.status}).`;
  let code: string | undefined;
  try {
    const body = await response.json();
    const detail = body?.detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      if (detail.error) {
        message = detail.error.message ?? message;
        code = detail.error.code;
      } else if (typeof detail === "string") {
        message = detail;
      }
    } else if (Array.isArray(detail) && detail.length > 0) {
      message = detail[0]?.msg ?? message;
    } else if (typeof detail === "string") {
      message = detail;
    }
  } catch {
    // Non-JSON body: keep the generic message with the status code.
  }
  if (response.status === 401) {
    message = "Your session has expired. Please sign in again.";
  }
  return new ApiError(message, response.status, code);
}

/**
 * Call POST /api/predict with the caller's Firebase ID token.
 *
 * The token is fetched fresh on every call (the SDK caches it internally and
 * refreshes when near expiry), so a long-lived session does not start failing
 * once the first token ages out.
 */
export async function predictDisease(
  payload: PredictPayload,
): Promise<AnalysisResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new ApiError("You must be signed in to run an analysis.", 401, "MISSING_TOKEN");
  }

  const idToken = await currentUser.getIdToken();

  const response = await fetch(`${getApiBaseUrl()}/api/predict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await readError(response);
  }

  return (await response.json()) as AnalysisResult;
}
