import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import LiveBoard from "./pages/LiveBoard";
import Admin from "./pages/Admin";
import Manifests from "./pages/Manifests";
import Inbound from "./pages/Inbound";
import ScanPage from "./pages/ScanPage";
import Login from "./pages/Login";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ServerStatus from "./components/ServerStatus";
import DesktopGate from "./components/DesktopGate";
import { LanguageProvider, useLanguage } from "./i18n";
import { APP_VERSION, CHANGELOGS } from "./lib/changelogs";

function Nav(){
  const loc = useLocation();
  const { user, profile, signOut } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const link = (to:string, label:string)=> {
    const active = loc.pathname===to;
    return (
      <Link to={to} className={`relative px-3.5 py-2 rounded-full text-[13px] font-bold tracking-wide transition-all ${active ? "bg-white text-[#1a252f] shadow-[0_2px_8px_rgba(0,0,0,0.12)]" : "text-white/75 hover:text-white hover:bg-white/[0.08] border border-transparent hover:border-white/10"}`}>{label}</Link>
    );
  };
  const initials = profile?.email ? profile.email[0].toUpperCase() : user?.email ? user.email[0].toUpperCase() : "?";
  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.07] bg-gradient-to-r from-[#0f1e2e] via-[#1e3448] to-[#24384f] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.18),0_1px_0_rgba(255,255,255,0.06)_inset]">
      {/* top hairline highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="max-w-[1400px] mx-auto px-4 h-[56px] flex items-center gap-4">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-3 shrink-0 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white to-[#eef2f7] shadow-[0_4px_12px_rgba(0,0,0,0.2)] flex items-center justify-center text-[16px] border border-white/30 group-hover:scale-[1.02] transition-transform">🛡️</div>
          <div className="leading-none">
            <div className="flex items-baseline gap-1.5">
              <span className="font-black tracking-tight text-[17px] text-white">PLGen</span>
              <span className="text-[11px] font-bold tracking-widest text-white/60 bg-white/10 border border-white/10 px-1.5 py-0.5 rounded-full">v2.0</span>
            </div>
            <div className="text-[10px] font-semibold tracking-widest text-white/45 -mt-0.5">LOGISTICS • VITTORIA</div>
          </div>
        </Link>

        {/* Nav pills — centered */}
        <div className="hidden md:flex items-center gap-1.5 ml-4 bg-black/15 border border-white/10 rounded-full p-1 backdrop-blur-sm">
          {link("/", t("nav.dashboard"))}
          {link("/live", t("nav.live"))}
          {link("/admin", t("nav.admin"))}
        </div>
        {/* mobile nav */}
        <div className="flex md:hidden items-center gap-1 ml-2">
          {link("/", "Dash")}
          {link("/live", "Report")}
          {link("/admin", "Admin")}
        </div>

        {/* Right */}
        <div className="ml-auto flex items-center gap-2">
          <ServerStatus />
          <button
            onClick={()=> setLang(lang === "en" ? "id" : "en")}
            title="Language / Bahasa"
            className="hidden sm:flex items-center gap-1.5 text-xs bg-white/[0.08] hover:bg-white/15 border border-white/10 px-2.5 py-1.5 rounded-full font-bold text-white/90 backdrop-blur-sm transition-colors"
          >
            <span className="text-[11px]">🌐</span><span className="uppercase tracking-widest text-[11px]">{lang}</span>
          </button>
          {user ? (
            <>
              <div className="hidden lg:flex items-center gap-2 pl-2 ml-1 border-l border-white/10">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#3498db] to-[#2c3e50] border border-white/20 flex items-center justify-center text-xs font-black text-white shadow-sm">{initials}</div>
                <div className="leading-tight hidden xl:block">
                  <div className="text-xs font-bold text-white truncate max-w-[160px]">{profile?.email}</div>
                  <div className="text-[10px] font-bold tracking-widest text-white/55">{profile?.role}</div>
                </div>
              </div>
              <button onClick={signOut} className="text-xs bg-white text-[#0f1e2e] hover:bg-gray-100 px-3 py-1.5 rounded-full font-extrabold shadow-sm transition-colors">{t("nav.logout")}</button>
            </>
          ) : (
            <Link to="/login" className="text-xs bg-white text-[#0f1e2e] px-3.5 py-1.5 rounded-full font-extrabold shadow hover:bg-gray-100 transition-colors">{t("nav.login")}</Link>
          )}
        </div>
      </div>
    </nav>
  );
}

function Protected({ children, roles }: { children: React.ReactNode, roles?: string[] }){
  const { user, profile, loading } = useAuth();
  const { t } = useLanguage();
  if (loading) return <div className="p-8 text-center text-sm">{t("auth.loading")}</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && profile && !roles.includes(profile.role)) {
    return <div className="p-8 text-center"><div className="text-lg font-bold">{t("auth.accessDenied")}</div><div className="text-sm text-gray-500">{t("auth.accessDeniedMsg", { role: profile.role, required: roles.join(", ") })}</div></div>;
  }
  return <>{children}</>;
}

function AppRoutes(){
  const { t } = useLanguage();
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/live" element={<Protected><LiveBoard /></Protected>} />
        <Route path="/manifests" element={<Protected><Manifests /></Protected>} />
        <Route path="/inbound" element={<Protected><Inbound /></Protected>} />
        <Route path="/admin" element={<Protected roles={["SuperAdmin","Admin"]}><Admin /></Protected>} />
        <Route path="/scan/:deliveryNo" element={<ScanPage />} />
      </Routes>
      <footer className="border-t bg-white mt-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row gap-8">
            {/* Left: Info */}
            <div className="flex-1">
              <div className="text-sm font-bold text-[#2c3e50] mb-2">🛡️ PLGen v{APP_VERSION}</div>
              <div className="text-xs text-gray-500 space-y-1">
                <div>{t("footer.madeBy")}</div>
                <div>React/TypeScript WebApp • Vercel + Supabase + PythonAnywhere</div>
                <div className="font-mono text-gray-400">{t("footer.latest")} {CHANGELOGS[0]?.hash} — {CHANGELOGS[0]?.date}</div>
              </div>
            </div>
            {/* Right: Changelogs */}
            <div className="flex-1">
              <div className="text-sm font-bold text-[#2c3e50] mb-2">{t("footer.changelogs")}</div>
              <div className="space-y-1.5 max-h-[160px] overflow-auto">
                {CHANGELOGS.slice(0, 8).map((c) => (
                  <div key={c.hash} className="flex items-start gap-2 text-xs">
                    <span className="font-mono text-[10px] bg-[#ecf0f1] text-[#2c3e50] px-1.5 py-0.5 rounded shrink-0 font-bold">{c.hash}</span>
                    <span className="text-gray-500 shrink-0">{c.date}</span>
                    <span className="text-gray-700">{c.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

export default function App(){
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <DesktopGate>
            <AppRoutes />
          </DesktopGate>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
