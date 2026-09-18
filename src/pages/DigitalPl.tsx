import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiPut } from "../lib/api";
import { useAuth } from "../context/AuthContext";

// Digital PL — separate field-packing flow. Koli list comes from the server snapshot
// saved at export time (POST /api/digital_pl/:dn/snapshot in exportExcel.ts),
// so it is identical to the Exported PL. Core packing math is never touched here.
type KoliBox = Record<string, number>;
type Check = { checked: boolean; by: string; at: string };

export default function DigitalPl(){
  const { profile, user } = useAuth();
  const email = (profile?.email || user?.email || "").toLowerCase();
  const [pending, setPending] = useState<any[]>([]);
  const [dn, setDn] = useState("");
  const [boxes, setBoxes] = useState<KoliBox[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [header, setHeader] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{type:"ok"|"err",text:string}|null>(null);
  const [noSnap, setNoSnap] = useState("");
  const [dusBesar, setDusBesar] = useState("0");
  const [dusL, setDusL] = useState("0");
  const [dusS, setDusS] = useState("0");
  const [saving, setSaving] = useState(false);

  const flash = (type:"ok"|"err", text:string)=>{ setMsg({type,text}); setTimeout(()=> setMsg(null), 3500); };

  const fetchPending = async ()=>{
    try {
      const all = await apiGet("/api/packing_status?status=PENDING").catch(()=>null);
      const list = Array.isArray(all) ? all : await apiGet("/api/packing_status").catch(()=>[]);
      const only = (Array.isArray(list)?list:[]).filter((p:any)=> String(p.status||"").toUpperCase()==="PENDING");
      only.sort((a:any,b:any)=> String(b.created_at||"").localeCompare(String(a.created_at||"")));
      setPending(only);
      if(!dn && only.length) setDn(String(only[0].delivery_no));
    } catch { setPending([]); }
  };
  useEffect(()=>{ fetchPending(); },[]);

  const loadPl = async (deliveryNo: string)=>{
    if(!deliveryNo) return;
    setLoading(true); setNoSnap("");
    try {
      const d = await apiGet(`/api/digital_pl/${encodeURIComponent(deliveryNo)}`);
      setBoxes(Array.isArray(d.boxes)?d.boxes:[]);
      setChecks(Array.isArray(d.checks)?d.checks:[]);
      setHeader(d.header||null);
      setDusBesar(String(d.dus_besar??0)); setDusL(String(d.dus_l??0)); setDusS(String(d.dus_s??0));
    } catch(e:any){
      setBoxes([]); setChecks([]);
      setNoSnap(e?.message || "No Digital PL snapshot — export the PL first");
    }
    setLoading(false);
  };
  useEffect(()=>{ if(dn) loadPl(dn); },[dn]);

  const done = useMemo(()=> checks.filter(c=>c?.checked).length, [checks]);
  const total = boxes.length;
  const allChecked = total>0 && done===total;

  const toggle = async (i:number)=>{
    const next = !checks[i]?.checked;
    // optimistic
    setChecks(prev=> prev.map((c,j)=> j===i ? {checked:next, by: next?email:"", at: next?new Date().toISOString():""} : c));
    try {
      const r = await apiPut(`/api/digital_pl/${encodeURIComponent(dn)}/check`, { koli_index: i, checked: next, by: email });
      if(r?.done!==undefined){ /* server is source of truth on next load */ }
    } catch(e:any){
      // rollback
      setChecks(prev=> prev.map((c,j)=> j===i ? {checked:!next, by:"", at:""} : c));
      flash("err", e?.message||"Sync failed");
    }
  };

  const parseDus = (v:string)=> /^\d+$/.test(v.trim()) ? parseInt(v.trim(),10) : NaN;
  const handleDone = async ()=>{
    const b = parseDus(dusBesar), l = parseDus(dusL), s = parseDus(dusS);
    if([b,l,s].some(Number.isNaN)) return flash("err","Dus Besar / L / S are required (0 or more, whole numbers)");
    if(!allChecked) return flash("err",`Check all ${total} Koli first (${done}/${total} packed)`);
    if(!confirm(`Mark ${dn} as READY on the Live Packing Board?\nDus — Besar: ${b}, L: ${l}, S: ${s}`)) return;
    setSaving(true);
    try {
      await apiPost(`/api/digital_pl/${encodeURIComponent(dn)}/done`, { dus_besar: b, dus_l: l, dus_s: s, by: email });
      flash("ok",`✅ ${dn} marked READY`);
      setDn(""); setBoxes([]); setChecks([]); setHeader(null);
      await fetchPending();
    } catch(e:any){ flash("err", e?.message||"Done failed"); }
    setSaving(false);
  };

  return (
    <div className="min-h-[calc(100vh-56px)] bg-gradient-to-br from-[#0f1e2e] via-[#162a45] to-[#1e3a5f] relative overflow-hidden">
      <div className="absolute -top-24 -right-24 w-[520px] h-[520px] bg-white/[0.06] rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-[640px] h-[640px] bg-sky-400/[0.07] rounded-full blur-[90px] pointer-events-none" />
      <div className="relative max-w-6xl mx-auto p-4 md:p-6 space-y-5">
        <div className="relative rounded-[24px] overflow-hidden border border-white/10 bg-gradient-to-br from-[#0f1e2e] via-[#1a2f4a] to-[#2c3e50] text-white shadow-[0_24px_64px_rgba(0,0,0,0.28)] p-5 md:p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white text-[#0f1e2e] flex items-center justify-center text-xl shadow-lg border border-white/20">📱</div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-[18px] tracking-tight">Digital PL</span>
                <span className="text-[10px] font-bold tracking-widest bg-white text-[#0f1e2e] px-2 py-0.5 rounded-full">FIELD CHECKLIST</span>
              </div>
              <div className="text-xs text-white/60 mt-1">Pending PL only • check each Koli as packed • server-synced</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-[11px] tracking-widest font-semibold text-white/50">PROGRESS</div>
              <div className="font-black text-[18px]">{done}/{total||"—"}</div>
            </div>
          </div>
          {total>0 && (
            <div className="mt-4 h-2.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all" style={{width:`${Math.round(done/total*100)}%`}} />
            </div>
          )}
        </div>

        {msg && <div className={`text-xs font-semibold p-3 rounded-2xl border ${msg.type==="ok"?"bg-emerald-50 text-emerald-700 border-emerald-200":"bg-red-50 text-red-700 border-red-200"}`}>{msg.text}</div>}

        <div className="bg-white/95 backdrop-blur rounded-[20px] border border-white/40 shadow-[0_16px_40px_rgba(0,0,0,0.18)] p-5 md:p-6">
          <label className="text-xs font-extrabold tracking-wide text-slate-700">PACKING LIST (PENDING ONLY)</label>
          <div className="flex gap-2 mt-1">
            <select value={dn} onChange={e=> setDn(e.target.value)} className="flex-1 border border-slate-200 rounded-xl px-3 py-3 text-sm bg-slate-50 font-mono">
              <option value="">— Select PL —</option>
              {pending.map((p:any)=> <option key={p.delivery_no} value={p.delivery_no}>{p.delivery_no} • {p.outlet}</option>)}
            </select>
            <button onClick={()=>{ fetchPending(); if(dn) loadPl(dn); }} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black">↻</button>
          </div>
          {pending.length===0 && <div className="text-xs text-slate-400 mt-2">No PENDING PL — export one from the Dashboard first.</div>}
          {header && <div className="mt-3 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1"><span><b>Outlet:</b> {header.outlet}</span><span><b>Checker:</b> {header.checker}</span><span><b>Status:</b> <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">{header.status}</span></span>{header.total_weight_kg!==undefined && <span><b>Weight:</b> {header.total_weight_kg} kg</span>}</div>}
        </div>

        {loading && <div className="text-center text-white/70 text-sm">Loading Digital PL…</div>}
        {noSnap && dn && !loading && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-2xl p-4">{noSnap}. This PL was exported before Digital PL snapshots — re-export or check Live Board.</div>}

        {boxes.length>0 && (
          <div className="bg-white/95 backdrop-blur rounded-[20px] border border-white/40 shadow-[0_16px_40px_rgba(0,0,0,0.18)] p-5 md:p-6">
            <div className="font-black text-[15px] text-[#0f1e2e] mb-3">Koli Checklist — identical to Exported PL ({done}/{total})</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {boxes.map((box,i)=>{
                const on = !!checks[i]?.checked;
                return (
                  <button key={i} onClick={()=> toggle(i)} className={`text-left rounded-2xl border-2 p-3.5 transition active:scale-[0.99] ${on?"bg-emerald-50 border-emerald-400 shadow-sm":"bg-white border-slate-200 hover:border-slate-300"}`}>
                    <div className="flex items-center gap-2.5">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${on?"bg-emerald-500 text-white":"bg-slate-100 text-slate-400 border border-slate-200"}`}>{on?"✓":i+1}</span>
                      <span className="font-black text-sm text-[#0f1e2e]">Koli {i+1}</span>
                      {on && checks[i]?.by && <span className="ml-auto text-[10px] text-emerald-600 font-bold truncate max-w-[140px]">{checks[i].by}</span>}
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {Object.entries(box).map(([sku,qty])=>(
                        <div key={sku} className="flex justify-between text-xs"><span className="text-slate-600 truncate mr-2">{sku}</span><span className="font-mono font-bold text-slate-800">×{qty}</span></div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 border border-slate-200 p-4">
              <div className="font-black text-sm text-[#0f1e2e]">Dus used <span className="text-red-500">*</span> <span className="font-normal text-slate-400 text-xs">(required — 0 if none)</span></div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[["Dus Besar",dusBesar,setDusBesar],["Dus L",dusL,setDusL],["Dus S",dusS,setDusS]].map(([label,val,set]:any)=>(
                  <div key={label}>
                    <label className="text-[11px] font-bold text-slate-500">{label}</label>
                    <input value={val} onChange={e=> set(e.target.value)} inputMode="numeric" min={0} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono text-center bg-white" placeholder="0" />
                  </div>
                ))}
              </div>
              <button onClick={handleDone} disabled={saving || !allChecked} className="mt-3 w-full bg-[#0f1e2e] hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl py-3.5 font-black text-sm shadow-[0_8px_20px_rgba(15,30,46,0.22)] transition active:scale-[0.99]">
                {saving ? "Marking READY…" : allChecked ? `✅ Done Packed — Mark READY (${done}/${total})` : `Pack all Koli to finish (${done}/${total})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
