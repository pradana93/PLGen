import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n";

export default function FeedbackModal({ open, onClose }: { open: boolean; onClose: ()=>void }){
  const { profile } = useAuth();
  const [category, setCategory]=useState("General");
  const [subject, setSubject]=useState("");
  const [message, setMessage]=useState("");
  const [sending, setSending]=useState(false);
  const [toast, setToast]=useState<string|null>(null);
  const [cooldown, setCooldown]=useState<number>(0);
  const [openedAt, setOpenedAt]=useState<number>(Date.now());

  useEffect(()=>{ if(open) setOpenedAt(Date.now()); },[open]);
  // read server cooldown remaining via localStorage fallback then server will enforce
  useEffect(()=>{
    const last = Number(localStorage.getItem("feedback_last")||0);
    if(last){
      const diff = 300 - Math.floor((Date.now()/1000)-last);
      if(diff>0) setCooldown(diff);
    }
  },[open]);

  useEffect(()=>{
    if(cooldown<=0) return;
    const id=setInterval(()=> setCooldown(c=> Math.max(0, c-1)), 1000);
    return ()=> clearInterval(id);
  },[cooldown]);

  if(!open) return null;

  const onSubmit = async (e: React.FormEvent)=>{
    e.preventDefault();
    if(cooldown>0) return setToast(`Cooldown — wait ${Math.ceil(cooldown/60)} min`);
    if(subject.trim().length<5) return setToast("Subject too short (min 5)");
    if(message.trim().length<20) return setToast("Message too short (min 20)");
    setSending(true);
    try{
      const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");
      const { supabase } = await import("../lib/supabase");
      const { data } = await supabase.auth.getSession() as any;
      const token = data?.session?.access_token;
      const r = await fetch(`${base}/api/feedback`,{
        method:"POST",
        headers:{ "Content-Type":"application/json", ...(token?{Authorization:`Bearer ${token}`}:{}) },
        body: JSON.stringify({ category, subject, message, timeToken: openedAt, website: "" })
      });
      const j = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(j.error||`${r.status}`);
      localStorage.setItem("feedback_last", String(Math.floor(Date.now()/1000)));
      setCooldown(300);
      setToast("✅ Feedback sent — thank you!");
      setSubject(""); setMessage("");
      setTimeout(onClose, 1200);
    }catch(err:any){
      // Ghost anti-cheat: if server says ghost, show fake success to bot
      if(String(err.message||"").includes("ghost")) setToast("✅ Feedback sent — thank you!");
      else setToast(`❌ ${err.message||"Failed"}`);
    }finally{ setSending(false); setTimeout(()=> setToast(null), 4000); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" aria-modal>
      <div className="absolute inset-0 bg-[#0f1e2e]/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-[20px] shadow-[0_16px_48px_rgba(0,0,0,0.22)] w-full max-w-[560px] overflow-hidden border border-slate-200 animate-[lb-fadeUp_0.2s_ease-out]">
        <div className="bg-gradient-to-br from-[#0f1e2e] via-[#1a2f4a] to-[#2c3e50] p-5 text-white relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-white/[0.06] rounded-full blur-2xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-black tracking-[0.18em] text-white/60">FEEDBACK</div>
              <div className="text-lg font-black leading-tight">Send Feedback</div>
              <div className="text-xs text-white/60">Direct to owner • Secure • Anti-cheat protected</div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 border border-white/15 text-white hover:bg-white/15 flex items-center justify-center">✕</button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px]">
            <span className="px-2 py-1 rounded-full bg-white/15 border border-white/15 font-bold">Logged in as {profile?.role || "User"}</span>
            <span className="px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/20 text-emerald-100 font-bold">Secure</span>
          </div>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-3">
          {/* honeypot */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" defaultValue="" />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-slate-600">Category
              <select value={category} onChange={e=> setCategory(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#0f1e2e]/20">
                <option>General</option><option>Bug</option><option>Idea</option><option>Praise</option><option>Other</option>
              </select>
            </label>
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex flex-col justify-center">
              <div className="text-[10px] font-black tracking-widest text-amber-700">COOLDOWN</div>
              <div className="text-sm font-black text-amber-700">{cooldown>0 ? `${Math.floor(cooldown/60)}:${String(cooldown%60).padStart(2,"0")} wait` : "Ready to send"}</div>
            </div>
          </div>
          <label className="text-xs font-bold text-slate-600">Subject
            <input value={subject} onChange={e=> setSubject(e.target.value)} maxLength={120} placeholder="Short title (min 5 chars)" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0f1e2e]/20" />
          </label>
          <label className="text-xs font-bold text-slate-600">Message
            <textarea value={message} onChange={e=> setMessage(e.target.value)} maxLength={2000} rows={5} placeholder="Describe your feedback in detail (min 20 chars)" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0f1e2e]/20 resize-none" />
            <div className="text-[11px] text-slate-400 text-right">{message.length}/2000</div>
          </label>
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50">Cancel</button>
            <button disabled={sending || cooldown>0} type="submit" className={`flex-1 px-4 py-2.5 rounded-xl font-black text-white shadow transition ${sending||cooldown>0?"bg-slate-300 cursor-not-allowed":"bg-[#0f1e2e] hover:bg-black"}`}>{sending?"Sending…": cooldown>0?`Wait ${Math.ceil(cooldown/60)}m`:"Send Feedback →"}</button>
          </div>
          <div className="text-[10px] text-slate-400 text-center">Protected: cooldown & rate limit • spam guard • secure delivery</div>
        </form>
        {toast && <div className="mx-5 mb-4 rounded-xl bg-[#0f1e2e] text-white px-4 py-2 text-sm font-bold text-center">{toast}</div>}
      </div>
    </div>
  );
}
