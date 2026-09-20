import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../i18n";
import RankBadge from "../components/RankBadge";
import { expFetchBoard, badgeForLevel, type ExpEntry } from "../lib/exp";

const ROLES = ["Super Admin","Admin","Checker"] as const;

const KNOWN_TERMINALS: Record<string,string> = {
  "Majesta (Lead Developer)": "8DB7CE3731E42814",
  "Zahra Logistic VT": "A958AAA787BF6FF9",
  "Nur Logistic VT": "30EA5F1E9BD8FD68",
};

function OfflinePinWidget(){
  const { t } = useLanguage();
  const [hwid, setHwid]=useState("");
  const [res, setRes]=useState<any>(null);
  const [err, setErr]=useState("");
  const gen = async ()=>{
    const id = hwid.trim().toUpperCase();
    if(id.length!==16){ setErr(t("admin.hwidLen")); return; }
    setErr("");
    const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");
    const r = await fetch(`${base}/api/offline_pin?hwid=${id}`);
    const j = await r.json();
    if(!r.ok) setErr(j.error || t("admin.failed"));
    else setRes(j);
  };
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input value={hwid} onChange={e=> setHwid(e.target.value)} placeholder={t("admin.hwidPh")} className="border rounded-lg px-3 py-2 font-mono text-sm tracking-widest" maxLength={16} />
        <select onChange={e=> setHwid(e.target.value)} defaultValue="" className="border rounded-lg px-3 py-2 text-sm">
          <option value="">{t("admin.pickTerminal")}</option>
          {Object.entries(KNOWN_TERMINALS).map(([k,v])=> <option key={k} value={v}>{k} — {v}</option>)}
        </select>
        <button onClick={gen} className="bg-[#f39c12] text-white rounded-lg px-4 py-2 font-bold text-sm">{t("admin.genPin")}</button>
      </div>
      {err && <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</div>}
      {res && (
        <div className="mt-3 bg-[#f4f6f9] rounded-lg p-3 text-center">
          <div className="font-mono text-lg font-extrabold text-[#27ae60]">{t("admin.today", { pin: res.pin_today })} <button onClick={()=> navigator.clipboard.writeText(res.pin_today)} className="ml-2 text-xs bg-white border rounded px-2 py-1">{t("admin.copy")}</button></div>
          <div className="font-mono text-sm text-gray-500">{t("admin.yesterday", { pin: res.pin_yesterday })}</div>
          <div className="text-xs text-gray-400">{res.today} • {res.hwid}</div>
        </div>
      )}
    </div>
  );
}

