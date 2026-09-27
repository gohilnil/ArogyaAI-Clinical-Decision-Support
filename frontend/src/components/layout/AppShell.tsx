import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu } from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import Sidebar from "./Sidebar";
// Aliased to the original component names so the routing JSX below stays
// byte-for-byte identical to the pre-refactor App.tsx.
import GlobalDashboard from "../../pages/DashboardPage";
import DiagnosticTool from "../../pages/DiagnosePage";
import PatientRecords from "../../pages/PatientsPage";
import PatientDetailPage from "../../pages/PatientDetailPage";
import PatientDashboard from "../../pages/PatientHomePage";
import PatientCheckup from "../../pages/PatientCheckupPage";
import AssessmentHistoryPage from "../../pages/patient/AssessmentHistoryPage";
import AssessmentDetailPage from "../../pages/patient/AssessmentDetailPage";
import ProfileSettings from "../../pages/ProfilePage";
import HelpCenter from "../../pages/HelpPage";
import AdminLayout from "../../pages/admin/AdminLayout";
import AdminOverviewPage from "../../pages/admin/OverviewPage";
import AdminAccountsPage from "../../pages/admin/AccountsPage";
import AdminApprovalsPage from "../../pages/admin/ApprovalsPage";
import AdminClinicsPage from "../../pages/admin/ClinicsPage";
import AdminAuditLogPage from "../../pages/admin/AuditLogPage";
import type { UserData } from "../../types";

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
      <div className="flex min-h-screen bg-slate-50/50 font-sans text-slate-900 selection:bg-emerald-100 overflow-x-hidden">
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
          className={`flex-1 transition-all duration-300 ease-in-out ${isSidebarOpen ? "md:ml-72" : "ml-0"}`}
        >
          <div className="p-4 md:p-6 lg:px-10 lg:pt-10 flex items-center no-print">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label={isSidebarOpen ? "Hide navigation menu" : "Show navigation menu"}
              aria-expanded={isSidebarOpen}
              className="bg-white border-2 border-slate-200 p-2 md:p-2.5 rounded-xl text-slate-600 hover:border-emerald-500 hover:text-emerald-600 transition-all shadow-sm"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="-mt-4">
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
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}
