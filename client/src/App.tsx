import { ReactNode, lazy, Suspense } from "react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { Activity, Radio, LayoutDashboard, Map as MapIcon, Home, LogOut } from "lucide-react";

import LandingPage from "./components/LandingPage";
import LoginPage from "./components/LoginPage";
import { homePathFor, useAuth } from "./services/auth";
import type { Role } from "./types";

const SurveillanceDashboard = lazy(() => import("./components/SurveillanceDashboard"));
const SocialSimulator = lazy(() => import("./components/SocialSimulator"));
const HelplineSimulator = lazy(() => import("./components/HelplineSimulator"));
const UnitManager = lazy(() => import("./components/UnitManager"));

// UI only. The server enforces the roles.
const NAV: Record<Role, { to: string; icon: typeof Home; label: string }[]> = {
  admin: [
    { to: "/dashboard", icon: LayoutDashboard, label: "Command dashboard" },
    { to: "/units", icon: MapIcon, label: "Unit manager" },
  ],
  citizen: [
    { to: "/social", icon: Activity, label: "Social feed" },
    { to: "/helpline", icon: Radio, label: "Emergency helpline" },
  ],
};

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={homePathFor(user)} replace />;
  return <>{children}</>;
}

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="h-full min-h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-slate-500 gap-4">
      <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
      <div className="text-xs font-mono tracking-widest animate-pulse">{label}</div>
    </div>
  );
}

function App() {
  const location = useLocation();
  const { user, loading, logout } = useAuth();

  const getNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    `p-3 rounded-xl transition-all duration-200 ${
      isActive
        ? "bg-cyan-950/50 text-cyan-400 border border-cyan-900 shadow-[0_0_15px_-3px_rgba(34,211,238,0.2)]"
        : "text-slate-500 hover:bg-slate-800 hover:text-slate-200 border border-transparent"
    }`;

  if (location.pathname === "/") {
    return (
      <div className="bg-slate-950 min-h-screen w-full">
        <LandingPage />
      </div>
    );
  }

  if (loading) return <FullScreenLoader label="RESTORING SESSION..." />;

  if (location.pathname === "/login") return <LoginPage />;

  return (
    <div className="flex h-screen w-screen overflow-hidden flex-col-reverse md:flex-row bg-slate-950">

      {/* Side bar on desktop, bottom bar on mobile */}
      <nav className="w-full h-16 md:w-20 md:h-full bg-slate-900 border-t md:border-t-0 md:border-r border-slate-800 flex flex-row md:flex-col items-center justify-around md:justify-start py-0 md:py-6 gap-0 md:gap-4 z-50 shrink-0 shadow-2xl">

        <NavLink to="/" className={getNavLinkClass} aria-label="Home">
          <Home className="w-6 h-6" />
        </NavLink>

        <div className="w-8 h-[1px] bg-slate-800 hidden md:block my-2" />

        {user && NAV[user.role].map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className={getNavLinkClass} aria-label={label} title={label}>
            <Icon className="w-6 h-6" />
          </NavLink>
        ))}

        {user && (
          <button onClick={logout} className="p-3 rounded-xl text-slate-500 hover:bg-slate-800 hover:text-red-400 border border-transparent md:mt-auto transition" aria-label="Sign out" title={`Sign out ${user.name}`}>
            <LogOut className="w-6 h-6" />
          </button>
        )}
      </nav>

      <main className="flex-1 relative overflow-hidden h-[calc(100vh-4rem)] md:h-screen w-full bg-slate-950">
        <Suspense fallback={<FullScreenLoader label="LOADING MODULE..." />}>
          <Routes>
            <Route path="/dashboard" element={<RequireRole role="admin"><SurveillanceDashboard /></RequireRole>} />
            <Route path="/units" element={<RequireRole role="admin"><UnitManager /></RequireRole>} />
            <Route path="/social" element={<RequireRole role="citizen"><SocialSimulator /></RequireRole>} />
            <Route path="/helpline" element={<RequireRole role="citizen"><HelplineSimulator /></RequireRole>} />
            <Route path="*" element={<Navigate to={user ? homePathFor(user) : "/login"} replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default App;
