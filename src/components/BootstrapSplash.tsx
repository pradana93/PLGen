import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

// Flagship splash — GO B: only first open per session (sessionStorage), 800ms-1.2s max
// Visualizes: Authenticating to Supabase + Syncing Master (PythonAnywhere) + Anti-Cheat init — like Python validate_license splash
export default function BootstrapSplash(){
  const { loading } = useAuth();
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState(0); // 0: auth, 1: master, 2: anticheat, 3: ready
  const [progress, setProgress] = useState(0);

  useEffect(()=>{
    try {
      if(sessionStorage.getItem("plgen_splash_done")) return; // B: skip on refresh within session
    } catch {}
    setVisible(true);
    let p = 0;
    const steps = [
      { at: 18, phase: 0, label: "Authenticating to Supabase" },
      { at: 52, phase: 1, label: "Syncing Master Data" },
      { at: 82, phase: 2, label: "Initializing Anti-Cheat" },
    ];
    const tick = setInterval(()=>{
      p += Math.random()*11 + 4;
      if(p>100) p=100;
      setProgress(Math.floor(p));
      for(const s of steps) if(p>=s.at) setPhase(s.phase+1);
      if(p>=100 || (!loading && p>72)) {
        clearInterval(tick);
        setPhase(3);
        setProgress(100);
        setTimeout(()=>{
          setVisible(false);
          try { sessionStorage.setItem("plgen_splash_done","1"); } catch {}
        }, 420);
      }
    }, 90);
    // Hard cap 1.2s
    const cap = setTimeout(()=>{
      clearInterval(tick);
      setPhase(3);
      setProgress(100);
      setTimeout(()=>{
        setVisible(false);
        try { sessionStorage.setItem("plgen_splash_done","1"); } catch {}
      }, 380);
    }, 1200);
    return ()=> { clearInterval(tick); clearTimeout(cap); };
  },[loading]);

  if(!visible) return null;
  const labels = ["Authenticating to server…","Syncing Master Data (PythonAnywhere)…","Initializing Anti-Cheat…","Ready — Welcome to PLGen"];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-[#0f1e2e] via-[#162a45] to-[#1e3a5f] p-4">
      <div className="absolute -top-24 -right-24 w-[560px] h-[560px] bg-white/[0.05] rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-[680px] h-[680px] bg-sky-400/[0.06] rounded-full blur-[90px] pointer-events-none" />
      <div className="relative w-full max-w-[520px] rounded-[22px] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.32)] border border-white/10 bg-white">
        <div className="bg-gradient-to-br from-[#0f1e2e] via-[#1a2f4a] to-[#2c3e50] p-6 text-white relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-28 h-28 bg-white/[0.06] rounded-full blur-2xl" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white text-[#0f1e2e] flex items-center justify-center shadow border border-white/20">🛡️</div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-black text-[18px] tracking-tight">PLGen</span>
                <span className="text-[11px] font-bold tracking-widest bg-white text-[#0f1e2e] px-2 py-0.5 rounded-full">v2.0</span>
              </div>
              <div className="text-[11px] tracking-widest font-semibold text-white/50">LOGISTICS • VITTORIA • FLAGSHIP</div>
            </div>
            <span className="ml-auto px-2.5 py-1 rounded-full bg-emerald-500 text-white text-[11px] font-black shadow">● {phase<3 ? "Loading" : "Ready"}</span>
          </div>
          <div className="mt-5">
            <div className="text-sm font-extrabold">{labels[Math.min(phase,3)]}</div>
            <div className="text-xs text-white/60 mt-1">Supabase • PythonAnywhere • Anti-Cheat shield</div>
          </div>
          <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden border border-white/10">
            <div className="h-full bg-gradient-to-r from-emerald-400 via-sky-400 to-white transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-mono">
            <span className="text-white/50">{progress}%</span>
            <span className="text-white/30">Secure • {phase<3 ? "Initializing…" : "Done"}</span>
          </div>
        </div>
        <div className="px-5 py-3 flex items-center gap-2 text-[11px] text-slate-400 bg-slate-50 border-t border-slate-100">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          First open this session only — refresh shows subtle pulse, not full splash
        </div>
      </div>
    </div>
  );
}
