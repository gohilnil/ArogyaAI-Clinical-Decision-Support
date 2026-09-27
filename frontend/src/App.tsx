import { useState } from "react";
import { useAuth } from "./hooks/useAuth";
import LoginPage from "./pages/LoginPage";
import AppShell from "./components/layout/AppShell";
import UnprovisionedPage from "./pages/UnprovisionedPage";

export default function App() {
  const { user, userData, authLoading } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (authLoading)
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-emerald-500 font-black text-2xl">
        Initializing Secure Portal...
      </div>
    );

  if (!user) {
    return <LoginPage />;
  }

  // Signed in but with no usable profile (missing document, or a legacy one
  // with no clinic). There is nothing to authorise against, so render an
  // explicit state instead of a portal that would show empty data. An empty
  // string clinicId is treated as missing: a live legacy account has one, and
  // every clinic-scoped query for it is denied by the rules.
  const hasUsableProfile =
    Boolean(userData) &&
    Boolean(userData?.clinicId) &&
    Boolean(userData?.role);

  if (!hasUsableProfile) {
    return <UnprovisionedPage user={user} />;
  }

  return (
    <AppShell
      user={user}
      userData={userData}
      isSidebarOpen={isSidebarOpen}
      setIsSidebarOpen={setIsSidebarOpen}
    />
  );
}
