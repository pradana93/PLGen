import { useState } from "react";

export default function Devmode(){
  const [hwid,setHwid]=useState("");
  const [res,setRes]=useState<any>(null);
  const [err,setErr]=useState("");
  const gen=async()=>{
    const id=hwid.trim().toUpperCase();
    if(id.length!==16){ setErr("HWID must be 16 chars"); return; }
    setErr("");
    const base=import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");
    const r=await fetch(`${base}/api/offline_pin?hwid=${id}`);
    if(r.ok) setRes(await r.json());
    else setErr("Failed: "+await r.text());
  };
  return (
    <div className="max-w-xl mx-auto p-6">
      <div className="bg-[#2c3e50] text-white rounded-xl p-6 text-center">
        <div className="text-2xl font-extrabold text-[#f1c40f]">🔐 OFFLINE PIN GENERATOR</div>
        <div className="text-xs opacity-70">PRIVATE LEAD-DEV TOOL — Verify license before sharing</div>
      </div>
      <div className="bg-white rounded-xl shadow p-6 mt-4">
        <label className="text-sm font-bold">Terminal HWID (16 chars)</label>
        <input value={hwid} onChange={e=> setHwid(e.target.value)} placeholder="8DB7CE3731E42814" className="w-full mt-1 border rounded-lg px-3 py-2 font-mono text-center tracking-widest" maxLength={16} />
        <div className="flex gap-2 mt-3">
          <select onChange={e=> setHwid(e.target.value)} className="flex-1 border rounded-lg px-2 py-2 text-sm">
            <option value="">— pick known terminal —</option>
            <option value="8DB7CE3731E42814">Majesta (Lead Developer)</option>
            <option value="A958AAA787BF6FF9">Zahra Logistic VT</option>
            <option value="30EA5F1E9BD8FD68">Nur Logistic VT</option>
          </select>
          <button onClick={gen} className="px-6 bg-[#f39c12] text-white rounded-lg font-bold">⚙️ Generate</button>
        </div>
        {err && <div className="mt-3 text-sm text-red-600 font-semibold">{err}</div>}
        {res && (
          <div className="mt-6 bg-[#f4f6f9] rounded-xl p-4 text-center font-mono">
            <div className="text-3xl font-extrabold text-[#27ae60]">TODAY: {res.pin_today}</div>
            <div className="text-sm text-gray-500">YESTERDAY (grace): {res.pin_yesterday}</div>
            <div className="text-xs text-gray-400 mt-2">{res.today} • {res.hwid}</div>
            <button onClick={()=> navigator.clipboard.writeText(res.pin_today)} className="mt-3 px-4 py-1 bg-[#34495e] text-white rounded-full text-xs">📋 Copy Today&apos;s PIN</button>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-4 text-center">Ported 1:1 from <code>Devmode.py</code> — SHA256(HWID|YYYYMMDD|JESTA_OFFLINE_VAULT_2026)</p>
      </div>
    </div>
  );
}
