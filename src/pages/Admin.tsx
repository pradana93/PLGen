import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const ROLES = ["SuperAdmin","Admin","JendralVittoria","InventoryVittoria","TSAVittoria","LogisticVittoria"] as const;

const KNOWN_TERMINALS: Record<string,string> = {
  "Majesta (Lead Developer)": "8DB7CE3731E42814",
  "Zahra Logistic VT": "A958AAA787BF6FF9",
  "Nur Logistic VT": "30EA5F1E9BD8FD68",
};

function OfflinePinWidget(){
  const [hwid, setHwid]=useState("");
  const [res, setRes]=useState<any>(null);
  const [err, setErr]=useState("");
  const gen = async ()=>{
    const id = hwid.trim().toUpperCase();
    if(id.length!==16){ setErr("HWID must be 16 chars"); return; }
    setErr("");
    const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");
    const r = await fetch(`${base}/api/offline_pin?hwid=${id}`);
    const j = await r.json();
    if(!r.ok) setErr(j.error || "Failed");
    else setRes(j);
  };
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input value={hwid} onChange={e=> setHwid(e.target.value)} placeholder="HWID (16 chars)" className="border rounded-lg px-3 py-2 font-mono text-sm tracking-widest" maxLength={16} />
        <select onChange={e=> setHwid(e.target.value)} defaultValue="" className="border rounded-lg px-3 py-2 text-sm">
          <option value="">— pick known terminal —</option>
          {Object.entries(KNOWN_TERMINALS).map(([k,v])=> <option key={k} value={v}>{k} — {v}</option>)}
        </select>
        <button onClick={gen} className="bg-[#f39c12] text-white rounded-lg px-4 py-2 font-bold text-sm">⚙️ Generate PIN</button>
      </div>
      {err && <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</div>}
      {res && (
        <div className="mt-3 bg-[#f4f6f9] rounded-lg p-3 text-center">
          <div className="font-mono text-lg font-extrabold text-[#27ae60]">TODAY: {res.pin_today} <button onClick={()=> navigator.clipboard.writeText(res.pin_today)} className="ml-2 text-xs bg-white border rounded px-2 py-1">Copy</button></div>
          <div className="font-mono text-sm text-gray-500">YESTERDAY: {res.pin_yesterday}</div>
          <div className="text-xs text-gray-400">{res.today} • {res.hwid}</div>
        </div>
      )}
    </div>
  );
}

