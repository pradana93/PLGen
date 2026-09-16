import { useEffect, useRef, useState } from "react";
import { apiGet } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n";
import { ask } from "../lib/copilot/entry";
import type { CopilotContext } from "../lib/copilot/types";

type Msg = { id: string; role: "user" | "copilot"; text: string; suggestions?: string[] };

let msgId = 0;
function id() { return `cp-${++msgId}-${Date.now()}`; }

const WELCOME = {
  en: `Hello! 👋 I'm PLGen Copilot — your local logistics assistant.\n\nI've studied this app's packing data, stock levels, and checker performance. Try asking:\n\n• "Today's summary"\n• "Weekly report"\n• "Any issues?"\n• "Check stock"`,
  id: `Halo! 👋 Saya PLGen Copilot — asisten logistik lokal Anda.\n\nSaya sudah mempelajari data packing, stok, dan performa checker di aplikasi ini. Coba tanya:\n\n• "Ringkasan hari ini"\n• "Laporan mingguan"\n• "Ada masalah?"\n• "Cek stok"`,
};

const SUGGEST_MAP: Record<string, { en: string[]; id: string[] }> = {
  greeting: { en: ["Today's summary","Check stock","Leaderboard"], id: ["Ringkasan hari ini","Cek stok","Papan peringkat"] },
  summary: { en: ["Weekly report","Any issues?","Check stock"], id: ["Laporan mingguan","Ada masalah?","Cek stok"] },
  checker: { en: ["Leaderboard","Weekly report"], id: ["Papan peringkat","Laporan mingguan"] },
  outlet: { en: ["Today's summary","Weekly report"], id: ["Ringkasan hari ini","Laporan mingguan"] },
  sku: { en: ["Today's summary","Check stock"], id: ["Ringkasan hari ini","Cek stok"] },
  stock: { en: ["Any issues?","Top 10 SKU"], id: ["Ada masalah?","Top 10 SKU"] },
  anomaly: { en: ["Today's summary","Weekly report"], id: ["Ringkasan hari ini","Laporan mingguan"] },
  team: { en: ["Weekly summary","Check stock"], id: ["Ringkasan mingguan","Cek stok"] },
  trend: { en: ["Weekly report","Leaderboard"], id: ["Laporan mingguan","Papan peringkat"] },
  fallback: { en: ["Today's summary","Check stock"], id: ["Ringkasan hari ini","Cek stok"] },
};

