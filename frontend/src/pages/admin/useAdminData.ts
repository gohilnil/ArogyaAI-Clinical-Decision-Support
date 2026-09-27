// The contract between the admin layout and its child pages.
//
// This lives apart from AdminLayout.tsx because that file exports a component,
// and a module mixing a component with exported values and hooks breaks React
// Fast Refresh.

import { useOutletContext } from "react-router-dom";
import type { UserDataWithId } from "../../services/firestore";
import type { Clinic } from "../../types";

/** What each admin page receives from the layout. */
export interface AdminContextValue {
  users: UserDataWithId[];
  clinics: Clinic[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** The signed-in administrator, for stamping audit entries. */
  actor: { uid: string; email: string };
  /** Fold a successful write back into the shared state, so a page shows its
   *  own change without re-reading the collection. */
  applyUserChange: (id: string, changes: Partial<UserDataWithId>) => void;
}

export function useAdminData(): AdminContextValue {
  return useOutletContext<AdminContextValue>();
}
