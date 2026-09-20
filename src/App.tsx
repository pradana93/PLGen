import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import DigitalPl from "./pages/DigitalPl";
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
import Copilot from "./components/Copilot";
import FeedbackModal from "./components/FeedbackModal";
import BootstrapSplash from "./components/BootstrapSplash";
import RankBadge from "./components/RankBadge";
import { getExportDest, setExportDest, driveStatus, driveConnect, driveDisconnect, type ExportDest } from "./lib/drive";
import { expFetchMe, badgeForLevel, isExpEligible, type ExpMe } from "./lib/exp";
import UpdateBanner from "./components/UpdateBanner";
import { APP_VERSION, CHANGELOGS } from "./lib/changelogs";
import { useState, useRef, useEffect } from "react";

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
  const [profileOpen, setProfileOpen] = useState(false);
  // Export destination (Local | Google Drive) — per browser, Local default. Drive needs per-user connect.
  const [exportDest, setExportDestState] = useState<ExportDest>("local");
  const [driveConn, setDriveConn] = useState<boolean | null>(null);
  const refreshDrive = async ()=>{
    try { const s = await driveStatus(); setDriveConn(!!s.connected); }
    catch { setDriveConn(false); }
  };
  const pickDest = (d: ExportDest)=>{
    setExportDest(d);
    setExportDestState(d);
    if (d === "drive") refreshDrive();
  };
  // EXP flex (Admin/Operator only) — avatar pip + dropdown card. Checkers fetch nothing.
  const [expMe, setExpMe] = useState<ExpMe | null>(null);
  useEffect(()=>{
    if (!user || !isExpEligible(profile?.role)) { setExpMe(null); return; }
    let live = true;
    expFetchMe().then(m => { if (live) setExpMe(m); }).catch(()=>{});
    return ()=> { live = false; };
  },[user, profile?.role]);
  const profileRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const onClick = (e:MouseEvent)=> { if(profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false); };
    const onEsc = (e:KeyboardEvent)=> { if(e.key==="Escape") setProfileOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    try { setExportDestState(getExportDest()); } catch {}
    return ()=> { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onEsc); };
  },[]);
  useEffect(()=>{ if(profileOpen) refreshDrive(); },[profileOpen]);
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

        {/* Nav pills — centered — role-gated flagship (Super Admin immortal full, Admin Dashboard/Digital PL/Live Board, Checker Digital PL only) */}
        <div className="hidden md:flex items-center gap-1.5 ml-4 bg-black/10 border border-white/10 rounded-full p-1">
          {["Super Admin","Admin"].includes(profile?.role||"") && link("/", t("nav.dashboard"))}
          {["Super Admin","Admin","Checker"].includes(profile?.role||"") && link("/digital-pl", t("nav.digitalPl"))}
          {["Super Admin","Admin"].includes(profile?.role||"") && link("/live", t("nav.live"))}
          {["Super Admin","Admin"].includes(profile?.role||"") && link("/admin", t("nav.admin"))}
          {!profile && <span className="text-white/40 text-xs px-2">Login to view</span>}
        </div>
        {/* mobile nav */}
        <div className="flex md:hidden items-center gap-1 ml-2">
          {["Super Admin","Admin"].includes(profile?.role||"") && link("/", "Dash")}
          {["Super Admin","Admin","Checker"].includes(profile?.role||"") && link("/digital-pl", "DigiPL")}
          {["Super Admin","Admin"].includes(profile?.role||"") && link("/live", "Report")}
          {["Super Admin","Admin"].includes(profile?.role||"") && link("/admin", "Admin")}
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
            <div className="relative" ref={profileRef}>
              <button
                onClick={()=> setProfileOpen(v=> !v)}
                className={`flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-full border transition-all ${profileOpen ? "bg-white text-[#0f1e2e] border-white shadow-md" : "bg-white/[0.08] border-white/15 text-white hover:bg-white/[0.12] hover:border-white/25"}`}
                aria-haspopup="menu" aria-expanded={profileOpen}
              >
                <div className={`relative w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shadow-sm shrink-0 ${profileOpen ? "bg-gradient-to-br from-[#3498db] to-[#2c3e50] text-white" : "bg-gradient-to-br from-[#3498db] to-[#2c3e50] border border-white/15 text-white"}`}>{initials}
                  {expMe && (
                    <span className="absolute -bottom-1 -right-1" title={`Lv ${expMe.level} • ${expMe.title}`}>
                      <RankBadge badge={badgeForLevel(expMe.level)} level={expMe.level} title={expMe.title} size={15} gm={profile?.role === "Super Admin"} />
                    </span>
                  )}
                </div>
                <div className="hidden sm:block leading-tight text-left max-w-[160px]">
                  <div className={`text-xs font-extrabold truncate ${profileOpen?"text-[#0f1e2e]":"text-white"}`}>{profile?.alias || profile?.email?.split("@")[0] || user.email.split("@")[0]}</div>
                  <div className={`text-[10px] font-bold tracking-widest truncate ${profileOpen?"text-slate-500":"text-white/55"}`}>{profile?.role || "—"}</div>
                </div>
                <span className={`hidden sm:block text-[10px] ml-0.5 transition-transform ${profileOpen?"rotate-180 text-slate-400":"text-white/60"}`}>▾</span>
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-[44px] w-[320px] rounded-2xl bg-white shadow-[0_16px_48px_rgba(0,0,0,0.18)] border border-slate-200 overflow-hidden z-50 animate-[lb-fadeUp_0.18s_ease-out]">
                  {/* Flagship profile header */}
                  <div className="bg-gradient-to-br from-[#0f1e2e] via-[#1a2f4a] to-[#2c3e50] p-4 text-white relative overflow-hidden">
                    <div className="absolute -right-8 -top-8 w-24 h-24 bg-white/[0.06] rounded-full blur-2xl" />
                    <div className="absolute -left-6 -bottom-6 w-20 h-20 bg-emerald-400/[0.08] rounded-full blur-xl" />
                    <div className="relative flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-white text-[#0f1e2e] flex items-center justify-center text-sm font-black shadow-lg border border-white/20">{initials}</div>
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-sm leading-tight truncate">{profile?.alias || user.email.split("@")[0]}</div>
                        <div className="text-xs text-white/70 truncate">{profile?.email || user.email}</div>
                        <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-white/15 border border-white/15 text-[10px] font-black tracking-widest text-white/90">{profile?.role || "—"}</div>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 space-y-2.5">
                    {expMe && (
                      <div className="rounded-xl bg-gradient-to-br from-[#0f1e2e] via-[#1a2f4a] to-[#2c3e50] border border-white/10 px-3 py-2.5 text-white relative overflow-hidden">
                        <div className="absolute -right-6 -top-6 w-20 h-20 bg-white/[0.06] rounded-full blur-xl pointer-events-none" />
                        <div className="relative flex items-center gap-2.5">
                          <RankBadge badge={badgeForLevel(expMe.level)} level={expMe.level} title={expMe.title} size={40} gm={profile?.role === "Super Admin"} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-1.5">
                              <span className="font-black text-sm">Lv {expMe.level}</span>
                              <span className="text-[10px] font-bold tracking-widest text-amber-300">{expMe.title.toUpperCase()}</span>
                            </div>
                            <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-amber-300 to-emerald-400 transition-all" style={{ width: `${Math.round(expMe.progress * 100)}%` }} />
                            </div>
                            <div className="mt-1 text-[10px] font-mono text-white/60">{expMe.exp.toLocaleString()} / {expMe.next.toLocaleString()} EXP • {expMe.exports} PLs • {expMe.days}d active</div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                        <div className="text-[10px] font-black tracking-widest text-slate-400">STATUS</div>
                        <div className="text-xs font-bold text-emerald-600 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Online</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                        <div className="text-[10px] font-black tracking-widest text-slate-400">USER ID</div>
                        <div className="text-[11px] font-mono font-bold text-slate-600 truncate" title={profile?.id || user.id}>{(profile?.id || user.id).slice(0,8)}…</div>
                      </div>
                    </div>
                    {profile?.last_login_at && (
                      <div className="rounded-xl border border-slate-100 px-3 py-2 bg-white flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-400">Last login</span>
                        <span className="text-xs font-mono font-bold text-slate-700">{new Date(profile.last_login_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})}</span>
                      </div>
                    )}
                    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                      <div className="text-[10px] font-black tracking-widest text-slate-400">EXPORT DESTINATION</div>
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <button onClick={()=> pickDest("local")} className={`px-2 py-1.5 rounded-lg text-[11px] font-black transition ${exportDest==="local" ? "bg-[#0f1e2e] text-white shadow" : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-100"}`}>💾 {t("drive.local")}</button>
                        <button onClick={()=> pickDest("drive")} className={`px-2 py-1.5 rounded-lg text-[11px] font-black transition ${exportDest==="drive" ? "bg-[#0f1e2e] text-white shadow" : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-100"}`}>☁️ {t("drive.drive")}</button>
                      </div>
                      {exportDest==="drive" && (
                        <div className="mt-1.5">
                          {driveConn === null && <div className="text-[11px] text-slate-400">Checking Google link…</div>}
                          {driveConn === true && (
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-emerald-600">✓ {t("drive.connected")}</span>
                              <button onClick={async()=>{ await driveDisconnect(); setDriveConn(false); }} className="text-[11px] font-bold text-red-500 underline">{t("drive.disconnect")}</button>
                            </div>
                          )}
                          {driveConn === false && (
                            <button onClick={async()=>{ try { await driveConnect(); } catch {} }} className="w-full px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-black text-slate-600 hover:bg-slate-100">{t("drive.connect")}</button>
                          )}
                          <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1.5 text-[10px] leading-relaxed text-amber-700">⚠️ {t("drive.unverifiedNote")}</div>
                        </div>
                      )}
                    </div>
                    <button onClick={()=> { setProfileOpen(false); (window as any).__openFeedback?.(); }} className="w-full px-3 py-2 rounded-xl bg-gradient-to-r from-[#0f1e2e] to-[#1a2f4a] text-white text-xs font-extrabold hover:from-black hover:to-[#0f1e2e] transition flex items-center justify-center gap-1.5">💬 Send Feedback</button>
                    <div className="flex items-center gap-2 pt-1">
                      <Link to="/admin" onClick={()=> setProfileOpen(false)} className="flex-1 text-center px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-black transition">View Admin</Link>
                      <button onClick={()=> { setProfileOpen(false); signOut(); }} className="flex-1 px-3 py-2 rounded-xl bg-white border border-red-200 text-red-600 text-xs font-extrabold hover:bg-red-50 transition">{t("nav.logout")}</button>
                    </div>
                    <div className="text-[10px] text-slate-300 text-center">Secure • PLGen Vittoria • v{APP_VERSION}</div>
                  </div>
                </div>
              )}
            </div>
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
  if (loading) return <div className="p-8 max-w-[1400px] mx-auto space-y-3"><div className="h-8 w-40 skeleton rounded-xl" /><div className="h-32 skeleton rounded-2xl" /><div className="h-64 skeleton rounded-2xl" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && profile && !roles.includes(profile.role)) {
    return <div className="p-8 text-center"><div className="text-lg font-bold">{t("auth.accessDenied")}</div><div className="text-sm text-gray-500">{t("auth.accessDeniedMsg", { role: profile.role, required: roles.join(", ") })}</div></div>;
  }
  return <div className="page-enter">{children}</div>;
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
  const loc = useLocation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [driveFlash, setDriveFlash] = useState<string | null>(null);
  useEffect(()=>{ (window as any).__openFeedback = ()=> setFeedbackOpen(true); return ()=> { delete (window as any).__openFeedback; }; },[]);
  // Google Drive connect bounce (?drive=connected|error) — one-time notice, then clean URL
  useEffect(()=>{
    try {
      const q = new URLSearchParams(window.location.search);
      const d = q.get("drive");
      if (d === "connected" || d === "error") {
        setDriveFlash(d);
        q.delete("drive");
        const rest = q.toString();
        window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
        setTimeout(()=> setDriveFlash(null), 5000);
      }
    } catch {}
  },[]);
  return (
    <>
      <Nav />
      <UpdateBanner />
      <Copilot />
      <FeedbackModal open={feedbackOpen} onClose={()=> setFeedbackOpen(false)} />
      {driveFlash && (
        <div className="max-w-[1400px] mx-auto px-4 pt-3">
          <div className={`text-xs font-bold rounded-xl px-4 py-2.5 border ${driveFlash === "connected" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
            {driveFlash === "connected" ? `✓ ${t("drive.connected")} — pick Google Drive in the profile menu to export there` : t("drive.notConnected")}
          </div>
        </div>
      )}
      {/* Flagship floating Feedback pill */}
      <button onClick={()=> setFeedbackOpen(true)} className="fixed bottom-5 left-5 z-40 hidden md:flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#0f1e2e] text-white text-xs font-black shadow-[0_8px_24px_rgba(0,0,0,0.18)] border border-white/10 hover:bg-black transition btn-press">💬 Feedback</button>
      <Routes location={loc} key={loc.pathname}>
        <Route path="/login" element={<Login />} />
        {/* Admin: Dashboard + Digital PL + Live Board; Checker: Digital PL only; Super Admin: all */}
        <Route path="/" element={<Protected roles={["Super Admin","Admin"]}><Dashboard /></Protected>} />
        <Route path="/digital-pl" element={<Protected roles={["Super Admin","Admin","Checker"]}><DigitalPl /></Protected>} />
        <Route path="/live" element={<Protected roles={["Super Admin","Admin"]}><LiveBoard /></Protected>} />
        <Route path="/manifests" element={<Protected roles={["Super Admin"]}><Manifests /></Protected>} />
        <Route path="/inbound" element={<Protected roles={["Super Admin"]}><Inbound /></Protected>} />
        <Route path="/admin" element={<Protected roles={["Super Admin","Admin"]}><Admin /></Protected>} />
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
                <BootstrapSplash />
                <AppRoutes />
              </DesktopGate>
            </AccessGate>
          </AntiCheatProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
