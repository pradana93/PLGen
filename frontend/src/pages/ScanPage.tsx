import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";

export default function ScanPage(){
  const { deliveryNo } = useParams();
  const dn = decodeURIComponent(deliveryNo||"");
  const [status,setStatus]=useState<any>(null);
  const [checkers,setCheckers]=useState<string[]>([]);
  const [sel,setSel]=useState("");
  const [dusL,setDusL]=useState(0); const [dusS,setDusS]=useState(0); const [dusB,setDusB]=useState(0);
  const [msg,setMsg]=useState("");
  useEffect(()=>{
    apiGet(`/api/packing_status`).then((all:any[])=>{
      const f=all.find(a=>a.delivery_no===dn);
      setStatus(f||{ delivery_no:dn, outlet:"Unknown", status:"NOT_FOUND" });
    }).catch(()=> setStatus({ delivery_no:dn, status:"ERROR" }));
    apiGet("/api/checkers").then(d=> setCheckers(d.checkers||[])).catch(()=>{});
  },[dn]);
  const confirm=async()=>{
    if(!sel) return setMsg("❌ Select checker");
    const base=import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");
    const r=await fetch(`${base}/api/scan/${encodeURIComponent(dn)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ checker:sel, dus_l:dusL, dus_s:dusS, dus_besar:dusB })});
    if(r.ok){ setMsg("✅ Verified — READY for dispatch"); setStatus((s:any)=>({ ...s, status:"READY" })); }
    else setMsg("❌ Failed: "+await r.text());
  };
  if(!status) return <div className="p-8 text-center">Loading…</div>;
  if(status.status==="READY"||status.status==="CANCELLED") return (
    <div className="max-w-md mx-auto p-8">
      <div className="bg-white rounded-xl shadow p-6 text-center">
        <div className="text-5xl">⛔</div>
        <h2 className="text-xl font-bold text-red-600 mt-2">SCAN REJECTED</h2>
        <p className="text-sm text-gray-500 mt-2">DO {dn} already {status.status} at {status.scanned_at}</p>
      </div>
    </div>
  );
  return (
    <div className="max-w-md mx-auto p-4">
      <div className="bg-white rounded-xl shadow p-6 text-center">
        <div className="text-5xl">📦</div>
        <h2 className="text-xl font-bold mt-2">VERIFY PACKING</h2>
        <p className="text-sm text-gray-600">Outlet: <b>{status.outlet}</b> • DO: {dn}</p>
        <select value={sel} onChange={e=> setSel(e.target.value)} className="w-full mt-4 border rounded-lg px-3 py-2">
          <option value="">Select Checker…</option>
          {checkers.map(c=> <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div><label className="text-xs">Dus L</label><input type="number" value={dusL} onChange={e=> setDusL(Number(e.target.value))} className="w-full border rounded px-2 py-1" /></div>
          <div><label className="text-xs">Dus S</label><input type="number" value={dusS} onChange={e=> setDusS(Number(e.target.value))} className="w-full border rounded px-2 py-1" /></div>
          <div><label className="text-xs">Dus Besar</label><input type="number" value={dusB} onChange={e=> setDusB(Number(e.target.value))} className="w-full border rounded px-2 py-1" /></div>
        </div>
        <button onClick={confirm} className="w-full mt-4 bg-[#27ae60] text-white rounded-lg py-3 font-bold">🚀 CONFIRM & FINALIZE</button>
        {msg && <div className="mt-3 text-sm font-semibold">{msg}</div>}
      </div>
    </div>
  );
}
