import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Leaf,
  X,
  User,
  LogOut,
  LayoutDashboard,
  BrainCircuit,
  Users,
  Settings,
  HelpCircle,
  HeartPulse,
  PlusCircle,
} from "lucide-react";
import { signOut } from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import { auth } from "../../config/firebase";
import type { UserData } from "../../types";

// --- COLLAPSIBLE SIDEBAR COMPONENT ---
export default function Sidebar({
  user,
  userData,
  isOpen,
  setIsOpen,
}: {
  user: FirebaseUser | null;
  userData: UserData | null;
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
}) {
  const location = useLocation();
  const userRole = userData?.role;

  const navItems =
    userRole === "doctor"
      ? [
          {
            name: "Clinic Dashboard",
            path: "/",
            icon: <LayoutDashboard size={22} />,
          },
          {
            name: "AI Diagnostic",
            path: "/diagnose",
            icon: <BrainCircuit size={22} />,
          },
          {
            name: "Patient Records",
            path: "/patients",
            icon: <Users size={22} />,
          },
          {
            name: "Clinic Profile",
            path: "/profile",
            icon: <Settings size={22} />,
          },
          {
            name: "Help Center",
            path: "/help",
            icon: <HelpCircle size={22} />,
          },
        ]
      : [
          { name: "My Health", path: "/", icon: <HeartPulse size={22} /> },
          {
            name: "Symptom Logger",
            path: "/checkup",
            icon: <PlusCircle size={22} />,
          },
          {
            name: "Profile Settings",
            path: "/profile",
            icon: <Settings size={22} />,
          },
        ];

  return (
    <aside
      className={`w-72 bg-slate-950 text-slate-300 min-h-screen p-6 flex flex-col no-print fixed z-[100] transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div className="flex items-center justify-between mb-12 mt-4 px-2">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-700 p-2.5 rounded-xl shadow-lg shadow-emerald-900/50">
            <Leaf className="text-white w-6 h-6" />
          </div>
          <span className="text-2xl font-black tracking-tight text-white">
            Arogya<span className="text-emerald-400">AI</span>
          </span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          aria-label="Close navigation menu"
          className="md:hidden text-slate-400 hover:text-white transition-colors"
        >
          <X size={24} aria-hidden="true" />
        </button>
      </div>

      <div className="mb-6 px-4 text-xs font-black uppercase tracking-widest text-slate-500">
        {userRole === "doctor" ? "Practitioner Portal" : "Patient Portal"}
      </div>

      <nav className="space-y-2 flex-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              onClick={() => window.innerWidth < 768 && setIsOpen(false)}
              className={`flex items-center gap-4 px-4 py-4 rounded-2xl font-bold transition-all ${isActive ? "bg-emerald-500/10 text-emerald-400" : "hover:bg-slate-900 hover:text-white"}`}
            >
              {item.icon} {item.name}
              {isActive && (
                <motion.div
                  layoutId="active-pill"
                  className="w-1.5 h-8 bg-emerald-500 absolute left-0 rounded-r-full"
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div
        className="mt-auto bg-slate-900 p-4 rounded-2xl flex items-center gap-4 border border-slate-800 relative group cursor-pointer"
        onClick={() => signOut(auth)}
      >
        <div className="w-10 h-10 bg-emerald-900 rounded-full flex items-center justify-center text-emerald-400 font-black">
          <User size={20} />
        </div>
        <div className="overflow-hidden">
          <p className="text-white font-bold text-sm truncate">
            {user?.email?.split("@")[0] || "User"}
          </p>
          <p className="text-slate-500 text-xs font-medium group-hover:hidden capitalize">
            {userRole}
          </p>
          <p className="text-red-400 text-xs font-bold hidden group-hover:flex items-center gap-1">
            <LogOut size={12} /> Sign Out
          </p>
        </div>
      </div>
    </aside>
  );
}
