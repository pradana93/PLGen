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
  const link = (to:string, label:string)=> (
    <Link to={to} className={`px-3 py-2 rounded-lg text-sm font-semibold ${loc.pathname===to?"bg-white text-[#2c3e50] shadow":"text-white/90 hover:bg-white/20"}`}>{label}</Link>
  );
  return (
    <nav className="bg-[#2c3e50] text-white px-4 py-3 flex items-center gap-2 sticky top-0 z-50">
      <div className="font-extrabold tracking-tight text-lg">🛡️ PLGen <span className="font-normal opacity-70">v2.0</span></div>
      <div className="ml-6 flex gap-1">
        {link("/", t("nav.dashboard"))}
        {link("/live", t("nav.live"))}
        {link("/manifests", t("nav.manifests"))}
        {link("/inbound", t("nav.inbound"))}
        {link("/admin", t("nav.admin"))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <ServerStatus />
        <button
          onClick={()=> setLang(lang === "en" ? "id" : "en")}
          title="Language / Bahasa"
          className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded font-bold"
        >
          🌐 <span className="uppercase">{lang}</span>
        </button>
        {user ? (
          <>
            <span className="text-xs hidden md:block">{profile?.email} <span className="opacity-70">({profile?.role})</span></span>
            <button onClick={signOut} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded">{t("nav.logout")}</button>
          </>
        ) : (
          <Link to="/login" className="text-xs bg-white text-[#2c3e50] px-3 py-1 rounded font-bold">{t("nav.login")}</Link>
        )}
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
