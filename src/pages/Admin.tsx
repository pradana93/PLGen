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
  const [draft, setDraft]=useState<any>(null);
  const [hasChanges, setHasChanges]=useState(false);
  const [saveStatus, setSaveStatus]=useState<"idle"|"saving"|"success"|"error">("idle");
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
  // SKU editor
  const [editSku,setEditSku]=useState<string|null>(null);
  const [editSkuFields,setEditSkuFields]=useState<{category:string,uom:string,boxCap:string,weight:string}>({category:"",uom:"",boxCap:"",weight:""});
  const [showAddSku,setShowAddSku]=useState(false);
  const [addSkuFields,setAddSkuFields]=useState<{name:string,category:string,uom:string,boxCap:string,weight:string}>({name:"",category:"FROZEN_ITEMS",uom:"Pack",boxCap:"",weight:""});
  // KODE editor
  const [editKode,setEditKode]=useState<string|null>(null);
  const [editKodeFields,setEditKodeFields]=useState<{code:string,sku:string}>({code:"",sku:""});
  const [showAddKode,setShowAddKode]=useState(false);
  const [addKodeFields,setAddKodeFields]=useState<{code:string,sku:string}>({code:"",sku:""});
  // OUTLET editor
  const [editOutlet,setEditOutlet]=useState<string|null>(null);
  const [editOutletFields,setEditOutletFields]=useState<{name:string,phone:string,address:string}>({name:"",phone:"",address:""});
  const [showAddOutlet,setShowAddOutlet]=useState(false);
  const [addOutletFields,setAddOutletFields]=useState<{name:string,receiver:string,phone:string,address:string}>({name:"",receiver:"",phone:"",address:""});
  const [msg,setMsg]=useState<{type:"ok"|"err",text:string}|null>(null);

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
    apiGet("/api/master_data").then(md=>{ setMaster(md); setDraft(JSON.parse(JSON.stringify(md))); }).catch(()=>{});
    apiGet("/api/checkers").then(d=> setCheckers(d.checkers||[])).catch(()=>{});
    fetchUsers();
  },[profile]);

  const flash = (type:"ok"|"err", text:string)=>{ setMsg({type,text}); setTimeout(()=> setMsg(null), 3500); };

  // ---- Master Data editing helpers ----
  const patchDraft = (fn:(d:any)=>void)=>{
    setDraft((prev:any)=>{
      if(!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      fn(next);
      return next;
    });
    setHasChanges(true);
  };

  const saveMaster = async ()=>{
    if(!draft) return;
    setSaveStatus("saving");
    try {
      const h = await authHeader();
      const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");
      const r = await fetch(`${base}/api/master_data`, {
        method:"POST",
        headers: { "Content-Type":"application/json", ...h },
        body: JSON.stringify({ master_data: draft })
      });
      if(!r.ok) throw new Error(await r.text());
      setMaster(JSON.parse(JSON.stringify(draft)));
      setHasChanges(false);
      setSaveStatus("success");
      flash("ok", "✅ Master Data saved — synced to PythonAnywhere + Supabase");
      setTimeout(()=> setSaveStatus("idle"), 2500);
    } catch(e:any){
      setSaveStatus("error");
      flash("err", `❌ Save failed: ${e?.message||"Unknown error"}`);
      setTimeout(()=> setSaveStatus("idle"), 4000);
    }
  };

  const discardChanges = ()=>{
    if(!master) return;
    if(!confirm("Discard all unsaved Master Data changes?")) return;
    setDraft(JSON.parse(JSON.stringify(master)));
    setHasChanges(false);
    setEditSku(null); setEditKode(null); setEditOutlet(null);
    setShowAddSku(false); setShowAddKode(false); setShowAddOutlet(false);
    flash("ok", "🔄 Changes discarded");
  };

  // ---- SKU Inventory ----
  const startEditSku = (sku:string, category:string)=>{
    setEditSku(sku);
    setEditSkuFields({
      category,
      uom: draft.ITEM_UOM?.[sku] || "Pack",
      boxCap: String(draft.BOX_CAPACITY?.[sku] ?? ""),
      weight: String(draft.ITEM_WEIGHT_GRAMS?.[sku] ?? "")
    });
  };
  const confirmEditSku = ()=>{
    if(!draft || !editSku) return;
    const sku = editSku;
    const cap = parseInt(editSkuFields.boxCap,10);
    const w = parseInt(editSkuFields.weight,10);
    if(!cap || cap<=0) return flash("err","❌ Box Capacity must be a positive number");
    patchDraft(d=>{
      d.BOX_CAPACITY = d.BOX_CAPACITY || {};
      d.ITEM_UOM = d.ITEM_UOM || {};
      d.ITEM_WEIGHT_GRAMS = d.ITEM_WEIGHT_GRAMS || {};
      d.BOX_CAPACITY[sku] = cap;
      d.ITEM_UOM[sku] = editSkuFields.uom || "Pack";
      d.ITEM_WEIGHT_GRAMS[sku] = isNaN(w) ? 0 : w;
      // Move SKU between categories if changed
      const cats = d.CATEGORIES || {};
      for(const [cat, list] of Object.entries(cats)){
        const arr = list as string[];
        if(arr.includes(sku) && cat !== editSkuFields.category) cats[cat] = arr.filter((x:string)=> x!==sku);
      }
      if(!(cats[editSkuFields.category] as string[]|undefined)?.includes(sku)){
        cats[editSkuFields.category] = [...(cats[editSkuFields.category] as string[]||[]), sku];
      }
    });
    setEditSku(null);
    flash("ok", `✅ Updated ${sku}`);
  };
  const deleteSku = (sku:string)=>{
    if(!confirm(`Delete SKU "${sku}"? This removes it from BOX_CAPACITY, UOM, Weight & all categories.`)) return;
    patchDraft(d=>{
      if(d.BOX_CAPACITY) delete d.BOX_CAPACITY[sku];
      if(d.ITEM_UOM) delete d.ITEM_UOM[sku];
      if(d.ITEM_WEIGHT_GRAMS) delete d.ITEM_WEIGHT_GRAMS[sku];
      const cats = d.CATEGORIES || {};
      for(const [cat, list] of Object.entries(cats)){
        cats[cat] = (list as string[]).filter((x:string)=> x!==sku);
      }
    });
    flash("ok", `🗑️ Deleted ${sku}`);
  };
  const confirmAddSku = ()=>{
    if(!draft) return;
    const name = addSkuFields.name.trim();
    const cap = parseInt(addSkuFields.boxCap,10);
    if(!name) return flash("err","❌ SKU Name required");
    if(draft.BOX_CAPACITY?.[name]) return flash("err",`❌ SKU "${name}" already exists`);
    if(!cap || cap<=0) return flash("err","❌ Box Capacity must be a positive number");
    patchDraft(d=>{
      d.BOX_CAPACITY = d.BOX_CAPACITY || {};
      d.ITEM_UOM = d.ITEM_UOM || {};
      d.ITEM_WEIGHT_GRAMS = d.ITEM_WEIGHT_GRAMS || {};
      d.CATEGORIES = d.CATEGORIES || {};
      d.BOX_CAPACITY[name] = cap;
      d.ITEM_UOM[name] = addSkuFields.uom || "Pack";
      d.ITEM_WEIGHT_GRAMS[name] = parseInt(addSkuFields.weight,10)||0;
      if(!d.CATEGORIES[addSkuFields.category]) d.CATEGORIES[addSkuFields.category] = [];
      d.CATEGORIES[addSkuFields.category].push(name);
    });
    setShowAddSku(false);
    setAddSkuFields({name:"",category:"FROZEN_ITEMS",uom:"Pack",boxCap:"",weight:""});
    flash("ok", `✅ Added SKU "${name}"`);
  };

  // ---- KODE BARANG ----
  const startEditKode = (code:string, sku:string)=>{
    setEditKode(code);
    setEditKodeFields({ code, sku: String(sku) });
  };
  const confirmEditKode = ()=>{
    if(!draft || !editKode) return;
    const newCode = editKodeFields.code.trim().toUpperCase();
    const targetSku = editKodeFields.sku;
    if(!newCode || !targetSku) return flash("err","❌ KODE and target SKU required");
    if(newCode !== editKode && draft.KODE_BARANG?.[newCode]) return flash("err",`❌ KODE "${newCode}" already exists`);
    patchDraft(d=>{
      d.KODE_BARANG = d.KODE_BARANG || {};
      if(newCode !== editKode) delete d.KODE_BARANG[editKode];
      d.KODE_BARANG[newCode] = targetSku;
    });
    setEditKode(null);
    flash("ok", `✅ KODE ${editKode} → ${newCode} mapped to ${targetSku}`);
  };
  const deleteKode = (code:string)=>{
    if(!confirm(`Delete KODE "${code}"?`)) return;
    patchDraft(d=>{ if(d.KODE_BARANG) delete d.KODE_BARANG[code]; });
    flash("ok", `🗑️ Deleted KODE ${code}`);
  };
  const confirmAddKode = ()=>{
    if(!draft) return;
    const code = addKodeFields.code.trim().toUpperCase();
    const sku = addKodeFields.sku;
    if(!code || !sku) return flash("err","❌ KODE and target SKU required");
    if(draft.KODE_BARANG?.[code]) return flash("err",`❌ KODE "${code}" already exists`);
    patchDraft(d=>{
      d.KODE_BARANG = d.KODE_BARANG || {};
      d.KODE_BARANG[code] = sku;
    });
    setShowAddKode(false);
    setAddKodeFields({code:"",sku:""});
    flash("ok", `✅ Added KODE ${code} → ${sku}`);
  };

  // ---- OUTLET INFO ----
  const startEditOutlet = (name:string, data:any)=>{
    setEditOutlet(name);
    setEditOutletFields({ name: data?.name||"", phone: data?.phone||"", address: data?.address||"" });
  };
  const confirmEditOutlet = ()=>{
    if(!draft || !editOutlet) return;
    const data = draft.OUTLET_INFO?.[editOutlet];
    patchDraft(d=>{
      d.OUTLET_INFO = d.OUTLET_INFO || {};
      d.OUTLET_INFO[editOutlet] = {
        ...(data||{}),
        name: editOutletFields.name || editOutlet,
        phone: editOutletFields.phone,
        address: editOutletFields.address,
      };
    });
    setEditOutlet(null);
    flash("ok", `✅ Updated OUTLET ${editOutlet}`);
  };
  const deleteOutlet = (name:string)=>{
    if(!confirm(`Delete OUTLET "${name}"?`)) return;
    patchDraft(d=>{ if(d.OUTLET_INFO) delete d.OUTLET_INFO[name]; });
    flash("ok", `🗑️ Deleted OUTLET ${name}`);
  };
  const confirmAddOutlet = ()=>{
    if(!draft) return;
    const name = addOutletFields.name.trim().toUpperCase();
    if(!name) return flash("err","❌ Outlet name required");
    if(draft.OUTLET_INFO?.[name]) return flash("err",`❌ Outlet "${name}" already exists`);
    patchDraft(d=>{
      d.OUTLET_INFO = d.OUTLET_INFO || {};
      d.OUTLET_INFO[name] = { name: addOutletFields.receiver || name, phone: addOutletFields.phone, address: addOutletFields.address };
    });
    setShowAddOutlet(false);
    setAddOutletFields({name:"",receiver:"",phone:"",address:""});
    flash("ok", `✅ Added OUTLET ${name}`);
  };

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

  const view = draft || master;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="bg-white rounded-xl shadow p-4 flex items-center justify-between">
        <div>👤 Logged in as: <b>{profile?.email}</b> <span className="ml-2 px-2 py-1 rounded text-xs font-bold bg-[#9b59b6] text-white">{profile?.role}</span> {isSuperAdmin && <span className="ml-2 text-xs bg-yellow-400 text-black px-2 py-1 rounded">SuperAdmin — you can manage all</span>}</div>
        <div className="text-xs text-gray-500">Master Data: PythonAnywhere • Users: Supabase</div>
      </div>

      {/* User Management — Admin only */}
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
                <thead className="bg-[#f4f6f9]"><tr><th className="p-2 text-left">Email</th><th className="p-2">Alias</th><th className="p-2">Role</th><th className="p-2">Actions</th></tr></thead>
                <tbody>
                  {users.map(u=>(
                    <tr key={u.id} className="border-t">
                      <td className="p-2">{u.email}</td>
                      <td className="p-2 text-center">{u.alias||"-"}</td>
                      <td className="p-2 text-center">
                        {editing[u.id] ? (
                          <select value={editing[u.id].role} onChange={e=> setEditing({...editing,[u.id]:{...editing[u.id],role:e.target.value}})} className="border rounded px-1 py-0.5 text-xs">
                            {ROLES.filter(r=> isSuperAdmin || r!=="SuperAdmin").map(r=> <option key={r} value={r}>{r}</option>)}
                          </select>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${u.role==="SuperAdmin"?"bg-yellow-400 text-black":u.role==="Admin"?"bg-[#3498db] text-white":"bg-[#ecf0f1] text-gray-700"}`}>{u.role}</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {editing[u.id] ? (
                          <>
                            <input value={editing[u.id].alias} onChange={e=> setEditing({...editing,[u.id]:{...editing[u.id],alias:e.target.value}})} placeholder="Alias" className="border rounded px-1 py-0.5 text-xs w-24 mr-1" />
                            <button onClick={()=> handleUpdate(u.id)} className="text-xs bg-[#27ae60] text-white px-2 py-1 rounded">💰 Save</button>
                            <button onClick={()=> setEditing(prev=>{const n={...prev}; delete n[u.id]; return n;})} className="text-xs bg-gray-300 px-2 py-1 rounded ml-1">Cancel</button>
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
                  {users.length===0 && <tr><td colSpan={4} className="text-center p-4 text-gray-400 text-xs">No users yet — you (majestap93@gmail.com) will be SuperAdmin on first login, then create others here.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-gray-400 mt-2">Role Permissions: SuperAdmin = all + can create SuperAdmin; Admin = manage users (except SuperAdmin), Master/Checkers; other roles are for WebApp tabs. No public sign-up — accounts only via this panel.</div>
          </>
        )}
      </div>

      {/* Offline PIN Generator — Lead Dev only */}
      {isSuperAdmin && (
        <div className="bg-white rounded-xl shadow p-4 border-2 border-[#f1c40f]/30">
          <h3 className="font-bold mb-1">🔐 Offline PIN Generator — Lead Dev</h3>
          <p className="text-xs text-gray-500 mb-3">Ported from <code>Devmode.py</code> — SHA256(HWID|YYYYMMDD|JESTA_OFFLINE_VAULT_2026). Verify license in User Management before sharing.</p>
          <OfflinePinWidget />
        </div>
      )}

      {/* Checkers */}
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

      {/* Master Data — Detailed (PythonAnywhere, with Editor) */}
      {view && (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">📦 Master Data — PythonAnywhere (Editor)</h3>
            <div className="text-xs bg-[#2c3e50] text-white px-3 py-1 rounded-full">BOX_TOLERANCE: <b>{view.BOX_TOLERANCE}</b> • {Object.keys(view.BOX_CAPACITY||{}).length} SKUs • {Object.keys(view.OUTLET_INFO||{}).length} Outlets • {Object.keys(view.KODE_BARANG||{}).length} Kodes</div>
          </div>

          {/* Save bar */}
          <div className={`flex items-center gap-2 p-3 rounded-lg mb-3 border ${hasChanges ? "bg-amber-50 border-amber-300" : "bg-[#f4f6f9] border-gray-200"}`}>
            <div className={`text-sm font-bold flex-1 ${hasChanges ? "text-amber-700" : "text-gray-500"}`}>
              {hasChanges ? "⚠️ You have unsaved Master Data changes" : "All changes are saved"}
            </div>
            {hasChanges && (
              <>
                <button onClick={discardChanges} className="px-3 py-1 rounded text-xs font-bold bg-white border border-gray-300 text-gray-600">↩️ Discard</button>
                <button onClick={saveMaster} disabled={saveStatus==="saving"} className="px-4 py-1.5 rounded text-xs font-bold bg-[#27ae60] text-white disabled:opacity-50">
                  {saveStatus==="saving" ? "💾 Saving..." : saveStatus==="success" ? "✅ Saved" : saveStatus==="error" ? "❌ Retry" : "💾 Save All Changes"}
                </button>
              </>
            )}
          </div>

          {msg && <div className={`mb-3 text-xs font-semibold p-2 rounded ${msg.type==="ok"?"bg-green-50 text-green-700 border border-green-200":"bg-red-50 text-red-700 border border-red-200"}`}>{msg.text}</div>}

          <div className="flex gap-1 mb-3 border-b overflow-x-auto">
            {[
              ["overview","Overview"],
              ["skus","SKU Inventory"],
              ["kodes","KODE_BARANG"],
              ["outlets","OUTLET_INFO"],
              ["holidays","HOLIDAYS"],
            ].map(([id,label])=>(
              <button key={id} onClick={()=> setMasterTab(id as any)} className={`px-3 py-2 text-xs font-bold whitespace-nowrap border-b-2 ${masterTab===id ? "border-[#3498db] text-[#3498db]" : "border-transparent text-gray-500"}`}>{label}</button>
            ))}
          </div>

          {masterTab==="overview" && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(view.CATEGORIES||{}).map(([cat, skus]:any)=>(
                  <div key={cat} className="border rounded-lg p-3 bg-[#f9fafb]">
                    <div className="font-bold text-[#2c3e50]">{cat}</div>
                    <div className="text-[11px] text-gray-500 mt-1">{(skus||[]).join(" • ")}</div>
                    <div className="font-mono text-xs mt-2">{(skus||[]).length} SKUs</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="border rounded-lg p-3 bg-[#f9fafb]">
                  <div className="font-bold">BOX_TOLERANCE</div>
                  <div className="font-mono mt-1">{view.BOX_TOLERANCE}</div>
                </div>
                <div className="border rounded-lg p-3 bg-[#f9fafb]">
                  <div className="font-bold">BOX_CAPACITY</div>
                  <div className="font-mono mt-1">{Object.keys(view.BOX_CAPACITY||{}).length} SKUs</div>
                </div>
                <div className="border rounded-lg p-3 bg-[#f9fafb]">
                  <div className="font-bold">OUTLET_INFO</div>
                  <div className="font-mono mt-1">{Object.keys(view.OUTLET_INFO||{}).length} Outlets</div>
                </div>
              </div>
              <div className="text-[11px] text-gray-500">💡 Use the tabs above to edit SKU Inventory, KODE_BARANG, OUTLET_INFO, or HOLIDAYS. All changes sync to PythonAnywhere + Supabase.</div>
            </div>
          )}

          {/* SKU INVENTORY — editable */}
          {masterTab==="skus" && (
            <div>
              <div className="flex gap-2 mb-3 items-center">
                <input value={skuSearch} onChange={e=> setSkuSearch(e.target.value)} placeholder="Search SKU, UOM, category..." className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                <button onClick={()=> setShowAddSku(!showAddSku)} className={`px-3 py-2 rounded-lg text-sm font-bold ${showAddSku?"bg-gray-300 text-gray-700":"bg-[#27ae60] text-white"}`}>{showAddSku?"✖ Close":"➕ Add SKU"}</button>
              </div>
              {showAddSku && (
                <div className="border-2 border-dashed border-[#27ae60] rounded-lg p-3 mb-3 bg-green-50/50">
                  <div className="font-bold text-sm mb-2">➕ ADD NEW SKU</div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <input value={addSkuFields.name} onChange={e=> setAddSkuFields({...addSkuFields,name:e.target.value})} placeholder="SKU Name" className="border rounded px-2 py-1 text-xs" />
                    <select value={addSkuFields.category} onChange={e=> setAddSkuFields({...addSkuFields,category:e.target.value})} className="border rounded px-2 py-1 text-xs">
                      {Object.keys(view.CATEGORIES||{}).map(c=> <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input value={addSkuFields.uom} onChange={e=> setAddSkuFields({...addSkuFields,uom:e.target.value})} placeholder="UOM (e.g. Pack)" className="border rounded px-2 py-1 text-xs" />
                    <input value={addSkuFields.boxCap} onChange={e=> setAddSkuFields({...addSkuFields,boxCap:e.target.value})} placeholder="Box Capacity" type="number" className="border rounded px-2 py-1 text-xs" />
                    <input value={addSkuFields.weight} onChange={e=> setAddSkuFields({...addSkuFields,weight:e.target.value})} placeholder="Weight (g)" type="number" className="border rounded px-2 py-1 text-xs" />
                  </div>
                  <button onClick={confirmAddSku} className="mt-2 w-full bg-[#27ae60] text-white rounded py-2 text-sm font-bold">✅ Create SKU</button>
                </div>
              )}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f4f6f9] sticky top-0 z-10"><tr><th className="p-2 text-left">SKU Name</th><th className="p-2">Category</th><th className="p-2">UOM</th><th className="p-2">Box Cap</th><th className="p-2">Weight (g)</th><th className="p-2">Actions</th></tr></thead>
                    <tbody>
                      {(() => {
                        const catOf: Record<string,string> = {};
                        for(const [cat, list] of Object.entries(view.CATEGORIES||{})) for(const s of (list as string[])) catOf[s]=cat;
                        return Object.keys(view.BOX_CAPACITY||{}).filter(sku=> !skuSearch || sku.toLowerCase().includes(skuSearch.toLowerCase()) || String(view.ITEM_UOM?.[sku]||"").toLowerCase().includes(skuSearch.toLowerCase()) || (catOf[sku]||"").toLowerCase().includes(skuSearch.toLowerCase())).sort().map(sku=> {
                          if(editSku===sku) return (
                            <tr key={sku} className="border-t bg-amber-50">
                              <td className="p-2 font-medium">{sku}</td>
                              <td className="p-2">
                                <select value={editSkuFields.category} onChange={e=> setEditSkuFields({...editSkuFields,category:e.target.value})} className="border rounded px-1 py-0.5 text-[11px] w-full">
                                  {Object.keys(view.CATEGORIES||{}).map(c=> <option key={c} value={c}>{c}</option>)}
                                </select>
                              </td>
                              <td className="p-2"><input value={editSkuFields.uom} onChange={e=> setEditSkuFields({...editSkuFields,uom:e.target.value})} className="border rounded px-1 py-0.5 text-[11px] w-20" /></td>
                              <td className="p-2"><input value={editSkuFields.boxCap} onChange={e=> setEditSkuFields({...editSkuFields,boxCap:e.target.value})} type="number" className="border rounded px-1 py-0.5 text-[11px] w-16 text-center" /></td>
                              <td className="p-2"><input value={editSkuFields.weight} onChange={e=> setEditSkuFields({...editSkuFields,weight:e.target.value})} type="number" className="border rounded px-1 py-0.5 text-[11px] w-16 text-center" /></td>
                              <td className="p-2 text-center whitespace-nowrap">
                                <button onClick={confirmEditSku} className="text-[11px] bg-green-600 text-white px-2 py-1 rounded">✔ Save</button>
                                <button onClick={()=> setEditSku(null)} className="text-[11px] bg-gray-300 px-2 py-1 rounded ml-1">✖</button>
                              </td>
                            </tr>
                          );
                          return (
                            <tr key={sku} className="border-t hover:bg-gray-50">
                              <td className="p-2 font-medium">{sku}</td>
                              <td className="p-2 text-center"><span className="px-2 py-1 rounded bg-[#ecf0f1] text-[11px]">{catOf[sku]||"-"}</span></td>
                              <td className="p-2 text-center">{view.ITEM_UOM?.[sku]||"-"}</td>
                              <td className="p-2 text-center font-mono">{view.BOX_CAPACITY[sku]}</td>
                              <td className="p-2 text-center font-mono">{view.ITEM_WEIGHT_GRAMS?.[sku] ?? 0}</td>
                              <td className="p-2 text-center whitespace-nowrap">
                                <button onClick={()=> startEditSku(sku, catOf[sku]||"FROZEN_ITEMS")} className="text-[11px] bg-[#3498db] text-white px-2 py-1 rounded">✏️ Edit</button>
                                <button onClick={()=> deleteSku(sku)} className="text-[11px] bg-[#e74c3c] text-white px-2 py-1 rounded ml-1">🗑️</button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* KODE BARANG — editable */}
          {masterTab==="kodes" && (
            <div>
              <div className="flex gap-2 mb-3 items-center">
                <input value={kodeSearch} onChange={e=> setKodeSearch(e.target.value)} placeholder="Search KODE or SKU..." className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                <button onClick={()=> setShowAddKode(!showAddKode)} className={`px-3 py-2 rounded-lg text-sm font-bold ${showAddKode?"bg-gray-300 text-gray-700":"bg-[#27ae60] text-white"}`}>{showAddKode?"✖ Close":"➕ Add KODE"}</button>
              </div>
              {showAddKode && (
                <div className="border-2 border-dashed border-[#27ae60] rounded-lg p-3 mb-3 bg-green-50/50">
                  <div className="font-bold text-sm mb-2">➕ ADD NEW KODE_BARANG</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={addKodeFields.code} onChange={e=> setAddKodeFields({...addKodeFields,code:e.target.value})} placeholder="KODE (e.g. BP001)" className="border rounded px-2 py-1 text-xs font-mono" />
                    <select value={addKodeFields.sku} onChange={e=> setAddKodeFields({...addKodeFields,sku:e.target.value})} className="border rounded px-2 py-1 text-xs">
                      <option value="">— select target SKU —</option>
                      {Object.keys(view.BOX_CAPACITY||{}).sort().map(s=> <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <button onClick={confirmAddKode} className="mt-2 w-full bg-[#27ae60] text-white rounded py-2 text-sm font-bold">✅ Create KODE</button>
                </div>
              )}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f4f6f9] sticky top-0 z-10"><tr><th className="p-2 text-left">KODE_BARANG</th><th className="p-2 text-left">Maps To SKU</th><th className="p-2">Box Cap</th><th className="p-2">UOM</th><th className="p-2">Actions</th></tr></thead>
                    <tbody>
                      {Object.entries(view.KODE_BARANG||{}).filter(([k,v])=> !kodeSearch || k.toLowerCase().includes(kodeSearch.toLowerCase()) || String(v).toLowerCase().includes(kodeSearch.toLowerCase())).sort(([a],[b])=> a.localeCompare(b)).map(([k,v])=> (
                        editKode===k ? (
                          <tr key={k} className="border-t bg-amber-50">
                            <td className="p-2"><input value={editKodeFields.code} onChange={e=> setEditKodeFields({...editKodeFields,code:e.target.value})} className="border rounded px-1 py-0.5 text-[11px] font-mono w-28" /></td>
                            <td className="p-2">
                              <select value={editKodeFields.sku} onChange={e=> setEditKodeFields({...editKodeFields,sku:e.target.value})} className="border rounded px-1 py-0.5 text-[11px] w-full max-w-[220px]">
                                {Object.keys(view.BOX_CAPACITY||{}).sort().map(s=> <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                            <td className="p-2 text-center font-mono">{view.BOX_CAPACITY[editKodeFields.sku] ?? "-"}</td>
                            <td className="p-2 text-center">{view.ITEM_UOM[editKodeFields.sku] ?? "-"}</td>
                            <td className="p-2 text-center whitespace-nowrap">
                              <button onClick={confirmEditKode} className="text-[11px] bg-green-600 text-white px-2 py-1 rounded">✔ Save</button>
                              <button onClick={()=> setEditKode(null)} className="text-[11px] bg-gray-300 px-2 py-1 rounded ml-1">✖</button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={k} className="border-t hover:bg-gray-50">
                            <td className="p-2 font-mono font-bold">{k}</td>
                            <td className="p-2">{String(v)}</td>
                            <td className="p-2 text-center font-mono">{view.BOX_CAPACITY[String(v)] ?? "-"}</td>
                            <td className="p-2 text-center">{view.ITEM_UOM[String(v)] ?? "-"}</td>
                            <td className="p-2 text-center whitespace-nowrap">
                              <button onClick={()=> startEditKode(k, String(v))} className="text-[11px] bg-[#3498db] text-white px-2 py-1 rounded">✏️ Edit</button>
                              <button onClick={()=> deleteKode(k)} className="text-[11px] bg-[#e74c3c] text-white px-2 py-1 rounded ml-1">🗑️</button>
                            </td>
                          </tr>
                        )
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* OUTLET INFO — editable */}
          {masterTab==="outlets" && (
            <div>
              <div className="flex gap-2 mb-3 items-center">
                <input value={outletSearch} onChange={e=> setOutletSearch(e.target.value)} placeholder="Search outlet name, address, phone..." className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                <button onClick={()=> setShowAddOutlet(!showAddOutlet)} className={`px-3 py-2 rounded-lg text-sm font-bold ${showAddOutlet?"bg-gray-300 text-gray-700":"bg-[#27ae60] text-white"}`}>{showAddOutlet?"✖ Close":"➕ Add Outlet"}</button>
              </div>
              {showAddOutlet && (
                <div className="border-2 border-dashed border-[#27ae60] rounded-lg p-3 mb-3 bg-green-50/50">
                  <div className="font-bold text-sm mb-2">➕ ADD NEW OUTLET</div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input value={addOutletFields.name} onChange={e=> setAddOutletFields({...addOutletFields,name:e.target.value})} placeholder="OUTLET NAME (auto uppercased)" className="border rounded px-2 py-1 text-xs" />
                    <input value={addOutletFields.receiver} onChange={e=> setAddOutletFields({...addOutletFields,receiver:e.target.value})} placeholder="Receiver Name" className="border rounded px-2 py-1 text-xs" />
                    <input value={addOutletFields.phone} onChange={e=> setAddOutletFields({...addOutletFields,phone:e.target.value})} placeholder="Phone" className="border rounded px-2 py-1 text-xs" />
                    <input value={addOutletFields.address} onChange={e=> setAddOutletFields({...addOutletFields,address:e.target.value})} placeholder="Address" className="border rounded px-2 py-1 text-xs" />
                  </div>
                  <button onClick={confirmAddOutlet} className="mt-2 w-full bg-[#27ae60] text-white rounded py-2 text-sm font-bold">✅ Create Outlet</button>
                </div>
              )}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f4f6f9] sticky top-0 z-10"><tr><th className="p-2 text-left">OUTLET</th><th className="p-2">Receiver</th><th className="p-2">Phone</th><th className="p-2 text-left">Address</th><th className="p-2">Actions</th></tr></thead>
                    <tbody>
                      {Object.entries(view.OUTLET_INFO||{}).filter(([k,v]:any)=> !outletSearch || k.toLowerCase().includes(outletSearch.toLowerCase()) || String((v as any).name||"").toLowerCase().includes(outletSearch.toLowerCase()) || String((v as any).address||"").toLowerCase().includes(outletSearch.toLowerCase()) || String((v as any).phone||"").toLowerCase().includes(outletSearch.toLowerCase())).sort(([a],[b])=> a.localeCompare(b)).slice(0,150).map(([k,v]:any)=> (
                        editOutlet===k ? (
                          <tr key={k} className="border-t bg-amber-50">
                            <td className="p-2 font-bold">{k}</td>
                            <td className="p-2"><input value={editOutletFields.name} onChange={e=> setEditOutletFields({...editOutletFields,name:e.target.value})} className="border rounded px-1 py-0.5 text-[11px] w-full" /></td>
                            <td className="p-2"><input value={editOutletFields.phone} onChange={e=> setEditOutletFields({...editOutletFields,phone:e.target.value})} className="border rounded px-1 py-0.5 text-[11px] w-full" /></td>
                            <td className="p-2"><input value={editOutletFields.address} onChange={e=> setEditOutletFields({...editOutletFields,address:e.target.value})} className="border rounded px-1 py-0.5 text-[11px] w-full min-w-[200px]" /></td>
                            <td className="p-2 text-center whitespace-nowrap">
                              <button onClick={confirmEditOutlet} className="text-[11px] bg-green-600 text-white px-2 py-1 rounded">✔ Save</button>
                              <button onClick={()=> setEditOutlet(null)} className="text-[11px] bg-gray-300 px-2 py-1 rounded ml-1">✖</button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={k} className="border-t hover:bg-gray-50">
                            <td className="p-2 font-bold">{k}</td>
                            <td className="p-2">{v.name||"-"}</td>
                            <td className="p-2 font-mono">{(v.phone||"").trim()||"-"}</td>
                            <td className="p-2 text-[11px] max-w-[320px] truncate" title={v.address}>{v.address||"-"}</td>
                            <td className="p-2 text-center whitespace-nowrap">
                              <button onClick={()=> startEditOutlet(k, v)} className="text-[11px] bg-[#3498db] text-white px-2 py-1 rounded">✏️ Edit</button>
                              <button onClick={()=> deleteOutlet(k)} className="text-[11px] bg-[#e74c3c] text-white px-2 py-1 rounded ml-1">🗑️</button>
                            </td>
                          </tr>
                        )
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-[11px] text-gray-400 p-2 border-t">Showing {Math.min(150, Object.keys(view.OUTLET_INFO||{}).length)} of {Object.keys(view.OUTLET_INFO||{}).length} outlets — use search to filter.</div>
              </div>
            </div>
          )}

          {masterTab==="holidays" && (
            <div className="text-xs">
              <div className="font-bold mb-2">HOLIDAYS (Tanggal Merah) — {view.HOLIDAYS?.length||0} dates</div>
              {view.HOLIDAYS?.length ? (
                <div className="flex flex-wrap gap-2">
                  {view.HOLIDAYS.map((d:string)=> <span key={d} className="px-3 py-1 bg-red-50 border border-red-200 rounded-full text-red-700 flex items-center gap-1">{d} <button onClick={()=> patchDraft(dd=>{ dd.HOLIDAYS = (dd.HOLIDAYS||[]).filter((x:string)=> x!==d); })} className="text-red-600 hover:text-red-800">×</button></span>)}
                </div>
              ) : <div className="text-gray-400">No holidays configured — delivery date skips Sunday only.</div>}
              <div className="mt-3 flex gap-2">
                <input id="newHoliday" type="date" className="border rounded px-2 py-1 text-xs" />
                <button onClick={()=> {
                  const input = document.getElementById("newHoliday") as HTMLInputElement;
                  if(!input?.value) return;
                  patchDraft(dd=>{
                    dd.HOLIDAYS = dd.HOLIDAYS ? [...dd.HOLIDAYS, input.value] : [input.value];
                  });
                  input.value = "";
                  flash("ok","✅ Holiday added");
                }} className="px-3 py-1 bg-[#e74c3c] text-white rounded text-xs font-bold">➕ Add Holiday</button>
              </div>
              <div className="mt-3 text-[11px] text-gray-500">Used by get_delivery_date() to skip Sundays + holidays when calculating Delivery Date.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
