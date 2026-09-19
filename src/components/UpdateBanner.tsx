import { useEffect, useState } from "react";

function currentAssetHash(): string | null {
  try {
    const s = document.querySelector('script[src*="/assets/index-"]') as HTMLScriptElement | null;
    if(!s) return null;
    const m = s.src.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
    return m ? m[1] : null;
  } catch { return null; }
}

export default function UpdateBanner(){
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(()=>{
    let stopped = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    const check = async ()=>{
      try {
        const cur = currentAssetHash();
        if(!cur) return;
        const res = await fetch(`${window.location.origin}/?t=${Date.now()}`, { cache: "no-store" } as any);
        const html = await res.text();
        const m = html.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
        const srv = m ? m[1] : null;
        if(!srv || srv===cur) return;
        if(!stopped){
          setLatest(srv);
          setHasUpdate(true);
        }
      } catch {}
    };
    // First check after 60s, then every 60s (flagship poll, lightweight, no spinner)
    const start = setTimeout(()=> {
      check();
      interval = setInterval(check, 60000);
    }, 60000);
    return ()=> { stopped=true; clearTimeout(start); if(interval) clearInterval(interval); };
  },[]);

  if(!hasUpdate) return null;
  return (
    <div className="sticky top-[56px] z-40 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-white shadow-[0_4px_16px_rgba(0,0,0,0.12)] border-b border-white/20">
      <div className="max-w-[1400px] mx-auto px-4 py-2.5 flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
        <span className="text-xs md:text-sm font-black tracking-tight">New Update available!</span>
        <span className="hidden md:inline text-xs text-white/80">Refresh to take effect • {latest ? `Build ${latest.slice(0,7)}` : ""}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=> window.location.reload()} className="px-4 py-1.5 rounded-full bg-white text-[#0f1e2e] text-xs font-black shadow hover:bg-gray-100 transition btn-press">↻ Refresh</button>
          <button onClick={()=> setHasUpdate(false)} className="px-3 py-1.5 rounded-full bg-white/15 border border-white/20 text-white text-xs font-bold hover:bg-white/20">Dismiss</button>
        </div>
      </div>
    </div>
  );
}