export default function Admin(){
  const { profile } = useAuth();
  const [master, setMaster]=useState<any>(null);
  const [checkers, setCheckers]=useState<string[]>([]);
  const [newChecker,setNewChecker]=useState("");
  // User Management
  const [users,setUsers]=useState<any[]>([]);
  const [newUser,setNewUser]=useState({ email:"", password:"", role:"LogisticVittoria" as typeof ROLES[number], alias:"" });
  const [editing,setEditing]=useState<Record<string, {role:string, alias:string}>>({});
  // Master Data detailed
  const [masterTab, setMasterTab]=useState<"overview"|"skus"|"kodes"|"outlets"|"holidays">("overview");
  const [skuSearch,setSkuSearch]=useState("");
  const [kodeSearch,setKodeSearch]=useState("");
  const [outletSearch,setOutletSearch]=useState("");

  const isSuperAdmin = profile?.role==="SuperAdmin";
  const isAdmin = profile?.role==="SuperAdmin" || profile?.role==="Admin";

  const authHeader = async ()=>{
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {} as any;
  };

  const fetchUsers = async ()=>{
    if(!isAdmin) return;
    const h = await authHeader();
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000")}/api/users`, { headers: h });
    if(res.ok) setUsers(await res.json());
  };

  useEffect(()=>{
    apiGet("/api/master_data").then(setMaster).catch(()=>{});
    apiGet("/api/checkers").then(d=> setCheckers(d.checkers||[])).catch(()=>{});
    fetchUsers();
  },[profile]);

  const handleAddUser = async ()=>{
    if(!newUser.email || !newUser.password) return alert("Email and password required");
    const h = await authHeader();
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000")}/api/users`, {
      method:"POST", headers: { "Content-Type":"application/json", ...h }, body: JSON.stringify(newUser)
    });
    const j = await res.json();
    if(!res.ok) return alert(`❌ ${j.error}`);
    setNewUser({ email:"", password:"", role:"LogisticVittoria", alias:"" });
    fetchUsers();
  };

  const handleUpdate = async (id:string)=>{
    const e = editing[id];
    if(!e) return;
    const h = await authHeader();
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000")}/api/users/${id}`, {
      method:"PATCH", headers: { "Content-Type":"application/json", ...h }, body: JSON.stringify(e)
    });
    const j = await res.json();
    if(!res.ok) return alert(`❌ ${j.error}`);
    fetchUsers(); setEditing(prev=>{ const n={...prev}; delete n[id]; return n; });
  };

  const handleDelete = async (id:string)=>{
    if(!confirm("Delete this account?")) return;
    const h = await authHeader();
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000")}/api/users/${id}`, { method:"DELETE", headers: h });
    const j = await res.json();
    if(!res.ok) return alert(`❌ ${j.error}`);
    fetchUsers();
  };

  const handleChangePassword = async (id:string, email:string)=>{
    const np = prompt(`New password for ${email} (min 6):`);
    if(!np || np.length<6) return alert("Min 6 characters");
    const h = await authHeader();
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000")}/api/users/${id}`, {
      method:"PATCH", headers: { "Content-Type":"application/json", ...h }, body: JSON.stringify({ password: np })
    });
    const j = await res.json();
    if(!res.ok) return alert(`❌ ${j.error}`);
    alert(`✅ Password updated for ${email}`);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="bg-white rounded-xl shadow p-4 flex items-center justify-between">
        <div>👤 Logged in as: <b>{profile?.email}</b> <span className="ml-2 px-2 py-1 rounded text-xs font-bold bg-[#9b59b6] text-white">{profile?.role}</span> {isSuperAdmin && <span className="ml-2 text-xs bg-yellow-400 text-black px-2 py-1 rounded">SuperAdmin — you can manage all</span>}</div>
        <div className="text-xs text-gray-500">Master Data: PythonAnywhere • Users: Supabase</div>
      </div>

      {/* User Management — Admin only, per user request */}
      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="font-bold mb-1">👥 User Management — Supabase</h3>
        <p className="text-xs text-gray-500 mb-3">Only <b>SuperAdmin</b> ({profile?.role==="SuperAdmin"?"you": "majestap93@gmail.com"}) and <b>Admin</b> can Add/Edit/Remove. Other roles cannot access this panel (route guard). New accounts are created here — no public registration.</p>
        {!isAdmin ? (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">⛔ You need Admin or SuperAdmin role to manage users. Your role: {profile?.role}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
              <input value={newUser.email} onChange={e=> setNewUser({...newUser, email:e.target.value})} placeholder="email@example.com" className="border rounded-lg px-3 py-2 text-sm" />
              <input value={newUser.password} onChange={e=> setNewUser({...newUser, password:e.target.value})} placeholder="password (min 6)" type="password" className="border rounded-lg px-3 py-2 text-sm" />
              <input value={newUser.alias} onChange={e=> setNewUser({...newUser, alias:e.target.value})} placeholder="Alias (optional)" className="border rounded-lg px-3 py-2 text-sm" />
              <select value={newUser.role} onChange={e=> setNewUser({...newUser, role:e.target.value as any})} className="border rounded-lg px-3 py-2 text-sm">
                {ROLES.filter(r=> isSuperAdmin || r!=="SuperAdmin").map(r=> <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={handleAddUser} className="bg-[#27ae60] text-white rounded-lg px-4 py-2 font-bold text-sm">➕ Add Account</button>
            </div>
            <div className="overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-[#f4f6f9]"><tr><th className="p-2 text-left">Email</th><th className="p-2">Alias</th><th className="p-2">Role</th><th className="p-2">Created</th><th className="p-2">Actions</th></tr></thead>
                <tbody>
                  {users.map((u:any)=> (
                    <tr key={u.id} className="border-t">
                      <td className="p-2 font-mono text-xs">{u.email}</td>
                      <td className="p-2">
                        {editing[u.id] ? <input value={editing[u.id].alias} onChange={e=> setEditing({...editing, [u.id]: {...editing[u.id], alias:e.target.value}})} className="border rounded px-2 py-1 text-xs w-24" /> : u.alias}
                      </td>
                      <td className="p-2">
                        {editing[u.id] ? (
                          <select value={editing[u.id].role} onChange={e=> setEditing({...editing, [u.id]: {...editing[u.id], role:e.target.value}})} className="border rounded px-2 py-1 text-xs">
                            {ROLES.filter(r=> isSuperAdmin || r!=="SuperAdmin").map(r=> <option key={r} value={r}>{r}</option>)}
                          </select>
                        ) : <span className={`px-2 py-1 rounded text-xs font-bold ${u.role==="SuperAdmin"?"bg-yellow-400 text-black": u.role==="Admin"?"bg-[#2c3e50] text-white":"bg-gray-200"}`}>{u.role}</span>}
                      </td>
                      <td className="p-2 text-xs text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="p-2 flex gap-1">
                        {editing[u.id] ? (
                          <>
                            <button onClick={()=> handleUpdate(u.id)} className="text-xs bg-[#27ae60] text-white px-2 py-1 rounded">Save</button>
                            <button onClick={()=> setEditing(prev=>{ const n={...prev}; delete n[u.id]; return n; })} className="text-xs bg-gray-200 px-2 py-1 rounded">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={()=> setEditing({...editing, [u.id]: { role: u.role, alias: u.alias || "" }})} className="text-xs bg-[#3498db] text-white px-2 py-1 rounded">Edit</button>
                            <button onClick={()=> handleChangePassword(u.id, u.email)} className="text-xs bg-[#f39c12] text-white px-2 py-1 rounded">🔑 Password</button>
                            <button onClick={()=> handleDelete(u.id)} className="text-xs bg-[#e74c3c] text-white px-2 py-1 rounded" disabled={u.id===profile?.id}>Delete</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {users.length===0 && <tr><td colSpan={5} className="text-center p-4 text-gray-400 text-xs">No users yet — you (majestap93@gmail.com) will be SuperAdmin on first login, then create others here.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-gray-400 mt-2">Role Permissions: SuperAdmin = all + can create SuperAdmin; Admin = manage users (except SuperAdmin), Master/Checkers; other roles are for WebApp tabs (like admin_overhaul.py). No public sign-up — accounts only via this panel.</div>
          </>
        )}
      </div>

      {/* Offline PIN Generator — embedded from Devmode.py (Lead Dev only) */}
      {isSuperAdmin && (
        <div className="bg-white rounded-xl shadow p-4 border-2 border-[#f1c40f]/30">
          <h3 className="font-bold mb-1">🔐 Offline PIN Generator — Lead Dev</h3>
          <p className="text-xs text-gray-500 mb-3">Ported from <code>Devmode.py</code> — SHA256(HWID|YYYYMMDD|JESTA_OFFLINE_VAULT_2026). Verify license in User Management before sharing.</p>
          <OfflinePinWidget />
        </div>
      )}

      {/* Checkers (kept for admin) */}
      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="font-bold mb-2">👥 Checker Management (PythonAnywhere Master)</h3>
        <div className="flex gap-2 mb-3">
          <input value={newChecker} onChange={e=> setNewChecker(e.target.value)} placeholder="New checker name" className="border rounded-lg px-3 py-1 flex-1" />
          <button onClick={async()=>{ if(!newChecker) return; await apiPost("/api/checkers",{admin_key:"majesta93",action:"add",checker_name:newChecker}); const d=await apiGet("/api/checkers"); setCheckers(d.checkers); setNewChecker(""); }} className="px-3 py-1 bg-[#27ae60] text-white rounded">Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {checkers.map(c=> <span key={c} className="px-3 py-1 bg-[#ecf0f1] rounded-full text-sm flex items-center gap-2">{c} <button onClick={async()=>{ await apiPost("/api/checkers",{admin_key:"majesta93",action:"remove",checker_name:c}); const d=await apiGet("/api/checkers"); setCheckers(d.checkers); }} className="text-red-600">×</button></span>)}
        </div>
      </div>

      {/* Master Data — Detailed (PythonAnywhere, 1:1 with admin_overhaul.py) */}
      {master && (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">📦 Master Data — Detailed (PythonAnywhere)</h3>
            <div className="text-xs bg-[#2c3e50] text-white px-3 py-1 rounded-full">BOX_TOLERANCE: <b>{master.BOX_TOLERANCE}</b> • {Object.keys(master.BOX_CAPACITY||{}).length} SKUs • {Object.keys(master.OUTLET_INFO||{}).length} Outlets • {Object.keys(master.KODE_BARANG||{}).length} Kodes</div>
          </div>
          <div className="flex gap-1 mb-3 border-b overflow-x-auto">
            {[
              ["overview","Overview"],
              ["skus","SKU Inventory (123)"],
              ["kodes","KODE_BARANG (109)"],
              ["outlets","OUTLET_INFO (248)"],
              ["holidays","HOLIDAYS"],
            ].map(([id,label])=>(
              <button key={id} onClick={()=> setMasterTab(id as any)} className={`px-3 py-2 text-xs font-bold whitespace-nowrap border-b-2 ${masterTab===id ? "border-[#3498db] text-[#3498db]" : "border-transparent text-gray-500"}`}>{label}</button>
            ))}
          </div>

          {masterTab==="overview" && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(master.CATEGORIES||{}).map(([cat, skus]:any)=>(
                  <div key={cat} className="border rounded-lg p-3 bg-[#f9fafb]">
                    <div className="font-bold text-[#2c3e50]">{cat}</div>
                    <div className="text-[11px] text-gray-500 mt-1">{(skus as string[]).join(" • ")}</div>
                    <div className="font-mono text-xs mt-2">{(skus as string[]).length} SKUs</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="border rounded p-2"><div className="font-bold">BOX_TOLERANCE</div><div className="font-mono text-sm">{master.BOX_TOLERANCE}</div></div>
                <div className="border rounded p-2"><div className="font-bold">Total SKUs</div><div className="font-mono text-sm">{Object.keys(master.BOX_CAPACITY||{}).length}</div></div>
                <div className="border rounded p-2"><div className="font-bold">Total Outlets</div><div className="font-mono text-sm">{Object.keys(master.OUTLET_INFO||{}).length}</div></div>
              </div>
            </div>
          )}

          {masterTab==="skus" && (
            <div>
              <input value={skuSearch} onChange={e=> setSkuSearch(e.target.value)} placeholder="Search SKU, category, UOM..." className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f4f6f9] sticky top-0 z-10"><tr><th className="p-2 text-left">SKU Name</th><th className="p-2">Category</th><th className="p-2">UOM</th><th className="p-2">Box Capacity</th><th className="p-2">Weight (g)</th></tr></thead>
                    <tbody>
                      {(()=>{
                        const cats = master.CATEGORIES || {};
                        const catOf: Record<string,string> = {};
                        for(const [cat, list] of Object.entries(cats as Record<string,string[]>)) for(const sku of list) catOf[sku]=cat;
                        const rows = Object.keys(master.BOX_CAPACITY||{}).filter(sku=> !skuSearch || sku.toLowerCase().includes(skuSearch.toLowerCase()) || (catOf[sku]||"").toLowerCase().includes(skuSearch.toLowerCase())).sort();
                        return rows.map(sku=> (
                          <tr key={sku} className="border-t hover:bg-gray-50">
                            <td className="p-2 font-medium">{sku}</td>
                            <td className="p-2 text-center"><span className="px-2 py-1 rounded bg-[#ecf0f1] text-[11px]">{catOf[sku]||"-"}</span></td>
                            <td className="p-2 text-center">{master.ITEM_UOM?.[sku]||"-"}</td>
                            <td className="p-2 text-center font-mono">{master.BOX_CAPACITY[sku]}</td>
                            <td className="p-2 text-center font-mono">{master.ITEM_WEIGHT_GRAMS?.[sku] ?? 0}</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {masterTab==="kodes" && (
            <div>
              <input value={kodeSearch} onChange={e=> setKodeSearch(e.target.value)} placeholder="Search KODE or SKU..." className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f4f6f9] sticky top-0 z-10"><tr><th className="p-2 text-left">KODE_BARANG</th><th className="p-2 text-left">Maps To SKU</th><th className="p-2">Box Cap</th><th className="p-2">UOM</th></tr></thead>
                    <tbody>
                      {Object.entries(master.KODE_BARANG||{}).filter(([k,v])=> !kodeSearch || k.toLowerCase().includes(kodeSearch.toLowerCase()) || String(v).toLowerCase().includes(kodeSearch.toLowerCase())).sort(([a],[b])=> a.localeCompare(b)).map(([k,v])=> (
                        <tr key={k} className="border-t">
                          <td className="p-2 font-mono font-bold">{k}</td>
                          <td className="p-2">{String(v)}</td>
                          <td className="p-2 text-center font-mono">{master.BOX_CAPACITY[String(v)] ?? "-"}</td>
                          <td className="p-2 text-center">{master.ITEM_UOM[String(v)] ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {masterTab==="outlets" && (
            <div>
              <input value={outletSearch} onChange={e=> setOutletSearch(e.target.value)} placeholder="Search outlet name, address, phone..." className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f4f6f9] sticky top-0 z-10"><tr><th className="p-2 text-left">OUTLET (248)</th><th className="p-2">Receiver</th><th className="p-2">Phone</th><th className="p-2 text-left">Address</th></tr></thead>
                    <tbody>
                      {Object.entries(master.OUTLET_INFO||{}).filter(([k,v]:any)=> !outletSearch || k.toLowerCase().includes(outletSearch.toLowerCase()) || String((v as any).name||"").toLowerCase().includes(outletSearch.toLowerCase()) || String((v as any).address||"").toLowerCase().includes(outletSearch.toLowerCase())).sort(([a],[b])=> a.localeCompare(b)).slice(0,100).map(([k,v]:any)=> (
                        <tr key={k} className="border-t hover:bg-gray-50">
                          <td className="p-2 font-bold">{k}</td>
                          <td className="p-2">{v.name||"-"}</td>
                          <td className="p-2 font-mono">{(v.phone||"").trim()||"-"}</td>
                          <td className="p-2 text-[11px] max-w-[320px] truncate" title={v.address}>{v.address||"-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-[11px] text-gray-400 p-2 border-t">Showing first 100 matches — use search to filter 248 outlets. Full data in PythonAnywhere.</div>
              </div>
            </div>
          )}

          {masterTab==="holidays" && (
            <div className="text-xs">
              <div className="font-bold mb-2">HOLIDAYS (Tanggal Merah) — {master.HOLIDAYS?.length||0} dates</div>
              {master.HOLIDAYS?.length ? (
                <div className="flex flex-wrap gap-2">
                  {master.HOLIDAYS.map((d:string)=> <span key={d} className="px-3 py-1 bg-red-50 border border-red-200 rounded-full text-red-700">{d}</span>)}
                </div>
              ) : <div className="text-gray-400">No holidays configured — delivery date skips Sunday only.</div>}
              <div className="mt-3 text-[11px] text-gray-500">Used by get_delivery_date() to skip Sundays + holidays when calculating Delivery Date.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
