import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu } from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import Sidebar from "./Sidebar";
import { ScrollToTop } from "./ScrollToTop";
import { RouteFallback } from "./RouteFallback";
import type { UserData } from "../../types";

// Route pages are code-split.
//
// Before this, every page — the doctor's diagnostic tool, all five admin
// screens, the pdf-printing assessment view — was in one eagerly-imported
// bundle, so the login screen paid for all of it. Each page now loads on
// arrival, and the shell plus login are what a first visit actually downloads.
// The names are kept as the originals so the routing JSX below reads the same.
const GlobalDashboard = lazy(() => import("../../pages/DashboardPage"));
const DiagnosticTool = lazy(() => import("../../pages/DiagnosePage"));
const PatientRecords = lazy(() => import("../../pages/PatientsPage"));
const PatientDetailPage = lazy(() => import("../../pages/PatientDetailPage"));
const PatientDashboard = lazy(() => import("../../pages/PatientHomePage"));
const PatientCheckup = lazy(() => import("../../pages/PatientCheckupPage"));
const AssessmentHistoryPage = lazy(
  () => import("../../pages/patient/AssessmentHistoryPage"),
);
const AssessmentDetailPage = lazy(
  () => import("../../pages/patient/AssessmentDetailPage"),
);
const ProfileSettings = lazy(() => import("../../pages/ProfilePage"));
const HelpCenter = lazy(() => import("../../pages/HelpPage"));
const AdminLayout = lazy(() => import("../../pages/admin/AdminLayout"));
const AdminOverviewPage = lazy(() => import("../../pages/admin/OverviewPage"));
const AdminAccountsPage = lazy(() => import("../../pages/admin/AccountsPage"));
const AdminApprovalsPage = lazy(() => import("../../pages/admin/ApprovalsPage"));
const AdminClinicsPage = lazy(() => import("../../pages/admin/ClinicsPage"));
const AdminAuditLogPage = lazy(() => import("../../pages/admin/AuditLogPage"));

export default function AppShell({
  user,
  userData,
  isSidebarOpen,
  setIsSidebarOpen,
}: {
  user: FirebaseUser | null;
  userData: UserData | null;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (val: boolean) => void;
}) {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <div className="flex min-h-screen bg-slate-50/50 font-sans text-slate-900 selection:bg-emerald-100 overflow-x-hidden">
        {/* Lets a keyboard user jump past the navigation to the page content.
            Hidden until focused, so it costs a mouse user nothing. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[400] focus:bg-emerald-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-xl focus:font-black focus:text-sm"
        >
          Skip to content
        </a>

        <AnimatePresence>
          {isSidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90] md:hidden"
            />
          )}
        </AnimatePresence>

        <Sidebar
          user={user}
          userData={userData}
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
        />

        <main
          id="main-content"
          className={`flex-1 transition-all duration-300 ease-in-out ${isSidebarOpen ? "md:ml-72" : "ml-0"}`}
        >
          <div className="p-4 md:p-6 lg:px-10 lg:pt-10 flex items-center no-print">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label={isSidebarOpen ? "Hide navigation menu" : "Show navigation menu"}
              aria-expanded={isSidebarOpen}
              aria-controls="main-navigation"
              className="bg-white border-2 border-slate-200 p-2 md:p-2.5 rounded-xl text-slate-600 hover:border-emerald-500 hover:text-emerald-600 transition-all shadow-sm"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="-mt-4">
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {userData?.role === "doctor" ? (
                  <>
                    <Route
                      path="/"
                      element={<GlobalDashboard userData={userData} />}
                    />
                    <Route
                      path="/diagnose"
                      element={<DiagnosticTool userData={userData} />}
                    />
                    <Route
                      path="/patients"
                      element={<PatientRecords userData={userData} />}
                    />
                    <Route
                      path="/patients/:patientId"
                      element={<PatientDetailPage />}
                    />
                  </>
                ) : (
                  <>
                    <Route
                      path="/"
                      element={
                        <PatientDashboard user={user} userData={userData} />
                      }
                    />
                    <Route
                      path="/checkup"
                      element={<PatientCheckup user={user} userData={userData} />}
                    />
                    <Route
                      path="/history"
                      element={
                        <AssessmentHistoryPage user={user} userData={userData} />
                      }
                    />
                    <Route
                      path="/assessment/:id"
                      element={
                        <AssessmentDetailPage user={user} userData={userData} />
                      }
                    />
                  </>
                )}

                <Route
                  path="/profile"
                  element={<ProfileSettings user={user} userData={userData} />}
                />
                <Route path="/help" element={<HelpCenter />} />
                {/* The admin section is nested: the layout checks the role, loads
                    the shared data once, and renders the sub-navigation; each
                    child page renders inside it. A non-admin reaching any of
                    these URLs gets the layout's explicit access-denied state. */}
                <Route
                  path="/admin"
                  element={<AdminLayout user={user} userData={userData} />}
                >
                  <Route index element={<AdminOverviewPage />} />
                  <Route path="accounts" element={<AdminAccountsPage />} />
                  <Route path="approvals" element={<AdminApprovalsPage />} />
                  <Route path="clinics" element={<AdminClinicsPage />} />
                  <Route path="audit" element={<AdminAuditLogPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}
