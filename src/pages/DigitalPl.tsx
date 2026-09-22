import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiPut } from "../lib/api";
import { expEarn } from "../lib/exp";
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
  const [revisionNotes, setRevisionNotes] = useState<Record<string, Record<string,string>>>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{type:"ok"|"err",text:string}|null>(null);
  const [noSnap, setNoSnap] = useState("");
  const [dusBesar, setDusBesar] = useState("0");
  const [dusL, setDusL] = useState("0");
  const [dusS, setDusS] = useState("0");
  const [saving, setSaving] = useState(false);
  const [master, setMaster] = useState<any>({ ITEM_UOM: {} });
  const [revise, setRevise] = useState<null | { koli: number; sku: string; qty: number }>(null);
  const [revQty, setRevQty] = useState("");
  const [revNote, setRevNote] = useState("");

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
  useEffect(()=>{ (async()=>{ try{ const md=await apiGet("/api/master_data"); setMaster(md);}catch{} })(); },[]);

  const loadPl = async (deliveryNo: string)=>{
    if(!deliveryNo) return;
    setLoading(true); setNoSnap("");
    try {
      const d = await apiGet(`/api/digital_pl/${encodeURIComponent(deliveryNo)}`);
      setBoxes(Array.isArray(d.boxes)?d.boxes:[]);
      setChecks(Array.isArray(d.checks)?d.checks:[]);
      setRevisionNotes((d.revision_notes||{}) as any);
      setHeader(d.header||null);
      setDusBesar(String(d.dus_besar??0)); setDusL(String(d.dus_l??0)); setDusS(String(d.dus_s??0));
    } catch(e:any){
      setBoxes([]); setChecks([]);
      setRevisionNotes({});
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
    setChecks(prev=> prev.map((c,j)=> j===i ? {checked:next, by: next?email:"", at: next?new Date().toISOString():""} : c));
    try {
      await apiPut(`/api/digital_pl/${encodeURIComponent(dn)}/check`, { koli_index: i, checked: next, by: email });
    } catch(e:any){
      setChecks(prev=> prev.map((c,j)=> j===i ? {checked:!next, by:"", at:""} : c));
      flash("err", e?.message||"Sync failed");
    }
  };

  const openRevise = (koli:number, sku:string, qty:number)=>{
    setRevise({ koli, sku, qty });
    setRevQty(String(qty));
    setRevNote("");
  };
  const submitRevise = async ()=>{
    if(!revise) return;
    const q = parseInt(revQty,10);
    if(isNaN(q) || q<0) return flash("err","Qty must be 0 or more");
    if(!revNote.trim() || revNote.trim().length<5) return flash("err","Note is mandatory (min 5 chars) — explain shortage");
    try{
      await apiPut(`/api/digital_pl/${encodeURIComponent(dn)}/revise`, { koli_index: revise.koli, sku: revise.sku, qty: q, note: revNote.trim(), by: email });
      // optimistic local — mirror server splice logic for empty Koli so Pack button updates live before reload
      const willEmpty = (()=>{
        const b={...boxes[revise.koli]} as any;
        if(q===0) delete b[revise.sku]; else b[revise.sku]=q;
        return Object.keys(b).length===0;
      })();
      if(willEmpty){
        setBoxes(prev=> { const n=[...prev]; n.splice(revise.koli,1); return n; });
        setChecks(prev=> { const n=[...prev]; n.splice(revise.koli,1); return n; });
        setRevisionNotes(prev=>{
          const nxt={} as any;
          for(const k of Object.keys(prev)){
            const ki=parseInt(k,10);
            if(ki===revise.koli) continue;
            const nk = ki>revise.koli ? String(ki-1) : k;
            nxt[nk]=prev[k];
          }
          // keep history note for audit even though koli gone — not needed for display
          return nxt;
        });
      } else {
        setBoxes(prev=> {
          const next=[...prev];
          const box={...next[revise.koli]} as any;
          if(q===0) delete box[revise.sku];
          else box[revise.sku]=q;
          next[revise.koli]=box;
          return next;
        });
        setRevisionNotes(prev=>{
          const next={...prev} as any;
          if(!next[revise.koli]) next[revise.koli]={};
          next[revise.koli][revise.sku]=`${revise.qty}→${q} by ${email}: ${revNote.trim()}`;
          return next;
        });
      }
      flash("ok",`Updated ${revise.sku} ${revise.qty}→${q}`);
      setRevise(null);
      // reload authoritative from server (file + Supabase) — ensures total/done in sync
      await loadPl(dn);
    }catch(e:any){ flash("err", e?.message||"Revise failed"); }
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
      expEarn("pack", dn);
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
              <div className="text-xs text-white/60 mt-1">Pending PL only • check each Koli as packed • server-synced • click SKU to revise for shortage</div>
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
          <div className="bg-white rounded-[20px] border border-slate-200 shadow-[0_16px_40px_rgba(0,0,0,0.18)] overflow-hidden">
            <div className="px-5 md:px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-[#0f1e2e] to-[#1a2f4a] text-white flex items-center justify-between">
              <div className="font-black text-[15px]">Koli Checklist — identical to Exported PL ({done}/{total}) • High-visibility table</div>
              <div className="text-xs bg-white text-[#0f1e2e] px-3 py-1 rounded-full font-black">Click SKU to revise qty + mandatory note for shortage</div>
            </div>
            <div className="overflow-auto max-h-[66vh]">
              <table className="w-full text-sm">
                <thead className="bg-[#0f1e2e] text-white sticky top-0 z-10">
                  <tr className="text-[11px] tracking-widest">
                    <th className="px-3 py-3 text-left w-14">Koli</th>
                    <th className="px-3 py-3 text-left">SKU — click to revise</th>
                    <th className="px-3 py-3 text-center w-20">Qty</th>
                    <th className="px-3 py-3 text-center w-20">UOM</th>
                    <th className="px-3 py-3 text-left">Note / Revision</th>
                    <th className="px-3 py-3 text-center w-20">Pack</th>
                  </tr>
                </thead>
                <tbody>
                  {boxes.map((box,koliIdx)=>{
                    const on = !!checks[koliIdx]?.checked;
                    const entries = Object.entries(box) as [string,number][];
                    return entries.map(([sku,qty], rowIdx)=>(
                      <tr key={`${koliIdx}-${sku}`} className={`${on?"bg-emerald-50/60":"bg-white"} border-t border-slate-100 hover:bg-slate-50`}>
                        {rowIdx===0 && (
                          <td rowSpan={entries.length} className="px-3 py-3 align-middle border-r border-slate-100 bg-slate-50">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${on?"bg-emerald-500 text-white":"bg-white border-2 border-slate-300 text-slate-600"}`}>{on?"✓":koliIdx+1}</span>
                              <span className="text-xs font-black text-[#0f1e2e]">Koli {koliIdx+1}</span>
                            </div>
                          </td>
                        )}
                        <td className="px-3 py-3">
                          <button onClick={()=> openRevise(koliIdx, sku, qty)} className="text-left group">
                            <div className="font-black text-[15px] leading-tight text-[#0f1e2e] group-hover:text-sky-700 group-hover:underline">{sku}</div>
                            {revisionNotes[String(koliIdx)]?.[sku] && <div className="text-[11px] text-amber-700 font-bold bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1 inline-block">{revisionNotes[String(koliIdx)][sku]}</div>}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="font-mono font-black text-[16px] text-[#0f1e2e]">×{qty}</span>
                          <button onClick={()=> openRevise(koliIdx, sku, qty)} className="ml-1 text-[11px] text-sky-600 underline font-bold">edit</button>
                        </td>
                        <td className="px-3 py-3 text-center"><span className="px-2 py-1 rounded bg-slate-100 border border-slate-200 text-xs font-mono font-bold">{master?.ITEM_UOM?.[sku] || "Pack"}</span></td>
                        <td className="px-3 py-3 text-xs text-slate-600"><span onClick={()=> openRevise(koliIdx, sku, qty)} className="cursor-pointer hover:text-slate-900">{revisionNotes[String(koliIdx)]?.[sku] ? "— revised —" : "—"}</span></td>
                        <td className="px-3 py-3 text-center">
                          {rowIdx===0 && <button onClick={()=> toggle(koliIdx)} className={`w-full px-3 py-2 rounded-xl text-xs font-black ${on?"bg-emerald-500 text-white shadow":"bg-white border-2 border-slate-300 text-slate-600 hover:border-slate-400"}`}>{on?"✓ Packed":"Pack"}</button>}
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 md:px-6 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">High-visibility • Koli grouped • SKU 15px black • Qty 16px mono • Tap SKU/edit to revise shortage (note required)</div>

            <div className="mx-5 md:mx-6 my-4 rounded-2xl bg-slate-50 border border-slate-200 p-4">
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

        {/* Revise modal */}
        {revise && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
              <h3 className="font-black text-[#0f1e2e]">Revise {revise.sku} — Koli {revise.koli+1}</h3>
              <p className="text-xs text-slate-500">Current qty <b>{revise.qty}</b> • This is for stock shortage — note is mandatory</p>
              <label className="block mt-3 text-xs font-bold">New Qty (0 removes line)
                <input type="number" min={0} value={revQty} onChange={e=> setRevQty(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 font-mono text-center" />
              </label>
              <label className="block mt-3 text-xs font-bold">Note — mandatory, min 5 chars <span className="text-red-500">*</span>
                <textarea value={revNote} onChange={e=> setRevNote(e.target.value)} rows={3} placeholder="Reason: shortage, substitution, recount…" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
              </label>
              <div className="flex gap-2 mt-4">
                <button onClick={()=> setRevise(null)} className="flex-1 bg-slate-100 border border-slate-200 rounded-xl py-2.5 font-bold">Cancel</button>
                <button onClick={submitRevise} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl py-2.5 font-black">Save Revision</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
