import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const ROLES = ["SuperAdmin","Admin","JendralVittoria","InventoryVittoria","TSAVittoria","LogisticVittoria"] as const;

export default function Admin(){
  const { profile } = useAuth();
  const [master, setMaster]=useState<any>(null);
  const [checkers, setCheckers]=useState<string[]>([]);
  const [newChecker,setNewChecker]=useState("");
  // User Management
  const [users,setUsers]=useState<any[]>([]);
  const [newUser,setNewUser]=useState({ email:"", password:"", role:"LogisticVittoria" as typeof ROLES[number], alias:"" });
  const [editing,setEditing]=useState<Record<string, {role:string, alias:string}>>({});

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

      {/* Master Data preview (PythonAnywhere) */}
      {master && (
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="font-bold mb-2">📦 Master Data (PythonAnywhere — Box Tolerance: {master.BOX_TOLERANCE})</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {Object.entries(master.CATEGORIES||{}).map(([cat, skus]:any)=>(
              <div key={cat} className="border rounded p-2">
                <div className="font-bold">{cat}</div>
                <div className="text-gray-600">{(skus as string[]).slice(0,3).join(", ")}{skus.length>3?"…":""}</div>
                <div className="font-mono">{skus.length} SKUs</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
