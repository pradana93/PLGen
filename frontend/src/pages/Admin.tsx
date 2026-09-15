import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";

export default function Admin(){
  const [pin, setPin]=useState("");
  const [role, setRole]=useState<string|null>(null);
  const [master, setMaster]=useState<any>(null);
  const [checkers, setCheckers]=useState<string[]>([]);
  const [newChecker,setNewChecker]=useState("");
  const [users,setUsers]=useState<any[]>([]);
  const ROLES:Record<string,{pin:string,tabs:string[]}>={
    Admin:{pin:"123456",tabs:["All"]},
    JendralVittoria:{pin:"654321",tabs:["Master","Checkers"]},
  };
  const login=()=>{
    for(const [r,c] of Object.entries(ROLES)) if(c.pin===pin){ setRole(r); return; }
    alert("❌ Invalid PIN");
  };
  useEffect(()=>{
    if(!role) return;
    apiGet("/api/master_data").then(setMaster).catch(()=>{});
    apiGet("/api/checkers").then(d=> setCheckers(d.checkers||[])).catch(()=>{});
    fetch(`${import.meta.env.VITE_API_URL||"http://localhost:4000"}/list_users?admin_key=majesta93`).then(r=>r.json()).then(setUsers).catch(()=>{});
  },[role]);
  if(!role){
    return (
      <div className="max-w-md mx-auto p-8">
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <h2 className="text-xl font-bold mb-2">🛡️ JESTA COMMAND CENTER</h2>
          <p className="text-sm text-gray-500 mb-4">Select role PIN (Admin 123456 / Manager 654321)</p>
          <input value={pin} onChange={e=> setPin(e.target.value)} placeholder="6-digit PIN" className="w-full border rounded-lg px-3 py-2 text-center text-lg tracking-widest" maxLength={6} type="password" />
          <button onClick={login} className="w-full mt-3 bg-[#2c3e50] text-white rounded-lg py-2 font-bold">🔓 UNLOCK</button>
          <div className="text-xs text-gray-400 mt-3">Production-Live v2.0α • Made by A. Majesta P.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="bg-white rounded-xl shadow p-4 flex items-center justify-between">
        <div>👤 Logged in as: <b>{role}</b> <span className="ml-3 text-xs bg-green-100 text-green-700 px-2 py-1 rounded">v2.0α</span></div>
        <button onClick={()=> setRole(null)} className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm">🚪 Logout</button>
      </div>

      {/* Checkers */}
      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="font-bold mb-2">👥 Checker Management</h3>
        <div className="flex gap-2 mb-3">
          <input value={newChecker} onChange={e=> setNewChecker(e.target.value)} placeholder="New checker name" className="border rounded-lg px-3 py-1 flex-1" />
          <button onClick={async()=>{ if(!newChecker) return; await apiPost("/api/checkers",{admin_key:"majesta93",action:"add",checker_name:newChecker}); const d=await apiGet("/api/checkers"); setCheckers(d.checkers); setNewChecker(""); }} className="px-3 py-1 bg-[#27ae60] text-white rounded">Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {checkers.map(c=> <span key={c} className="px-3 py-1 bg-[#ecf0f1] rounded-full text-sm flex items-center gap-2">{c} <button onClick={async()=>{ await apiPost("/api/checkers",{admin_key:"majesta93",action:"remove",checker_name:c}); const d=await apiGet("/api/checkers"); setCheckers(d.checkers); }} className="text-red-600">×</button></span>)}
        </div>
      </div>

      {/* Master Data */}
      {master && (
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="font-bold mb-2">📦 Master Data (Box Tolerance: {master.BOX_TOLERANCE})</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {Object.entries(master.CATEGORIES||{}).map(([cat, skus]:any)=>(
              <div key={cat} className="border rounded p-2">
                <div className="font-bold">{cat}</div>
                <div className="text-gray-600">{(skus as string[]).slice(0,4).join(", ")}{skus.length>4?"…":""}</div>
                <div className="font-mono">{skus.length} SKUs</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={async()=>{ await fetch(`${import.meta.env.VITE_API_URL||"http://localhost:4000"}/api/master_data`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({admin_key:"majesta93", master_data:master})}); alert("Deployed"); }} className="px-4 py-2 bg-[#3498db] text-white rounded-lg text-sm font-bold">🚀 Deploy to Cloud</button>
            <button onClick={()=> setMaster({...master, BOX_TOLERANCE: Number((master.BOX_TOLERANCE+0.01).toFixed(3))})} className="px-3 py-2 bg-gray-200 rounded text-sm">+0.01 Tolerance</button>
          </div>
        </div>
      )}

      {/* Users */}
      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="font-bold mb-2">🔓 Access Control — Registered Users</h3>
        <table className="w-full text-sm">
          <thead className="bg-[#f4f6f9]"><tr><th className="p-2 text-left">HWID</th><th className="p-2">Alias</th><th className="p-2">Status</th><th className="p-2">Expiry</th></tr></thead>
          <tbody>{users.map((u:any)=> <tr key={u.hwid} className="border-b"><td className="p-2 font-mono text-xs">{u.hwid}</td><td className="p-2">{u.alias}</td><td className="p-2">{u.status}</td><td className="p-2">{u.expiry}</td></tr>)}{users.length===0 && <tr><td colSpan={4} className="text-center p-4 text-gray-400">No users / backend offline</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}
