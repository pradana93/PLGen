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
import AntiCheatProvider from "./components/AntiCheatProvider";
import AccessGate from "./components/AccessGate";
import { LanguageProvider, useLanguage } from "./i18n";
import { APP_VERSION, CHANGELOGS } from "./lib/changelogs";

function Nav(){
  const loc = useLocation();
  const { user, profile, signOut } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const link = (to:string, label:string)=> {
    const active = loc.pathname===to;
    return (
      <Link to={to} className={`relative px-3.5 py-2 rounded-full text-[13px] font-bold tracking-wide transition-colors ${active ? "bg-white text-[#1a252f] shadow-[0_2px_8px_rgba(0,0,0,0.12)]" : "text-white/75 hover:text-white hover:bg-white/[0.08] border border-transparent hover:border-white/10"}`}>{label}</Link>
    );
  };
  const initials = profile?.email ? profile.email[0].toUpperCase() : user?.email ? user.email[0].toUpperCase() : "?";
  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0f1e2e] shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
      <div className="max-w-[1400px] mx-auto px-4 h-[56px] flex items-center gap-4">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-3 shrink-0 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white to-[#eef2f7] shadow-[0_2px_8px_rgba(0,0,0,0.15)] flex items-center justify-center text-[16px] border border-white/20 group-hover:scale-[1.02] transition-transform">🛡️</div>
          <div className="leading-none">
            <div className="flex items-baseline gap-1.5">
              <span className="font-black tracking-tight text-[17px] text-white">PLGen</span>
              <span className="text-[11px] font-bold tracking-widest text-white/60 bg-white/10 border border-white/10 px-1.5 py-0.5 rounded-full">v2.0</span>
            </div>
            <div className="text-[10px] font-semibold tracking-widest text-white/45 -mt-0.5">LOGISTICS • VITTORIA</div>
          </div>
        </Link>

        {/* Nav pills — centered */}
        <div className="hidden md:flex items-center gap-1.5 ml-4 bg-black/10 border border-white/10 rounded-full p-1">
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
            className="hidden sm:flex items-center gap-1.5 text-xs bg-white/[0.08] hover:bg-white/15 border border-white/10 px-2.5 py-1.5 rounded-full font-bold text-white/90 transition-colors"
          >
            <span className="text-[11px]">🌐</span><span className="uppercase tracking-widest text-[11px]">{lang}</span>
          </button>
          {user ? (
            <>
              <div className="hidden lg:flex items-center gap-2 pl-2 ml-1 border-l border-white/10">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#3498db] to-[#2c3e50] border border-white/15 flex items-center justify-center text-xs font-black text-white shadow-sm">{initials}</div>
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
  const latestBuild = CHANGELOGS[0]?.hash || "—";
  const groups = {
    features: CHANGELOGS.filter(c=> c.message.startsWith("feat")),
    fixes: CHANGELOGS.filter(c=> c.message.startsWith("fix")),
    perf: CHANGELOGS.filter(c=> c.message.startsWith("perf")),
    others: CHANGELOGS.filter(c=> !["feat","fix","perf"].some(p=> c.message.startsWith(p))),
  };
  const clean = (m:string)=> m.replace(/^(feat|fix|perf|chore|chore\(.*\)|docs|style|refactor|test)(\(\w+\))?:\s*/i,"");
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
      <footer className="mt-10 border-t border-white/10 bg-[#0f1e2e] text-slate-300">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="max-w-[1400px] mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Brand — now shows latest build version */}
            <div className="lg:col-span-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white to-[#eef2f7] border border-white/20 flex items-center justify-center shadow-sm text-[18px]">🛡️</div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black tracking-tight text-white text-[15px]">PLGen</span>
                    <span className="text-[11px] font-bold tracking-widest text-white/70 bg-white/10 border border-white/10 px-2 py-0.5 rounded-full">v{APP_VERSION}</span>
                    <span className="text-[11px] font-mono font-black tracking-widest text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">Build {latestBuild}</span>
                  </div>
                  <div className="text-[11px] font-semibold tracking-widest text-white/40 -mt-0.5">LOGISTICS • VITTORIA</div>
                </div>
              </div>
              <div className="mt-3 text-xs leading-relaxed text-white/60">
                <div>{t("footer.madeBy")}</div>
                <div className="text-white/40 text-[11px] mt-1">Secure • Fast • Reliable — Desktop optimized</div>
              </div>
              <div className="mt-3 inline-flex items-center gap-2 text-[11px] font-mono text-white/25">© {new Date().getFullYear()} Vittoria • Latest {CHANGELOGS[0]?.date}</div>
            </div>

            {/* Changelogs — grouped */}
            <div className="lg:col-span-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-black tracking-tight text-white">{t("footer.changelogs")}</span>
                <span className="text-[11px] bg-white text-[#0f1e2e] px-2 py-0.5 rounded-full font-black">{CHANGELOGS.length} updates</span>
                <span className="hidden sm:inline text-[11px] text-white/25 ml-auto">Grouped • Build {latestBuild}</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
                <div className="max-h-[190px] overflow-auto p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Features */}
                  <div>
                    <div className="text-[11px] font-black tracking-widest text-emerald-300 mb-1.5">✨ FEATURES ADDED</div>
                    <ul className="space-y-1">
                      {groups.features.slice(0,5).map(c=> <li key={c.hash} className="text-xs leading-snug text-white/75 list-disc ml-4">{clean(c.message)}</li>)}
                      {groups.features.length===0 && <li className="text-xs text-white/30">—</li>}
                    </ul>
                  </div>
                  {/* Fixes */}
                  <div>
                    <div className="text-[11px] font-black tracking-widest text-amber-300 mb-1.5">🔧 FIXES</div>
                    <ul className="space-y-1">
                      {groups.fixes.slice(0,5).map(c=> <li key={c.hash} className="text-xs leading-snug text-white/75 list-disc ml-4">{clean(c.message)}</li>)}
                      {groups.fixes.length===0 && <li className="text-xs text-white/30">—</li>}
                    </ul>
                  </div>
                  {/* Others */}
                  <div>
                    <div className="text-[11px] font-black tracking-widest text-white/50 mb-1.5">⚡ OTHER</div>
                    <ul className="space-y-1">
                      {[...groups.perf, ...groups.others].slice(0,5).map(c=> <li key={c.hash} className="text-xs leading-snug text-white/60 list-disc ml-4">{clean(c.message)}</li>)}
                      {groups.perf.length+groups.others.length===0 && <li className="text-xs text-white/30">—</li>}
                    </ul>
                  </div>
                </div>
                <div className="px-3 py-2 bg-white/[0.02] border-t border-white/5 flex items-center justify-between text-[11px] text-white/30">
                  <span>Build {latestBuild} • {CHANGELOGS[0]?.date}</span>
                  <span>Showing recent • {CHANGELOGS.length} total</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-white/25">
            <span>Built for DC Vittoria • Desktop only • © {new Date().getFullYear()} Burger Bangor</span>
            <span>v{APP_VERSION} • Build {latestBuild}</span>
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
          <AntiCheatProvider>
            <AccessGate>
              <DesktopGate>
                <AppRoutes />
              </DesktopGate>
            </AccessGate>
          </AntiCheatProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
