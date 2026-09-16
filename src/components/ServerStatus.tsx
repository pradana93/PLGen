import { useEffect, useState, useRef } from "react";
import { useLanguage } from "../i18n";

type ServiceStatus = "ok" | "down" | "checking";

interface HealthData {
  status: string;
  version: string;
  wib: string;
  supabase: boolean;
  pythonAnywhere: boolean;
}

export default function ServerStatus() {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [pyStatus, setPyStatus] = useState<ServiceStatus>("checking");
  const [sbStatus, setSbStatus] = useState<ServiceStatus>("checking");
  const [lastCheck, setLastCheck] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");

  const checkHealth = async () => {
    setIsRefreshing(true);
    try {
      const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const data = await r.json();
        setHealth(data);
        setSbStatus(data.supabase ? "ok" : "down");
        setPyStatus(data.pythonAnywhere ? "ok" : "down");
      } else {
        setPyStatus("down");
        setSbStatus("down");
        setHealth(null);
      }
    } catch {
      setPyStatus("down");
      setSbStatus("down");
      setHealth(null);
    }
    setLastCheck(new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" }));
    setIsRefreshing(false);
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setExpanded(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [expanded]);

  const allOk = pyStatus === "ok" && sbStatus === "ok";
  const allDown = pyStatus === "down" && sbStatus === "down";

  const statusMeta = allDown
    ? { label: t("status.offline"), dot: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]", pill: "bg-red-500/15 text-red-100 border-red-400/20", pulse: "bg-red-500" }
    : allOk
    ? { label: t("status.allConnected"), dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]", pill: "bg-emerald-500/15 text-emerald-100 border-emerald-400/20", pulse: "bg-emerald-500" }
    : { label: t("status.partial"), dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]", pill: "bg-amber-500/15 text-amber-100 border-amber-400/20", pulse: "bg-amber-400" };

  const ServiceRow = ({
    icon, name, desc, status, accent
  }: { icon: string; name: string; desc: string; status: ServiceStatus; accent: string }) => {
    const isOk = status === "ok";
    const isChecking = status === "checking";
    return (
      <div className="group flex items-center gap-3 p-3 rounded-xl bg-[#f8fafc] border border-slate-200/70 hover:border-slate-300 hover:bg-white hover:shadow-sm transition-all">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm shrink-0 border ${isOk ? "bg-white border-emerald-200" : isChecking ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`} style={{ borderColor: isOk ? accent : undefined }}>
          <span className="text-[15px]">{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-slate-800 leading-none group-hover:text-[#2c3e50]">{name}</div>
          <div className="text-[10px] text-slate-500 leading-tight mt-0.5 truncate">{desc}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide px-2 py-1 rounded-full border ${isOk ? "bg-emerald-50 text-emerald-700 border-emerald-200" : isChecking ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-red-50 text-red-700 border-red-200"}`}>
            <span className={`w-2 h-2 rounded-full ${isOk ? "bg-emerald-500" : isChecking ? "bg-amber-400 animate-pulse" : "bg-red-500"}`} />
            {isOk ? "Online" : isChecking ? "..." : "Offline"}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Premium Trigger Pill */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2.5 pl-2.5 pr-3 py-1.5 rounded-full border text-xs font-bold tracking-wide transition-all backdrop-blur-sm
          ${allOk ? "bg-emerald-500/10 border-emerald-400/20 hover:bg-emerald-500/15 text-emerald-100" : allDown ? "bg-red-500/10 border-red-400/20 hover:bg-red-500/15 text-red-100" : "bg-amber-500/10 border-amber-400/20 hover:bg-amber-500/15 text-amber-100"}`}
      >
        <span className="relative flex w-2.5 h-2.5">
          <span className={`absolute inline-flex w-full h-full rounded-full opacity-40 animate-ping ${statusMeta.pulse}`} />
          <span className={`relative inline-flex w-2.5 h-2.5 rounded-full shadow ${statusMeta.dot}`} />
        </span>
        <span className="drop-shadow-sm">{statusMeta.label}</span>
        <svg className={`w-3 h-3 opacity-60 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Premium Dropdown */}
      {expanded && (
        <div className="absolute top-full right-0 mt-3 w-[360px] bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.22),0_4px_12px_rgba(0,0,0,0.1)] border border-slate-200/80 z-[70] overflow-hidden animate-[fadeIn_140ms_ease]">
          {/* Header — Navy gradient like Dashboard cards */}
          <div className="relative bg-gradient-to-br from-[#2c3e50] via-[#34495e] to-[#2c3e50] px-5 pt-4 pb-4 text-white overflow-hidden">
            <div className="absolute -right-8 -top-8 w-24 h-24 bg-white/5 rounded-full blur-2xl" />
            <div className="absolute -left-6 -bottom-6 w-20 h-20 bg-emerald-400/10 rounded-full blur-xl" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center backdrop-blur-sm shrink-0">
                  <span className="text-[16px]">🛰️</span>
                </div>
                <div>
                  <div className="text-sm font-extrabold tracking-tight leading-none">Server Status</div>
                  <div className="text-[11px] text-white/70 mt-1 font-medium">{t("status.lastChecked", { time: lastCheck || "—" })}</div>
                </div>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1.5 text-[10px] font-extrabold tracking-widest px-2.5 py-1 rounded-full border backdrop-blur-sm ${statusMeta.pill}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot.split(" ")[0]} animate-pulse`} /> LIVE
              </span>
            </div>
          </div>

          {/* Services */}
          <div className="px-3 py-3 space-y-2 bg-white">
            <ServiceRow icon="☁️" name="PythonAnywhere" desc={t("status.masterData")} status={pyStatus} accent="#3498db" />
            <ServiceRow icon="🔐" name="Supabase" desc={t("status.authDb")} status={sbStatus} accent="#10b981" />
            <div className="group flex items-center gap-3 p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/50 hover:bg-emerald-50 hover:border-emerald-200 transition-all">
              <div className="w-9 h-9 rounded-lg bg-white border border-emerald-200 flex items-center justify-center shrink-0">
                <span className="text-[15px]">⚡</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-800 leading-none">Vercel API</div>
                <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{t("status.backend")} • Edge</div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Online
              </span>
            </div>
          </div>

          {/* Footer meta */}
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200/70 space-y-2.5">
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-2 text-slate-500">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-slate-200 font-mono font-bold text-slate-700">
                  v{health?.version || "2.0.0"}
                </span>
                <span className="hidden sm:inline text-slate-400">•</span>
                <span className="font-medium text-slate-600">WIB: {health?.wib || "—"}</span>
              </div>
              <span className={`w-2 h-2 rounded-full ${health ? "bg-emerald-500" : "bg-slate-300"}`} />
            </div>
            {!health && <div className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{t("status.unreachable")}</div>}
            <button
              onClick={checkHealth}
              disabled={isRefreshing}
              className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-bold py-2 rounded-xl bg-[#2c3e50] text-white hover:bg-[#34495e] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              <svg className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isRefreshing ? "Checking..." : t("status.refresh")}
            </button>
            <div className="text-[9px] text-center text-slate-400 font-medium tracking-wide">Auto-refresh every 30s • PythonAnywhere is source of truth</div>
          </div>
        </div>
      )}
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-6px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
    </div>
  );
}
