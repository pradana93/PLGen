import { useEffect, useRef, useState } from "react";
import { apiGet } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n";
import { ask } from "../lib/copilot/entry";
import type { CopilotContext } from "../lib/copilot/types";

type Msg = { id: string; role: "user" | "copilot"; text: string; suggestions?: string[]; time: string };

let msgId = 0;
function id() { return `cp-${++msgId}-${Date.now()}`; }
function now() {
  return new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
}

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

const QUICK_ACTIONS = {
  en: [
    { label: "🌅 Morning Brief", query: "daily summary" },
    { label: "📊 Today's Summary", query: "today's summary" },
    { label: "📈 Weekly Report", query: "weekly report" },
    { label: "⚠️ Any Issues?", query: "any issues" },
    { label: "📦 Check Stock", query: "check stock" },
    { label: "🏅 Leaderboard", query: "team leaderboard" },
  ],
  id: [
    { label: "🌅 Brief Pagi", query: "ringkasan hari ini" },
    { label: "📊 Ringkasan Hari Ini", query: "ringkasan hari ini" },
    { label: "📈 Laporan Mingguan", query: "laporan mingguan" },
    { label: "⚠️ Ada Masalah?", query: "ada masalah" },
    { label: "📦 Cek Stok", query: "cek stok" },
    { label: "🏅 Papan Peringkat", query: "papan peringkat" },
  ],
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

  const showWelcome = () => {
    buildCtx().then(() => {
      setMsgs([{ id: id(), role: "copilot", text: lang === "id" ? WELCOME.id : WELCOME.en, suggestions: lang === "id" ? SUGGEST_MAP.greeting.id : SUGGEST_MAP.greeting.en, time: now() }]);
    });
  };

  const openPanel = () => {
    setOpen(true);
    if (!welcomeDone.current) { welcomeDone.current = true; showWelcome(); }
  };

  const closePanel = () => setOpen(false);

  const clearChat = () => {
    setMsgs([]);
    welcomeDone.current = true;
    showWelcome();
  };

  // Escape closes the panel
  useEffect(()=>{
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") closePanel(); };
    window.addEventListener("keydown", h);
    return ()=> window.removeEventListener("keydown", h);
  }, [open]);

  useEffect(()=>{ if (open) setTimeout(()=> inputRef.current?.focus(), 250); }, [open]);

  useEffect(()=>{
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  const suggestFor = (intentType: string): string[] => {
    const entry = SUGGEST_MAP[intentType] || SUGGEST_MAP.fallback;
    return lang === "id" ? entry.id : entry.en;
  };

  const send = async (raw?: string, display?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setMsgs(m => [...m, { id: id(), role: "user", text: display || text, time: now() }]);
    setBusy(true);
    try {
      const ctx = ctxRef.current && ctxRef.current.lang === lang ? ctxRef.current : await buildCtx();
      const { reply, intentType } = ask(text, ctx);
      setMsgs(m => [...m, { id: id(), role: "copilot", text: reply, suggestions: suggestFor(intentType), time: now() }]);
    } catch (e: any) {
      setMsgs(m => [...m, { id: id(), role: "copilot", text: `⚠️ ${e?.message || "Error"}`, time: now() }]);
    }
    setBusy(false);
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

  const actions = lang === "id" ? QUICK_ACTIONS.id : QUICK_ACTIONS.en;

  return (
    <>
      {/* Floating bubble - close-safe: no overlapping decorations */}
      {!open && (
        <button
          onClick={openPanel}
          className="fixed bottom-5 right-5 z-[80] group flex items-center gap-2.5 bg-gradient-to-br from-[#1a252f] to-[#2c3e50] text-white rounded-full pl-2 pr-3.5 py-2 shadow-[0_10px_40px_rgba(0,0,0,0.3)] hover:shadow-[0_14px_44px_rgba(0,0,0,0.4)] hover:scale-[1.03] transition-all active:scale-95"
          aria-label="Open PLGen Copilot"
        >
          <span className="relative shrink-0">
            <span className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-base shadow-inner border border-white/25">🤖</span>
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#1a252f] animate-pulse" />
          </span>
          <span className="text-left leading-tight pr-1">
            <span className="block text-[12px] font-black tracking-tight">PLGen Copilot</span>
            <span className="block text-[10px] text-white/60 font-semibold">{t("copilot.bubbleSub")}</span>
          </span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-4 right-4 z-[80] w-[420px] max-w-[calc(100vw-1.5rem)] h-[600px] max-h-[calc(100vh-2rem)] bg-white rounded-3xl shadow-[0_24px_80px_rgba(0,0,0,0.35),0_4px_16px_rgba(0,0,0,0.12)] border border-slate-200/70 flex flex-col overflow-hidden" style={{ animation: "cp-panel 0.32s cubic-bezier(0.4,0,0.2,1) both" }}>
          <style>{`
            @keyframes cp-panel { from { opacity: 0; transform: translateY(18px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
            @keyframes cp-msg-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes cp-dot { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.35; } 40% { transform: scale(1); opacity: 1; } }
            @keyframes cp-shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
            .cp-msg { animation: cp-msg-in 0.28s cubic-bezier(0.4,0,0.2,1) both; }
            .cp-dot { animation: cp-dot 1.2s infinite ease-in-out; }
            .cp-dot:nth-child(2) { animation-delay: 0.15s; }
            .cp-dot:nth-child(3) { animation-delay: 0.3s; }
            .cp-shimmer {
              background: linear-gradient(110deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0) 100%);
              background-size: 200% 100%;
              animation: cp-shimmer 4.5s linear infinite;
            }
            .cp-scroll::-webkit-scrollbar { width: 5px; }
            .cp-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; }
            .cp-scroll::-webkit-scrollbar-track { background: transparent; }
            .cp-quick::-webkit-scrollbar { display: none; }
          `}</style>

          {/* Header */}
          <div className="relative shrink-0 bg-gradient-to-br from-[#101c2c] via-[#1a2b3f] to-[#0f1e2e] overflow-hidden select-none">
            {/* Decorative layers — pointer-events-none so they NEVER block buttons */}
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none" />
            <div className="absolute -right-10 -top-14 w-36 h-36 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -left-10 -bottom-16 w-28 h-28 bg-emerald-400/10 rounded-full blur-2xl pointer-events-none" />
            <div className="cp-shimmer absolute inset-0 pointer-events-none" />

            <div className="relative z-10 px-4 pt-3.5 pb-3">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-lg shadow-[0_6px_18px_rgba(59,130,246,0.35)] border border-white/20">🤖</div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-[#101c2c] animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-[15px] tracking-tight">PLGen Copilot</span>
                    <span className="text-[9px] font-black bg-emerald-400/15 text-emerald-300 border border-emerald-300/20 px-1.5 py-0.5 rounded-full uppercase tracking-widest">Local AI</span>
                  </div>
                  <div className="text-[10px] text-white/55 font-medium mt-0.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {t("copilot.status")}
                  </div>
                </div>
                <button onClick={clearChat} title="Clear chat" className="shrink-0 w-8 h-8 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] border border-white/10 flex items-center justify-center text-[13px] transition-colors active:scale-90 cursor-pointer">🧹</button>
                <button onClick={closePanel} title="Close" aria-label="Close copilot" className="shrink-0 w-8 h-8 rounded-xl bg-white/[0.08] hover:bg-red-500/80 hover:border-red-400/40 border border-white/10 flex items-center justify-center text-sm transition-colors active:scale-90 cursor-pointer">✕</button>
              </div>

              {/* Quick actions */}
              <div className="flex gap-1.5 overflow-x-auto pt-3 cp-quick" style={{ scrollbarWidth: "none" }}>
                {actions.map(a => (
                  <button key={a.query} onClick={()=> send(a.query, a.label)} className="shrink-0 text-[11px] font-bold bg-white/[0.08] hover:bg-white/[0.18] border border-white/10 text-white/85 rounded-full px-3 py-1.5 transition-all active:scale-95 cursor-pointer whitespace-nowrap">
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-3.5 py-4 space-y-3 bg-gradient-to-b from-[#f6f8fb] to-white cp-scroll">
            {msgs.map(m => (
              <div key={m.id} className={`cp-msg flex items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "copilot" && (
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-[11px] shadow-sm shrink-0 mb-0.5">🤖</div>
                )}
                <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm ${
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
                        <button key={s} onClick={()=> send(s)} className="text-[11px] font-bold text-[#3498db] bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-full px-2.5 py-1 transition-colors active:scale-95 cursor-pointer">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className={`text-[9px] text-slate-300 mt-1.5 ${m.role === "user" ? "text-white/40 text-right" : ""}`}>{m.time}</div>
                </div>
              </div>
            ))}
            {busy && (
              <div className="cp-msg flex items-end gap-2 justify-start">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-[11px] shadow-sm shrink-0 mb-0.5">🤖</div>
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
          <div className="shrink-0 px-3 pt-2.5 pb-3 bg-white border-t border-slate-100">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e=> setInput(e.target.value)}
                onKeyDown={e=> { if (e.key === "Enter") send(); }}
                placeholder={t("copilot.placeholder")}
                className="flex-1 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#3498db]/25 focus:border-[#3498db]/40 transition-all placeholder:text-slate-300"
              />
              <button onClick={()=> send()} disabled={!input.trim() || busy} className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#3498db] to-[#2980b9] text-white flex items-center justify-center shadow-md shadow-blue-500/25 hover:shadow-lg hover:scale-[1.04] active:scale-95 transition-all disabled:opacity-40 disabled:scale-100 cursor-pointer" aria-label="Send">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              </button>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-[9.5px] text-slate-300 mt-1.5 font-medium">
              <span className="w-1 h-1 rounded-full bg-emerald-400" /> {t("copilot.footer")}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
