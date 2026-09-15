import { useEffect, useState } from "react";
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

  const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");

  const checkHealth = async () => {
    // Check Vercel API
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
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const allOk = pyStatus === "ok" && sbStatus === "ok";
  const allDown = pyStatus === "down" && sbStatus === "down";
  const dotColor = allDown ? "bg-red-500 shadow-red-500/50" : allOk ? "bg-green-500 shadow-green-500/50" : "bg-yellow-400 shadow-yellow-400/50";
  const textColor = allDown ? "text-red-600" : allOk ? "text-green-700" : "text-yellow-700";

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg text-xs font-semibold hover:bg-white/20 transition-colors"
      >
        <span className={`w-2.5 h-2.5 rounded-full shadow-lg animate-pulse ${dotColor}`} />
        <span className={textColor}>{allOk ? t("status.allConnected") : allDown ? t("status.offline") : t("status.partial")}</span>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="absolute bottom-full right-0 mb-2 w-72 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b bg-[#f4f6f9]">
            <div className="font-bold text-sm text-[#2c3e50]">{t("status.title")}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{t("status.lastChecked", { time: lastCheck || "—" })}</div>
          </div>
          <div className="px-4 py-3 space-y-3">
            {/* PythonAnywhere */}
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold">PythonAnywhere</div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">{t("status.masterData")}</span>
                <span className={`w-3 h-3 rounded-full ${pyStatus==="ok" ? "bg-green-500" : pyStatus==="checking" ? "bg-yellow-400 animate-pulse" : "bg-red-500"}`} />
              </div>
            </div>
            {/* Supabase */}
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold">Supabase</div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">{t("status.authDb")}</span>
                <span className={`w-3 h-3 rounded-full ${sbStatus==="ok" ? "bg-green-500" : sbStatus==="checking" ? "bg-yellow-400 animate-pulse" : "bg-red-500"}`} />
              </div>
            </div>
            {/* Vercel API */}
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold">Vercel API</div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">{t("status.backend")}</span>
                <span className="w-3 h-3 rounded-full bg-green-500" />
              </div>
            </div>
            <hr className="border-gray-200" />
            <div className="text-[10px] text-gray-500 space-y-1">
              {health && <div>{t("status.version")} <span className="font-mono font-bold">{health.version}</span> • WIB: {health.wib}</div>}
              {!health && <div className="text-red-500">{t("status.unreachable")}</div>}
            </div>
            <button onClick={checkHealth} className="w-full text-[10px] py-1 bg-gray-100 rounded hover:bg-gray-200 text-gray-500">{t("status.refresh")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