export default function Copilot(){
  const { user, profile } = useAuth();
  const { lang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const ctxRef = useRef<CopilotContext | null>(null);
  const welcomeDone = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const buildCtx = async (): Promise<CopilotContext> => {
    const [data, summary, ch, master, stock] = await Promise.all([
      apiGet("/api/packing_status").catch(()=>[]),
      apiGet("/api/report/summary").catch(()=>null),
      apiGet("/api/checkers").catch(()=>({ checkers: [] })),
      apiGet("/api/master_data").catch(()=>null),
      apiGet("/api/current_stock").catch(()=>null),
    ]);
    const ctx: CopilotContext = {
      lang,
      page: window.location.pathname,
      userLabel: profile?.alias || profile?.email || user?.email || "",
      role: profile?.role || "user",
      data: Array.isArray(data) ? data : [],
      summary,
      checkers: ch?.checkers || [],
      master,
      stock,
    };
    ctxRef.current = ctx;
    return ctx;
  };

  useEffect(()=>{ if (open) setTimeout(()=> inputRef.current?.focus(), 250); }, [open]);

  useEffect(()=>{
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  const suggestFor = (intentType: string): string[] => {
    const entry = SUGGEST_MAP[intentType] || SUGGEST_MAP.fallback;
    return lang === "id" ? entry.id : entry.en;
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setMsgs(m => [...m, { id: id(), role: "user", text }]);
    setBusy(true);
    try {
      const ctx = ctxRef.current && ctxRef.current.lang === lang ? ctxRef.current : await buildCtx();
      const { reply, intentType } = ask(text, ctx);
      setMsgs(m => [...m, { id: id(), role: "copilot", text: reply, suggestions: suggestFor(intentType) }]);
    } catch (e: any) {
      setMsgs(m => [...m, { id: id(), role: "copilot", text: `⚠️ ${e?.message || "Error"}` }]);
    }
    setBusy(false);
  };

  const openPanel = () => {
    setOpen(true);
    if (!welcomeDone.current) {
      welcomeDone.current = true;
      buildCtx().then(() => {
        setMsgs([{ id: id(), role: "copilot", text: lang === "id" ? WELCOME.id : WELCOME.en, suggestions: lang === "id" ? SUGGEST_MAP.greeting.id : SUGGEST_MAP.greeting.en }]);
      });
    }
  };

  const render = (text: string) => text.split("\n").map((line, i) => {
    const parts = line.split(/\*\*/);
    return (
      <div key={i} className={line.startsWith("  ") ? "ml-1.5" : ""}>
        {parts.map((p, j) => j % 2 === 1 ? <b key={j} className="font-bold text-[#1a252f]">{p}</b> : <span key={j} className="whitespace-pre-wrap">{p}</span>)}
      </div>
    );
  });

  if (!user) return null;

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={openPanel}
          className="fixed bottom-5 right-5 z-50 group flex items-center gap-2.5 bg-gradient-to-br from-[#1a252f] to-[#2c3e50] text-white rounded-full pl-2.5 pr-4 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.25)] hover:shadow-[0_12px_36px_rgba(0,0,0,0.35)] hover:scale-[1.03] transition-all active:scale-95"
          aria-label="Open PLGen Copilot"
        >
          <span className="relative">
            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-sm shadow-inner border border-white/20">🤖</span>
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#1a252f] animate-pulse" />
          </span>
          <span className="text-left leading-tight">
            <span className="block text-[12px] font-black tracking-tight">PLGen Copilot</span>
            <span className="block text-[10px] text-white/60 font-semibold">{t("copilot.bubbleSub")}</span>
          </span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[400px] max-w-[calc(100vw-2rem)] h-[580px] max-h-[calc(100vh-5rem)] bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] border border-slate-200/80 flex flex-col overflow-hidden" style={{ animation: "cp-slide-up 0.3s cubic-bezier(0.4,0,0.2,1) both" }}>
          <style>{`
            @keyframes cp-slide-up { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
            @keyframes cp-dot { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
            .cp-dot { animation: cp-dot 1.2s infinite ease-in-out; }
            .cp-dot:nth-child(2) { animation-delay: 0.15s; }
            .cp-dot:nth-child(3) { animation-delay: 0.3s; }
          `}</style>

          {/* Header */}
          <div className="bg-gradient-to-br from-[#1a252f] via-[#2c3e50] to-[#1a252f] px-4 py-3.5 text-white flex items-center gap-3 shrink-0 relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-24 h-24 bg-white/[0.05] rounded-full blur-xl" />
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-base shadow-lg border border-white/20 shrink-0">🤖</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-[13px] tracking-tight">PLGen Copilot</span>
                <span className="text-[9px] font-bold bg-emerald-400/20 text-emerald-300 border border-emerald-300/20 px-1.5 py-0.5 rounded-full uppercase tracking-widest">Local AI</span>
              </div>
              <div className="text-[10px] text-white/60 font-medium truncate">{t("copilot.status")}</div>
            </div>
            <button onClick={()=> setOpen(false)} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs transition-colors shrink-0">✕</button>
          </div>

          {/* Messages */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#f8fafc]" style={{ scrollbarWidth: "thin" }}>
            {msgs.map(m => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                  m.role === "user"
                    ? "bg-gradient-to-br from-[#1a252f] to-[#2c3e50] text-white rounded-br-md"
                    : "bg-white border border-slate-200/80 rounded-bl-md"
                }`}>
                  {m.role === "copilot"
                    ? <div className="space-y-0.5">{render(m.text)}</div>
                    : <div className="whitespace-pre-wrap">{m.text}</div>}
                  {m.suggestions && m.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-slate-100">
                      {m.suggestions.map(s => (
                        <button key={s} onClick={()=> send(s)} className="text-[11px] font-bold text-[#3498db] bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-full px-2.5 py-1 transition-colors active:scale-95">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200/80 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="cp-dot w-2 h-2 bg-[#3498db] rounded-full inline-block" />
                    <span className="cp-dot w-2 h-2 bg-[#3498db] rounded-full inline-block" />
                    <span className="cp-dot w-2 h-2 bg-[#3498db] rounded-full inline-block" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-3 py-3 bg-white border-t border-slate-100 shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e=> setInput(e.target.value)}
                onKeyDown={e=> { if (e.key === "Enter") send(); }}
                placeholder={t("copilot.placeholder")}
                className="flex-1 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#3498db]/30 focus:border-[#3498db]/50 transition-all placeholder:text-slate-300"
              />
              <button onClick={()=> send()} disabled={!input.trim() || busy} className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3498db] to-[#2980b9] text-white flex items-center justify-center shadow-md shadow-blue-500/25 hover:shadow-lg hover:scale-[1.03] active:scale-95 transition-all disabled:opacity-40 disabled:scale-100" aria-label="Send">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              </button>
            </div>
            <div className="text-[10px] text-slate-300 mt-1.5 text-center font-medium">{t("copilot.footer")}</div>
          </div>
        </div>
      )}
    </>
  );
}
