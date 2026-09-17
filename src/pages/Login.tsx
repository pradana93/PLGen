import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../i18n";

export default function Login(){
  const { signIn } = useAuth();
  const { t } = useLanguage();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);

  // Flagship login shield — block Inspect / DevTools even before auth (AntiCheat runs only after login)
  useEffect(()=>{
    const blockCtx = (e: MouseEvent)=> { e.preventDefault(); return false as any; };
    const blockKeys = (e: KeyboardEvent)=>{
      if(e.key==="F12") { e.preventDefault(); e.stopPropagation(); return false as any; }
      if(e.ctrlKey && e.shiftKey && ["I","J","C","K"].includes(e.key.toUpperCase())) { e.preventDefault(); e.stopPropagation(); return false as any; }
      if(e.ctrlKey && e.key.toLowerCase()==="u") { e.preventDefault(); e.stopPropagation(); return false as any; }
      if(e.metaKey && e.altKey && e.key.toLowerCase()==="i") { e.preventDefault(); e.stopPropagation(); return false as any; }
    };
    document.addEventListener("contextmenu", blockCtx as any, true);
    document.addEventListener("keydown", blockKeys as any, true);
    // DevTools dock detection via window chrome gap + debugger timing (no auth needed)
    let dbgTimer: ReturnType<typeof setTimeout> | null = null;
    const runDbg = ()=>{
      const start = performance.now();
      try { eval("debugger"); } catch {}
      const elapsed = performance.now() - start;
      if(elapsed > 100) setDevtoolsOpen(true);
      dbgTimer = setTimeout(runDbg, 3000);
    };
    dbgTimer = setTimeout(runDbg, 2500);
    const sizeCheck = setInterval(()=>{
      const dw = window.outerWidth - window.innerWidth;
      const dh = window.outerHeight - window.innerHeight;
      if(dw > 180 || dh > 180) setDevtoolsOpen(true);
      else if(dw < 100 && dh < 100) setDevtoolsOpen(false);
    }, 1500);
    return ()=>{
      document.removeEventListener("contextmenu", blockCtx as any, true);
      document.removeEventListener("keydown", blockKeys as any, true);
      if(dbgTimer) clearTimeout(dbgTimer);
      clearInterval(sizeCheck);
    };
  },[]);

  const submit = async (e: React.FormEvent)=>{
    e.preventDefault();
    setErr(""); setLoading(true);
    const r = await signIn(email, password);
    setLoading(false);
    if (r.error) {
      // Hide internal details like "Supabase not configured"
      const msg = r.error.toLowerCase().includes("supabase not configured") ? t("login.unavailable") : r.error;
      setErr(msg);
    } else nav("/");
  };

  const [showPw, setShowPw] = useState(false);
  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center p-4 md:p-6 bg-gradient-to-br from-[#0f1e2e] via-[#162a45] to-[#1e3a5f] relative overflow-hidden">
      {/* flagship orbs */}
      <div className="absolute -top-24 -right-24 w-[520px] h-[520px] bg-white/[0.06] rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-[640px] h-[640px] bg-sky-400/[0.07] rounded-full blur-[90px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[520px] bg-emerald-400/[0.04] rounded-full blur-[90px] pointer-events-none" />

      <div className="w-full max-w-[1080px] grid grid-cols-1 lg:grid-cols-2 gap-0 rounded-[28px] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.28)] border border-white/10 bg-white/5 backdrop-blur-sm">
        {/* Left — brand / flagship */}
        <div className="relative bg-gradient-to-br from-[#0f1e2e] via-[#1a2f4a] to-[#2c3e50] p-8 lg:p-10 text-white flex flex-col justify-between overflow-hidden min-h-[420px]">
          <div className="absolute -right-16 -top-16 w-48 h-48 bg-white/[0.06] rounded-full blur-2xl" />
          <div className="absolute -left-12 -bottom-12 w-36 h-36 bg-emerald-400/[0.08] rounded-full blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white text-[#0f1e2e] flex items-center justify-center text-lg shadow-lg border border-white/20">🛡️</div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="font-black text-[20px] tracking-tight">PLGen</span>
                  <span className="text-[11px] font-bold tracking-widest bg-white text-[#0f1e2e] px-2 py-0.5 rounded-full">v2.0</span>
                </div>
                <div className="text-[11px] tracking-widest font-semibold text-white/50">LOGISTICS • VITTORIA</div>
              </div>
            </div>
            <h1 className="mt-8 text-[28px] font-black leading-tight tracking-tight">Flagship Packing<br />List Generator</h1>
            <p className="mt-3 text-sm leading-relaxed text-white/60">Burger Bangor • Secure • Fast • Reliable<br />Desktop optimized — Supabase + PythonAnywhere</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-bold">☁️ Cloud Sync</span>
              <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-bold">🛡️ Anti-Cheat</span>
              <span className="px-3 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-black shadow">● Online</span>
            </div>
          </div>
          <div className="relative mt-8 rounded-2xl bg-white/8 border border-white/10 p-4 backdrop-blur">
            <div className="text-[11px] font-black tracking-widest text-white/50">TRUSTED BY DC VITTORIA</div>
            <div className="text-xs text-white/70 mt-1">“Zero-error packing, instant Excel + labels, live board & audit.”</div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-white/40">© {new Date().getFullYear()} Burger Bangor • Secure login</div>
          </div>
        </div>

        {/* Right — form, flagship glass */}
        <div className="bg-white p-8 lg:p-10 flex flex-col justify-center">
          {devtoolsOpen && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 flex items-start gap-2">
              <span className="text-amber-600 mt-0.5">⚠️</span>
              <div className="text-xs leading-relaxed text-amber-800"><b>Inspection blocked.</b> Close Developer Tools to continue — this login is anti-cheat protected.</div>
            </div>
          )}
          <div className="mb-6">
            <h2 className="text-[22px] font-black text-[#0f1e2e]">Welcome back</h2>
            <p className="text-sm text-slate-500 mt-1">{t("login.subtitle")} — sign in to continue</p>
          </div>
          <form onSubmit={submit} className={`space-y-4 ${devtoolsOpen ? "blur-[6px] pointer-events-none select-none" : ""}`}>
            <div>
              <label className="text-xs font-extrabold tracking-wide text-slate-700">{t("login.email")}</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">✉️</span>
                <input value={email} onChange={e=> setEmail(e.target.value)} placeholder="you@example.com" type="email" required autoComplete="email" className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-3 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f1e2e]/15 focus:border-[#0f1e2e]/30 transition" />
              </div>
            </div>
            <div>
              <label className="text-xs font-extrabold tracking-wide text-slate-700">{t("login.password")}</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔒</span>
                <input value={password} onChange={e=> setPassword(e.target.value)} placeholder="••••••••" type={showPw ? "text" : "password"} required autoComplete="current-password" className="w-full border border-slate-200 rounded-xl pl-9 pr-10 py-3 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f1e2e]/15 focus:border-[#0f1e2e]/30 transition" />
                <button type="button" onClick={()=> setShowPw(v=>!v)} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100">{showPw?"Hide":"Show"}</button>
              </div>
            </div>
            {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2"><span>⛔</span><span>{err}</span></div>}
            <button type="submit" disabled={loading} className="w-full bg-[#0f1e2e] hover:bg-black text-white rounded-xl py-3.5 font-black text-sm shadow-[0_8px_20px_rgba(15,30,46,0.22)] disabled:opacity-50 transition active:scale-[0.99]">
              {loading ? t("login.signingIn") : `${t("login.signIn")} →`}
            </button>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Secure • Supabase Auth • Encrypted
            </div>
          </form>
          <div className="text-xs text-slate-400 text-center mt-6 border-t border-slate-100 pt-4">
            {t("login.needAccount")}
          </div>
        </div>
      </div>
    </div>
  );
}