export default function Admin(){

  const { profile } = useAuth();
  const { t } = useLanguage();
  const [master, setMaster]=useState<any>(null);
  const [draft, setDraft]=useState<any>(null);
  const [hasChanges, setHasChanges]=useState(false);
  const [saveStatus, setSaveStatus]=useState<"idle"|"saving"|"success"|"error">("idle");
  const [checkers, setCheckers]=useState<string[]>([]);
  const [newChecker,setNewChecker]=useState("");
  // User Management
  const [users,setUsers]=useState<any[]>([]);
  // EXP flex tags by user id (Admin/Operator only)
  const [expById,setExpById]=useState<Record<string, ExpEntry>>({});
  const [newUser,setNewUser]=useState({ email:"", password:"", role:"Checker" as typeof ROLES[number], alias:"" });
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
  // Anti-Cheat / Ban Hammer
  const [banTarget,setBanTarget]=useState<{id:string,email:string}|null>(null);
  const [banReason,setBanReason]=useState("");
  const [banDays,setBanDays]=useState<number|undefined>(1);
  const [violations,setViolations]=useState<any[]>([]);
  const [showViolations,setShowViolations]=useState(false);

  const isSuperAdmin = profile?.role==="Super Admin";
  const isAdmin = profile?.role==="Super Admin" || profile?.role==="Admin";

  // Helpers for Online Status / Last Seen (WIB) — non-breaking additive
  const isOnline = (iso: string|null|undefined) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    if (isNaN(t)) return false;
    return Date.now() - t < 5 * 60 * 1000; // 5 min threshold
  };
  const formatWIB = (iso: string|null|undefined) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }) + " WIB";
    } catch { return String(iso); }
  };
  const timeAgo = (iso: string|null|undefined) => {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    if (isNaN(diff) || diff < 0) return "";
    const m = Math.floor(diff/60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m/60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h/24);
    return `${d}d ago`;
  };

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
    expFetchBoard().then(b=>{
      const m: Record<string, ExpEntry> = {};
      for(const e of b) m[e.user_id] = e;
      setExpById(m);
    }).catch(()=>{});
  };

  useEffect(()=>{
    apiGet("/api/master_data").then(md=>{ setMaster(md); setDraft(JSON.parse(JSON.stringify(md))); }).catch(()=>{});
    apiGet("/api/checkers").then(d=> setCheckers(d.checkers||[])).catch(()=>{});
    fetchUsers();
  },[profile]);

  // Auto-refresh Online status every 30s (non-breaking)
  useEffect(()=>{
    if(!isAdmin) return;
    const id = setInterval(fetchUsers, 30000);
    return ()=> clearInterval(id);
  },[isAdmin]);

  const flash = (type:"ok"|"err", text:string)=>{ setMsg({type,text}); setTimeout(()=> setMsg(null), 3500); };

  // ---- Anti-Cheat / Ban Handlers ----
  const handleBan = async ()=>{
    if(!banTarget || !banReason) return;
    const until = banDays ? new Date(Date.now() + banDays * 86400000).toISOString() : null;
    // Optimistic: update UI instantly, rollback on failure
    setUsers(prev => prev.map(u => u.id === banTarget.id ? { ...u, banned: true, banned_reason: banReason, banned_at: new Date().toISOString(), banned_until: until } : u));
    flash("ok", `🔨 Banned ${banTarget.email} ${banDays ? `for ${banDays} days` : "permanently"}`);
    setBanTarget(null); setBanReason(""); setBanDays(1);
    try {
      const h = await authHeader();
      const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");
      const r = await fetch(`${base}/api/users/${banTarget.id}/ban`, {
        method:"POST", headers:{ "Content-Type":"application/json", ...h },
        body: JSON.stringify({ reason: banReason, days: banDays })
      });
      const j = await r.json();
      if(!r.ok) { setUsers(prev => prev.map(u => u.id === banTarget.id ? { ...u, banned: false } : u)); alert(`❌ ${j.error}`); }
    } catch(e:any) { alert(`❌ ${e.message}`); }
  };
  const handleUnban = async (userId:string)=>{
    if(!confirm("Unban this user?")) return;
    // Optimistic: update UI instantly, rollback on failure
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, banned: false, banned_reason: null, banned_at: null, banned_until: null } : u));
    flash("ok", "✅ User unbanned");
    try {
      const h = await authHeader();
      const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");
      const r = await fetch(`${base}/api/users/${userId}/unban`, {
        method:"POST", headers:{ "Content-Type":"application/json", ...h }
      });
      const j = await r.json();
      if(!r.ok) { setUsers(prev => prev.map(u => u.id === userId ? { ...u, banned: true } : u)); alert(`❌ ${j.error}`); }
    } catch(e:any) { alert(`❌ ${e.message}`); }
  };
  const handleApprove = async (userId:string, approved:boolean)=>{
    // Optimistic: update UI instantly, rollback on failure
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, approved, approved_at: approved ? new Date().toISOString() : null } : u));
    flash("ok", approved ? "✅ User approved" : "⛔ User rejected");
    try {
      const h = await authHeader();
      const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");
      const r = await fetch(`${base}/api/users/${userId}/approve`, {
        method:"POST", headers:{ "Content-Type":"application/json", ...h },
        body: JSON.stringify({ approved })
      });
      const j = await r.json();
      if(!r.ok) { setUsers(prev => prev.map(u => u.id === userId ? { ...u, approved: !approved } : u)); alert(`❌ ${j.error}`); }
    } catch(e:any) { alert(`❌ ${e.message}`); }
  };
  const fetchViolations = async ()=>{
    try {
      const h = await authHeader();
      const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");
      const r = await fetch(`${base}/api/anticheat/violations?limit=100`, { headers: h });
      const d = await r.json();
      setViolations(Array.isArray(d) ? d : []);
      setShowViolations(true);
    } catch {}
  };
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
      flash("ok", t("admin.masterSaved"));
      setTimeout(()=> setSaveStatus("idle"), 2500);
    } catch(e:any){
      setSaveStatus("error");
      flash("err", t("admin.saveFailed", { err: e?.message || t("admin.failed") }));
      setTimeout(()=> setSaveStatus("idle"), 4000);
    }
  };

  const discardChanges = ()=>{
    if(!master) return;
    if(!confirm(t("admin.discardConfirm"))) return;
    setDraft(JSON.parse(JSON.stringify(master)));
    setHasChanges(false);
    setEditSku(null); setEditKode(null); setEditOutlet(null);
    setShowAddSku(false); setShowAddKode(false); setShowAddOutlet(false);
    flash("ok", t("admin.discarded"));
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
    if(!cap || cap<=0) return flash("err",t("admin.errBoxCap"));
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
    flash("ok", t("admin.updatedSku", { sku }));
  };
  const deleteSku = (sku:string)=>{
    if(!confirm(t("admin.delSkuConfirm", { sku }))) return;
    patchDraft(d=>{
      if(d.BOX_CAPACITY) delete d.BOX_CAPACITY[sku];
      if(d.ITEM_UOM) delete d.ITEM_UOM[sku];
      if(d.ITEM_WEIGHT_GRAMS) delete d.ITEM_WEIGHT_GRAMS[sku];
      const cats = d.CATEGORIES || {};
      for(const [cat, list] of Object.entries(cats)){
        cats[cat] = (list as string[]).filter((x:string)=> x!==sku);
      }
    });
    flash("ok", t("admin.deletedSku", { sku }));
  };
  const confirmAddSku = ()=>{
    if(!draft) return;
    const name = addSkuFields.name.trim();
    const cap = parseInt(addSkuFields.boxCap,10);
    if(!name) return flash("err",t("admin.errSkuName"));
    if(draft.BOX_CAPACITY?.[name]) return flash("err",t("admin.errSkuExists", { name }));
    if(!cap || cap<=0) return flash("err",t("admin.errBoxCap"));
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
    flash("ok", t("admin.addedSku", { name }));
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
    if(!newCode || !targetSku) return flash("err",t("admin.errKodeRequired"));
    if(newCode !== editKode && draft.KODE_BARANG?.[newCode]) return flash("err",t("admin.errKodeExists", { code: newCode }));
    patchDraft(d=>{
      d.KODE_BARANG = d.KODE_BARANG || {};
      if(newCode !== editKode) delete d.KODE_BARANG[editKode];
      d.KODE_BARANG[newCode] = targetSku;
    });
    setEditKode(null);
    flash("ok", t("admin.kodeMapped", { from: editKode, to: newCode, sku: targetSku }));
  };
  const deleteKode = (code:string)=>{
    if(!confirm(t("admin.delKodeConfirm", { code }))) return;
    patchDraft(d=>{ if(d.KODE_BARANG) delete d.KODE_BARANG[code]; });
    flash("ok", t("admin.deletedKode", { code }));
  };
  const confirmAddKode = ()=>{
    if(!draft) return;
    const code = addKodeFields.code.trim().toUpperCase();
    const sku = addKodeFields.sku;
    if(!code || !sku) return flash("err",t("admin.errKodeRequired"));
    if(draft.KODE_BARANG?.[code]) return flash("err",t("admin.errKodeExists", { code }));
    patchDraft(d=>{
      d.KODE_BARANG = d.KODE_BARANG || {};
      d.KODE_BARANG[code] = sku;
    });
    setShowAddKode(false);
    setAddKodeFields({code:"",sku:""});
    flash("ok", t("admin.addedKode", { code, sku }));
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
    flash("ok", t("admin.updatedOutlet", { name: editOutlet }));
  };
  const deleteOutlet = (name:string)=>{
    if(!confirm(t("admin.delOutletConfirm", { name }))) return;
    patchDraft(d=>{ if(d.OUTLET_INFO) delete d.OUTLET_INFO[name]; });
    flash("ok", t("admin.deletedOutlet", { name }));
  };
  const confirmAddOutlet = ()=>{
    if(!draft) return;
    const name = addOutletFields.name.trim().toUpperCase();
    if(!name) return flash("err",t("admin.errOutletName"));
    if(draft.OUTLET_INFO?.[name]) return flash("err",t("admin.errOutletExists", { name }));
    patchDraft(d=>{
      d.OUTLET_INFO = d.OUTLET_INFO || {};
      d.OUTLET_INFO[name] = { name: addOutletFields.receiver || name, phone: addOutletFields.phone, address: addOutletFields.address };
    });
    setShowAddOutlet(false);
    setAddOutletFields({name:"",receiver:"",phone:"",address:""});
    flash("ok", t("admin.addedOutlet", { name }));
  };

  const handleAddUser = async ()=>{
    if(!newUser.email || !newUser.password) return alert(t("admin.errEmailPwd"));
    const h = await authHeader();
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000")}/api/users`, {
      method:"POST", headers: { "Content-Type":"application/json", ...h }, body: JSON.stringify(newUser)
    });
    const j = await res.json();
    if(!res.ok) return alert(`❌ ${j.error}`);
    setNewUser({ email:"", password:"", role:"Checker", alias:"" });
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
    if(!confirm(t("admin.delAccount"))) return;
    const h = await authHeader();
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000")}/api/users/${id}`, { method:"DELETE", headers: h });
    const j = await res.json();
    if(!res.ok) return alert(`❌ ${j.error}`);
    fetchUsers();
  };

  const handleChangePassword = async (id:string, email:string)=>{
    const np = prompt(t("admin.newPassword", { email }));
    if(!np || np.length<6) return alert(t("admin.min6"));
    const h = await authHeader();
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000")}/api/users/${id}`, {
      method:"PATCH", headers: { "Content-Type":"application/json", ...h }, body: JSON.stringify({ password: np })
    });
    const j = await res.json();
    if(!res.ok) return alert(`❌ ${j.error}`);
    alert(t("admin.pwdUpdated", { email }));
  };

  const view = draft || master;

  return (
    <div className="min-h-[calc(100vh-56px)] bg-gradient-to-br from-[#0f1e2e] via-[#162a45] to-[#1e3a5f] relative overflow-hidden">
      {/* flagship orbs — decorative only, no logic */}
      <div className="absolute -top-24 -right-24 w-[520px] h-[520px] bg-white/[0.06] rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-[640px] h-[640px] bg-sky-400/[0.07] rounded-full blur-[90px] pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[900px] h-[420px] bg-emerald-400/[0.04] rounded-full blur-[90px] pointer-events-none" />
      <div className="relative max-w-6xl mx-auto p-4 md:p-6 space-y-5">
      {/* Flagship header — UI only, same profile/role logic */}
      <div className="relative rounded-[24px] overflow-hidden border border-white/10 bg-gradient-to-br from-[#0f1e2e] via-[#1a2f4a] to-[#2c3e50] text-white shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
        <div className="absolute -right-16 -top-16 w-48 h-48 bg-white/[0.06] rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 w-36 h-36 bg-emerald-400/[0.08] rounded-full blur-2xl pointer-events-none" />
        <div className="relative p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white text-[#0f1e2e] flex items-center justify-center text-xl shadow-lg border border-white/20">🛡️</div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-[18px] tracking-tight">Admin Command Center</span>
                <span className="text-[10px] font-bold tracking-widest bg-white text-[#0f1e2e] px-2 py-0.5 rounded-full">FLAGSHIP</span>
              </div>
              <div className="text-xs text-white/60 mt-1">{t("admin.loggedInAs", { email: profile?.email })} <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#9b59b6] text-white">{profile?.role}</span> {isSuperAdmin && <span className="ml-1 text-[11px] bg-gradient-to-r from-yellow-400 to-amber-500 text-white px-2 py-0.5 rounded-full font-bold shadow-sm">{t("admin.superAdminBadge")}</span>}</div>
            </div>
          </div>
          <div className="flex flex-col md:items-end gap-2">
            <div className="text-[11px] tracking-widest font-semibold text-white/50">LOGISTICS • VITTORIA</div>
            <div className="text-xs text-white/60">{t("admin.masterSub")}</div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold">☁️ Cloud Sync</span>
              <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold">🛡️ Anti-Cheat</span>
              <span className="px-3 py-1.5 rounded-full bg-emerald-500 text-white text-[11px] font-black shadow">● Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* User Management — Admin only : flagship card, logic untouched */}
      <div className="bg-white/95 backdrop-blur rounded-[20px] border border-white/40 shadow-[0_16px_40px_rgba(0,0,0,0.18)] p-5 md:p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-[#0f1e2e] text-white flex items-center justify-center text-base shadow">👥</div>
          <h3 className="font-black text-[16px] tracking-tight text-[#0f1e2e]">{t("admin.userMgmt")}</h3>
          <span className="ml-auto text-[10px] font-bold tracking-widest bg-slate-100 border border-slate-200 text-slate-500 px-2 py-0.5 rounded-full">SECURE</span>
        </div>
        <p className="text-xs text-gray-500 mb-3">{t("admin.userMgmtDesc1")} <b>SuperAdmin</b> ({profile?.role==="Super Admin"?t("admin.you"): "majestap93@gmail.com"}) {t("admin.userMgmtDesc2")} <b>Admin</b> {t("admin.userMgmtDesc3")}</p>
        {!isAdmin ? (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{t("admin.needAdmin", { role: profile?.role })}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
              <input value={newUser.email} onChange={e=> setNewUser({...newUser, email:e.target.value})} placeholder="email@example.com" className="border rounded-lg px-3 py-2 text-sm" />
              <input value={newUser.password} onChange={e=> setNewUser({...newUser, password:e.target.value})} placeholder={t("admin.passwordMin")} type="password" className="border rounded-lg px-3 py-2 text-sm" />
              <input value={newUser.alias} onChange={e=> setNewUser({...newUser, alias:e.target.value})} placeholder={t("admin.aliasOptional")} className="border rounded-lg px-3 py-2 text-sm" />
              <select value={newUser.role} onChange={e=> setNewUser({...newUser, role:e.target.value as any})} className="border rounded-lg px-3 py-2 text-sm">
                {ROLES.filter(r=> isSuperAdmin || r!=="Super Admin").map(r=> <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={handleAddUser} className="bg-[#27ae60] text-white rounded-lg px-4 py-2 font-bold text-sm">{t("admin.addAccount")}</button>
            </div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-500">{users.length} users • <span className="text-emerald-600 font-bold">{users.filter(u=> isOnline(u.last_seen_at)).length} online</span> <span className="text-gray-400">/ {users.length - users.filter(u=> isOnline(u.last_seen_at)).length} offline</span> <span className="ml-2 text-[10px] bg-slate-100 border rounded-full px-2 py-0.5">auto-refresh 30s</span></div>
            <div className="flex gap-2">
              {isSuperAdmin && <button onClick={fetchViolations} className="text-xs bg-[#c0392b] text-white px-2 py-1 rounded font-bold">🛡️ Violations</button>}
              <button onClick={fetchUsers} className="text-xs bg-white border px-2 py-1 rounded font-bold hover:bg-gray-50">↻ Refresh</button>
            </div>
            </div>
            <div className="overflow-auto border rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-[#f4f6f9] text-[11px] tracking-wide">
                  <tr>
                    <th className="p-2.5 text-left">{t("admin.email")}</th>
                    <th className="p-2.5 text-left">{t("admin.alias")}</th>
                    <th className="p-2.5 text-center">{t("admin.role")}</th>
                    <th className="p-2.5 text-center">Status</th>
                    <th className="p-2.5 text-left">Last Seen / Login</th>
                    <th className="p-2.5 text-center">{t("admin.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u=>{
                    const online = isOnline(u.last_seen_at);
                    const seenIso = u.last_seen_at || u.last_sign_in_at || u.last_login_at || null;
                    return (
                    <tr key={u.id} className={`border-t ${online ? "bg-emerald-50/40" : "hover:bg-gray-50"}`}>
                      {u.banned && <tr><td colSpan={6} className="bg-red-50 border-l-4 border-l-red-500 px-3 py-1.5"><div className="flex items-center gap-2"><span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">🔨 BANNED</span><span className="text-[11px] text-red-600 truncate">{u.banned_reason || "No reason"}</span>{u.banned_until && <span className="text-[10px] text-red-400 ml-auto whitespace-nowrap">until {new Date(u.banned_until).toLocaleDateString("id-ID")}</span>}</div></td></tr>}
                      <td className="p-2.5">
                        <div className="font-medium text-slate-800 truncate max-w-[220px]" title={u.email}>{u.email}</div>
                        <div className="text-[10px] text-gray-400 font-mono hidden md:block">{u.id.slice(0,8)}…</div>
                      </td>
                      <td className="p-2.5 text-center">
                        {editing[u.id] ? (
                          <input value={editing[u.id].alias} onChange={e=> setEditing({...editing,[u.id]:{...editing[u.id],alias:e.target.value}})} placeholder="Alias" className="border rounded px-2 py-1 text-xs w-28" />
                        ) : (
                          <span className="text-xs">{u.alias||"—"}</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        {editing[u.id] ? (
                          <select value={editing[u.id].role} onChange={e=> setEditing({...editing,[u.id]:{...editing[u.id],role:e.target.value}})} className="border rounded px-2 py-1 text-xs">
                            {ROLES.filter(r=> isSuperAdmin || r!=="Super Admin").map(r=> <option key={r} value={r}>{r}</option>)}
                          </select>
                        ) : (
                          <><span className={`px-2 py-1 rounded-full text-[11px] font-extrabold border ${u.role==="Super Admin"?"bg-yellow-100 text-yellow-800 border-yellow-200":u.role==="Admin"?"bg-[#2c3e50] text-white border-[#2c3e50]":u.role.includes("Vittoria")?"bg-[#ecf0f1] text-slate-700 border-slate-200":"bg-slate-100 text-slate-700"}`}>{u.role}</span>{u.role==="Super Admin" && <span className="ml-1 text-[9px] bg-gradient-to-r from-yellow-400 to-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold shadow-sm">🛡️ IMMORTAL</span>}{expById[u.id] && <span className="ml-1 inline-flex items-center gap-0.5 align-middle" title={`${expById[u.id].exp.toLocaleString()} EXP`}><RankBadge badge={badgeForLevel(expById[u.id].level)} level={expById[u.id].level} title={expById[u.id].title} size={14} /><span className="text-[10px] font-black text-amber-600">Lv{expById[u.id].level}</span></span>}</>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${online ? "bg-emerald-500 text-white border-emerald-600 shadow-sm" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                          <span className={`w-2 h-2 rounded-full ${online ? "bg-white animate-pulse" : "bg-gray-400"}`} /> {online ? "Online" : "Offline"}
                        </span>
                      </td>
                      <td className="p-2.5 text-[11px] leading-tight">
                        <div className="font-medium text-slate-700">{formatWIB(seenIso)}</div>
                        <div className={`text-[10px] ${online ? "text-emerald-600 font-bold" : "text-gray-400"}`}>{seenIso ? timeAgo(seenIso) : "never"}{u.last_sign_in_at && u.last_sign_in_at !== seenIso ? ` • login ${formatWIB(u.last_sign_in_at)}` : ""}</div>
                      </td>
                      <td className="p-2.5 text-center">
                        {editing[u.id] ? (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={()=> handleUpdate(u.id)} className="text-xs bg-[#27ae60] text-white px-2 py-1 rounded font-bold">{t("admin.save")}</button>
                            <button onClick={()=> setEditing(prev=>{const n={...prev}; delete n[u.id]; return n;})} className="text-xs bg-gray-200 px-2 py-1 rounded">✖</button>
                          </div>
                        ) : (
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                            {u.banned ? (
                              <button onClick={()=> handleUnban(u.id)} className="text-[11px] bg-emerald-500 text-white px-2 py-1 rounded font-bold">🔓 Unban</button>
                            ) : (
                              <button onClick={()=> setBanTarget({id: u.id, email: u.email})} className="text-[11px] bg-red-500 text-white px-2 py-1 rounded font-bold" disabled={u.id===profile?.id || u.role==="Super Admin"} title={u.role==="Super Admin" ? "🛡️ Immortal — SuperAdmin cannot be banned" : ""}>🔨</button>
                            )}
                            {u.approved === false ? (
                              <button onClick={()=> handleApprove(u.id, true)} className="text-[11px] bg-emerald-500 text-white px-2 py-1 rounded font-bold">✅ Approve</button>
                            ) : (
                              <button onClick={()=> handleApprove(u.id, false)} className="text-[11px] bg-gray-300 text-gray-600 px-2 py-1 rounded" title="Revoke approval">⏳</button>
                            )}
                            <button onClick={()=> setEditing({...editing, [u.id]: { role: u.role, alias: u.alias || "" }})} className="text-[11px] bg-white border px-2 py-1 rounded hover:bg-gray-50">✏️</button>
                            <button onClick={()=> handleChangePassword(u.id, u.email)} className="text-[11px] bg-[#f39c12] text-white px-2 py-1 rounded">🔑</button>
                            <button onClick={()=> handleDelete(u.id)} className="text-[11px] bg-white border border-red-200 text-red-600 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-40" disabled={u.id===profile?.id}>🗑️</button>
                          </div>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                  {users.length===0 && <tr><td colSpan={6} className="text-center p-6 text-gray-400 text-xs">{t("admin.noUsers", { email: "majestap93@gmail.com" })}</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-gray-400 mt-2">{t("admin.rolePerms")}</div>
          </>
        )}
      </div>

      {/* Offline PIN Generator — Lead Dev only : flagship card, logic untouched */}
      {isSuperAdmin && (
        <div className="bg-white/95 backdrop-blur rounded-[20px] border-2 border-amber-300/50 shadow-[0_16px_40px_rgba(0,0,0,0.18)] p-5 md:p-6 relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 mb-1 relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 text-white flex items-center justify-center text-base shadow">🔑</div>
            <h3 className="font-black text-[16px] tracking-tight text-[#0f1e2e]">{t("admin.offlinePin")}</h3>
            <span className="ml-auto text-[10px] font-bold tracking-widest bg-amber-100 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">SUPERADMIN</span>
          </div>
          <p className="text-xs text-gray-500 mb-3">{t("admin.offlinePinDesc1")} <code>Devmode.py</code> {t("admin.offlinePinDesc2")}</p>
          <OfflinePinWidget />
        </div>
      )}

      {/* Checkers : flagship card, logic untouched */}
      <div className="bg-white/95 backdrop-blur rounded-[20px] border border-white/40 shadow-[0_16px_40px_rgba(0,0,0,0.18)] p-5 md:p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-base shadow">✅</div>
          <h3 className="font-black text-[16px] tracking-tight text-[#0f1e2e]">{t("admin.checkerMgmt")}</h3>
        </div>
        <div className="flex gap-2 mb-3">
          <input value={newChecker} onChange={e=> setNewChecker(e.target.value)} placeholder={t("admin.newChecker")} className="border rounded-lg px-3 py-1 flex-1" />
          <button onClick={async()=>{ if(!newChecker) return; await apiPost("/api/checkers",{admin_key:"majesta93",action:"add",checker_name:newChecker}); const d=await apiGet("/api/checkers"); setCheckers(d.checkers); setNewChecker(""); }} className="px-3 py-1 bg-[#27ae60] text-white rounded">{t("admin.add")}</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {checkers.map(c=> <span key={c} className="px-3 py-1 bg-[#ecf0f1] rounded-full text-sm flex items-center gap-2">{c} <button onClick={async()=>{ await apiPost("/api/checkers",{admin_key:"majesta93",action:"remove",checker_name:c}); const d=await apiGet("/api/checkers"); setCheckers(d.checkers); }} className="text-red-600">×</button></span>)}
        </div>
      </div>

      {/* Master Data — Detailed (PythonAnywhere, with Editor) : flagship card, logic untouched */}
      {view && (
        <div className="bg-white/95 backdrop-blur rounded-[20px] border border-white/40 shadow-[0_16px_40px_rgba(0,0,0,0.18)] p-5 md:p-6">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="w-9 h-9 rounded-xl bg-[#0f1e2e] text-white flex items-center justify-center text-base shadow">🗄️</div>
            <h3 className="font-black text-[16px] tracking-tight text-[#0f1e2e]">{t("admin.masterEditor")}</h3>
            <div className="ml-auto text-[11px] bg-[#0f1e2e] text-white px-3 py-1.5 rounded-full font-bold shadow">{t("admin.masterSummary", { tol: view.BOX_TOLERANCE, skus: Object.keys(view.BOX_CAPACITY||{}).length, outlets: Object.keys(view.OUTLET_INFO||{}).length, kodes: Object.keys(view.KODE_BARANG||{}).length })}</div>
          </div>

          {/* Save bar */}
          <div className={`flex items-center gap-2 p-3 rounded-lg mb-3 border ${hasChanges ? "bg-amber-50 border-amber-300" : "bg-[#f4f6f9] border-gray-200"}`}>
            <div className={`text-sm font-bold flex-1 ${hasChanges ? "text-amber-700" : "text-gray-500"}`}>
              {hasChanges ? t("admin.unsaved") : t("admin.allSaved")}
            </div>
            {hasChanges && (
              <>
                <button onClick={discardChanges} className="px-3 py-1 rounded text-xs font-bold bg-white border border-gray-300 text-gray-600">{t("admin.discard")}</button>
                <button onClick={saveMaster} disabled={saveStatus==="saving"} className="px-4 py-1.5 rounded text-xs font-bold bg-[#27ae60] text-white disabled:opacity-50">
                  {saveStatus==="saving" ? t("admin.saving") : saveStatus==="success" ? t("admin.saved") : saveStatus==="error" ? t("admin.retry") : t("admin.saveAll")}
                </button>
              </>
            )}
          </div>

          {msg && <div className={`mb-3 text-xs font-semibold p-2 rounded ${msg.type==="ok"?"bg-green-50 text-green-700 border border-green-200":"bg-red-50 text-red-700 border border-red-200"}`}>{msg.text}</div>}

          <div className="flex gap-1.5 mb-4 p-1.5 rounded-2xl bg-slate-100 border border-slate-200 overflow-x-auto">
            {[
              ["overview", t("admin.tabOverview")],
              ["skus", t("admin.tabSkus")],
              ["kodes", t("admin.tabKodes")],
              ["outlets", t("admin.tabOutlets")],
              ["holidays", t("admin.tabHolidays")],
            ].map(([id,label])=>(
              <button key={id} onClick={()=> setMasterTab(id as any)} className={`px-4 py-2 text-xs font-black whitespace-nowrap rounded-xl transition active:scale-[0.98] ${masterTab===id ? "bg-[#0f1e2e] text-white shadow-[0_8px_20px_rgba(15,30,46,0.22)]" : "text-slate-500 hover:bg-white hover:text-slate-700"}`}>{label}</button>
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
              <div className="text-[11px] text-gray-500">{t("admin.overviewHint")}</div>
            </div>
          )}

          {/* SKU INVENTORY — editable */}
          {masterTab==="skus" && (
            <div>
              <div className="flex gap-2 mb-3 items-center">
                <input value={skuSearch} onChange={e=> setSkuSearch(e.target.value)} placeholder={t("admin.searchSku")} className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                <button onClick={()=> setShowAddSku(!showAddSku)} className={`px-3 py-2 rounded-lg text-sm font-bold ${showAddSku?"bg-gray-300 text-gray-700":"bg-[#27ae60] text-white"}`}>{showAddSku?t("admin.close"):t("admin.addSku")}</button>
              </div>
              {showAddSku && (
                <div className="border-2 border-dashed border-[#27ae60] rounded-lg p-3 mb-3 bg-green-50/50">
                  <div className="font-bold text-sm mb-2">{t("admin.addNewSku")}</div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <input value={addSkuFields.name} onChange={e=> setAddSkuFields({...addSkuFields,name:e.target.value})} placeholder={t("dash.skuName")} className="border rounded px-2 py-1 text-xs" />
                    <select value={addSkuFields.category} onChange={e=> setAddSkuFields({...addSkuFields,category:e.target.value})} className="border rounded px-2 py-1 text-xs">
                      {Object.keys(view.CATEGORIES||{}).map(c=> <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input value={addSkuFields.uom} onChange={e=> setAddSkuFields({...addSkuFields,uom:e.target.value})} placeholder={t("admin.uomPh")} className="border rounded px-2 py-1 text-xs" />
                    <input value={addSkuFields.boxCap} onChange={e=> setAddSkuFields({...addSkuFields,boxCap:e.target.value})} placeholder={t("admin.boxCapPh")} type="number" className="border rounded px-2 py-1 text-xs" />
                    <input value={addSkuFields.weight} onChange={e=> setAddSkuFields({...addSkuFields,weight:e.target.value})} placeholder={t("admin.weightPh")} type="number" className="border rounded px-2 py-1 text-xs" />
                  </div>
                  <button onClick={confirmAddSku} className="mt-2 w-full bg-[#27ae60] text-white rounded py-2 text-sm font-bold">{t("admin.createSku")}</button>
                </div>
              )}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f4f6f9] sticky top-0 z-10"><tr><th className="p-2 text-left">{t("dash.skuName")}</th><th className="p-2">{t("admin.category")}</th><th className="p-2">UOM</th><th className="p-2">{t("admin.boxCapTh")}</th><th className="p-2">{t("admin.weightTh")}</th><th className="p-2">{t("admin.actions")}</th></tr></thead>
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
                                <button onClick={confirmEditSku} className="text-[11px] bg-green-600 text-white px-2 py-1 rounded">✔ {t("admin.saveSlim")}</button>
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
                                <button onClick={()=> startEditSku(sku, catOf[sku]||"FROZEN_ITEMS")} className="text-[11px] bg-[#3498db] text-white px-2 py-1 rounded">✏️ {t("admin.edit")}</button>
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
                <input value={kodeSearch} onChange={e=> setKodeSearch(e.target.value)} placeholder={t("admin.searchKode")} className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                <button onClick={()=> setShowAddKode(!showAddKode)} className={`px-3 py-2 rounded-lg text-sm font-bold ${showAddKode?"bg-gray-300 text-gray-700":"bg-[#27ae60] text-white"}`}>{showAddKode?t("admin.close"):t("admin.addKode")}</button>
              </div>
              {showAddKode && (
                <div className="border-2 border-dashed border-[#27ae60] rounded-lg p-3 mb-3 bg-green-50/50">
                  <div className="font-bold text-sm mb-2">{t("admin.addNewKode")}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={addKodeFields.code} onChange={e=> setAddKodeFields({...addKodeFields,code:e.target.value})} placeholder={t("admin.kodePh")} className="border rounded px-2 py-1 text-xs font-mono" />
                    <select value={addKodeFields.sku} onChange={e=> setAddKodeFields({...addKodeFields,sku:e.target.value})} className="border rounded px-2 py-1 text-xs">
                      <option value="">{t("admin.selectSku")}</option>
                      {Object.keys(view.BOX_CAPACITY||{}).sort().map(s=> <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <button onClick={confirmAddKode} className="mt-2 w-full bg-[#27ae60] text-white rounded py-2 text-sm font-bold">{t("admin.createKode")}</button>
                </div>
              )}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f4f6f9] sticky top-0 z-10"><tr><th className="p-2 text-left">{t("admin.kodeTh")}</th><th className="p-2 text-left">{t("admin.mapsToSku")}</th><th className="p-2">{t("admin.boxCapTh")}</th><th className="p-2">UOM</th><th className="p-2">{t("admin.actions")}</th></tr></thead>
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
                              <button onClick={confirmEditKode} className="text-[11px] bg-green-600 text-white px-2 py-1 rounded">✔ {t("admin.saveSlim")}</button>
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
                              <button onClick={()=> startEditKode(k, String(v))} className="text-[11px] bg-[#3498db] text-white px-2 py-1 rounded">✏️ {t("admin.edit")}</button>
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
                <input value={outletSearch} onChange={e=> setOutletSearch(e.target.value)} placeholder={t("admin.searchOutlet")} className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                <button onClick={()=> setShowAddOutlet(!showAddOutlet)} className={`px-3 py-2 rounded-lg text-sm font-bold ${showAddOutlet?"bg-gray-300 text-gray-700":"bg-[#27ae60] text-white"}`}>{showAddOutlet?t("admin.close"):t("admin.addOutlet")}</button>
              </div>
              {showAddOutlet && (
                <div className="border-2 border-dashed border-[#27ae60] rounded-lg p-3 mb-3 bg-green-50/50">
                  <div className="font-bold text-sm mb-2">{t("admin.addNewOutlet")}</div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input value={addOutletFields.name} onChange={e=> setAddOutletFields({...addOutletFields,name:e.target.value})} placeholder={`${t("dash.outletName").toUpperCase()} (auto)`} className="border rounded px-2 py-1 text-xs" />
                    <input value={addOutletFields.receiver} onChange={e=> setAddOutletFields({...addOutletFields,receiver:e.target.value})} placeholder={t("admin.receiverTh")} className="border rounded px-2 py-1 text-xs" />
                    <input value={addOutletFields.phone} onChange={e=> setAddOutletFields({...addOutletFields,phone:e.target.value})} placeholder={t("admin.phoneTh")} className="border rounded px-2 py-1 text-xs" />
                    <input value={addOutletFields.address} onChange={e=> setAddOutletFields({...addOutletFields,address:e.target.value})} placeholder={t("admin.addressTh")} className="border rounded px-2 py-1 text-xs" />
                  </div>
                  <button onClick={confirmAddOutlet} className="mt-2 w-full bg-[#27ae60] text-white rounded py-2 text-sm font-bold">✅ {t("admin.createOutlet")}</button>
                </div>
              )}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f4f6f9] sticky top-0 z-10"><tr><th className="p-2 text-left">OUTLET</th><th className="p-2">{t("admin.receiverTh")}</th><th className="p-2">{t("admin.phoneTh")}</th><th className="p-2 text-left">{t("admin.addressTh")}</th><th className="p-2">{t("admin.actions")}</th></tr></thead>
                    <tbody>
                      {Object.entries(view.OUTLET_INFO||{}).filter(([k,v]:any)=> !outletSearch || k.toLowerCase().includes(outletSearch.toLowerCase()) || String((v as any).name||"").toLowerCase().includes(outletSearch.toLowerCase()) || String((v as any).address||"").toLowerCase().includes(outletSearch.toLowerCase()) || String((v as any).phone||"").toLowerCase().includes(outletSearch.toLowerCase())).sort(([a],[b])=> a.localeCompare(b)).slice(0,150).map(([k,v]:any)=> (
                        editOutlet===k ? (
                          <tr key={k} className="border-t bg-amber-50">
                            <td className="p-2 font-bold">{k}</td>
                            <td className="p-2"><input value={editOutletFields.name} onChange={e=> setEditOutletFields({...editOutletFields,name:e.target.value})} className="border rounded px-1 py-0.5 text-[11px] w-full" /></td>
                            <td className="p-2"><input value={editOutletFields.phone} onChange={e=> setEditOutletFields({...editOutletFields,phone:e.target.value})} className="border rounded px-1 py-0.5 text-[11px] w-full" /></td>
                            <td className="p-2"><input value={editOutletFields.address} onChange={e=> setEditOutletFields({...editOutletFields,address:e.target.value})} className="border rounded px-1 py-0.5 text-[11px] w-full min-w-[200px]" /></td>
                            <td className="p-2 text-center whitespace-nowrap">
                              <button onClick={confirmEditOutlet} className="text-[11px] bg-green-600 text-white px-2 py-1 rounded">✔ {t("admin.saveSlim")}</button>
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
                              <button onClick={()=> startEditOutlet(k, v)} className="text-[11px] bg-[#3498db] text-white px-2 py-1 rounded">✏️ {t("admin.edit")}</button>
                              <button onClick={()=> deleteOutlet(k)} className="text-[11px] bg-[#e74c3c] text-white px-2 py-1 rounded ml-1">🗑️</button>
                            </td>
                          </tr>
                        )
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-[11px] text-gray-400 p-2 border-t">{t("admin.showingOutlets", { shown: Math.min(150, Object.keys(view.OUTLET_INFO||{}).length), total: Object.keys(view.OUTLET_INFO||{}).length })}</div>
              </div>
            </div>
          )}

          {masterTab==="holidays" && (
            <div className="text-xs">
              <div className="font-bold mb-2">{t("admin.holidaysTitle", { n: view.HOLIDAYS?.length||0 })}</div>
              {view.HOLIDAYS?.length ? (
                <div className="flex flex-wrap gap-2">
                  {view.HOLIDAYS.map((d:string)=> <span key={d} className="px-3 py-1 bg-red-50 border border-red-200 rounded-full text-red-700 flex items-center gap-1">{d} <button onClick={()=> patchDraft(dd=>{ dd.HOLIDAYS = (dd.HOLIDAYS||[]).filter((x:string)=> x!==d); })} className="text-red-600 hover:text-red-800">×</button></span>)}
                </div>
              ) : <div className="text-gray-400">{t("admin.noHolidays")}</div>}
              <div className="mt-3 flex gap-2">
                <input id="newHoliday" type="date" className="border rounded px-2 py-1 text-xs" />
                <button onClick={()=> {
                  const input = document.getElementById("newHoliday") as HTMLInputElement;
                  if(!input?.value) return;
                  patchDraft(dd=>{
                    dd.HOLIDAYS = dd.HOLIDAYS ? [...dd.HOLIDAYS, input.value] : [input.value];
                  });
                  input.value = "";
                  flash("ok",t("admin.holidayAdded"));
                }} className="px-3 py-1 bg-[#e74c3c] text-white rounded text-xs font-bold">{t("admin.addHoliday")}</button>
              </div>
              <div className="mt-3 text-[11px] text-gray-500">{t("admin.holidayHint")}</div>
            </div>
          )}
        </div>
      )}

      {/* Ban Dialog Modal — flagship, logic untouched */}
      {banTarget && (
        <div className="fixed inset-0 bg-[#0f1e2e]/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[20px] shadow-[0_24px_64px_rgba(0,0,0,0.35)] border border-white/40 w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-br from-[#c0392b] to-[#7b1f14] text-white px-5 py-4 text-center">
              <div className="text-lg font-black tracking-tight">🔨 Ban User</div>
              <div className="text-[11px] text-white/70 font-semibold tracking-widest">ANTI-CHEAT ENFORCEMENT</div>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-sm"><span className="font-bold">User:</span> {banTarget.email}</div>
              <div>
                <label className="text-xs font-bold">Reason</label>
                <input value={banReason} onChange={e=> setBanReason(e.target.value)} placeholder="e.g. Console access violation" className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" autoFocus />
              </div>
              <div>
                <label className="text-xs font-bold">Duration</label>
                <div className="grid grid-cols-4 gap-1 mt-1">
                  {[1,7,30,undefined].map(d=> (
                    <button key={String(d)} onClick={()=> setBanDays(d)} className={`text-xs py-1.5 rounded font-bold border ${banDays===d ? "bg-[#c0392b] text-white border-[#c0392b]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                      {d===undefined ? "Permanent" : d===1 ? "24h" : `${d}d`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-[11px] text-amber-700">
                ⚠️ This will terminate all active sessions and block login.
              </div>
            </div>
            <div className="p-3 flex gap-2 border-t bg-gray-50 rounded-b-xl">
              <button onClick={()=> { setBanTarget(null); setBanReason(""); }} className="flex-1 bg-gray-200 rounded-lg py-2 font-bold text-sm">Cancel</button>
              <button onClick={handleBan} disabled={!banReason} className="flex-1 bg-[#c0392b] text-white rounded-lg py-2 font-bold text-sm disabled:opacity-50">🔨 BAN USER</button>
            </div>
          </div>
        </div>
      )}

      {/* Violations Viewer Modal — flagship, logic untouched */}
      {showViolations && (
        <div className="fixed inset-0 bg-[#0f1e2e]/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[20px] shadow-[0_24px_64px_rgba(0,0,0,0.35)] border border-white/40 w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-br from-[#0f1e2e] via-[#1a2f4a] to-[#2c3e50] text-white px-5 py-4 flex items-center justify-between">
              <div className="font-bold">🛡️ Anti-Cheat Violations</div>
              <button onClick={()=> setShowViolations(false)} className="text-white/70 hover:text-white text-lg">✖</button>
            </div>
            <div className="flex-1 overflow-auto p-3">
              <table className="w-full text-xs">
                <thead className="bg-[#f4f6f9] sticky top-0"><tr>
                  <th className="p-2 text-left">Time</th><th className="p-2 text-left">Email</th><th className="p-2 text-left">Reason</th><th className="p-2">Count</th><th className="p-2">Auto-Ban</th>
                </tr></thead>
                <tbody>
                  {violations.length===0 && <tr><td colSpan={5} className="text-center p-6 text-gray-400">No violations recorded</td></tr>}
                  {violations.map((v:any)=> (
                    <tr key={v.id} className="border-t hover:bg-gray-50">
                      <td className="p-2 font-mono">{v.created_at ? new Date(v.created_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"}) : "—"}</td>
                      <td className="p-2">{v.email || v.user_id?.slice(0,8)}</td>
                      <td className="p-2">{v.reason} {v.detail && <span className="text-gray-400">({v.detail})</span>}</td>
                      <td className="p-2 text-center font-bold">{v.violation_count}</td>
                      <td className="p-2 text-center">{v.auto_ban ? <span className="text-red-600 font-bold">Yes</span> : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
