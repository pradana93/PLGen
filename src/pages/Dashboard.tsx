import { useEffect, useMemo, useState } from "react";
import { usePackingStore } from "../store/usePackingStore";
import { calculateBoxes, getDeliveryDateWIB } from "../lib/packing";
import { apiGet } from "../lib/api";
import { exportLabels, exportPackingList } from "../lib/exportExcel";
import { smartScanPdf, smartScanExcel } from "../lib/scanner";
import { useAuth } from "../context/AuthContext";
import KoliReviewer from "../components/KoliReviewer";

export default function Dashboard(){
  const { profile } = useAuth();
  const { master, order, boxes, outlet, checker, cluster, companyCode, setMaster, setOrder, setOutlet, setChecker, setCluster, setCompanyCode, addItem, subItem, clearOrder, setBoxes, setItemNote } = usePackingStore();
  const [sku, setSku] = useState("Beef Patty Small");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("BGB");
  const [filter, setFilter] = useState<string>("All");
  const [showReviewer, setShowReviewer] = useState(false);
  const [workingBoxes, setWorkingBoxes] = useState<any[]>([]);
  const [checkersList, setCheckersList] = useState<string[]>(["Masroor","Aji","Fadly","Luthfi"]);
  const [syncState, setSyncState] = useState("Local Backup 💾");
  const [toast, setToast] = useState<string|null>(null);
  const [editingNote, setEditingNote] = useState<string|null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [shortage, setShortage] = useState<null | { shortages: {sku:string, req:number, avail:number, short:number}[], pending: typeof order, company: "BBB"|"BBT", fileName: string }>(null);
  const [outletGuard, setOutletGuard] = useState<null | { outlet: string, similar: string[], onConfirm: (final:string)=>void }>(null);

  // Load master & checkers on mount
  useEffect(()=>{
    (async()=>{
      try {
        const md = await apiGet("/api/master_data");
        setMaster(md);
        setSyncState("Cloud Sync ☁️");
        const ch = await apiGet("/api/checkers");
        if(ch.checkers) setCheckersList(ch.checkers);
      } catch { setSyncState("Hardcoded Backup ⚠️"); }
    })();
  },[]);

  const skus = useMemo(()=> Object.keys(master.BOX_CAPACITY||{}).sort(), [master]);
  const filteredSkus = useMemo(()=>{
    if(filter==="All") return skus;
    const cat = master.CATEGORIES as any;
    const setFor = (k:string)=> new Set(cat[k]||[]);
    if(filter==="Frozen") return skus.filter(s=> setFor("FROZEN_ITEMS").has(s) || setFor("KENTANG_ITEMS").has(s));
    if(filter==="Sauce") return skus.filter(s=> setFor("SAUCE_ITEMS").has(s) || setFor("BREAD_ITEMS").has(s));
    if(filter==="Pack") return skus.filter(s=> setFor("PACKAGING_ITEMS").has(s) || setFor("BUNDLE_ITEMS").has(s));
    if(filter==="Merch") return skus.filter(s=> setFor("APPAREL_ITEMS").has(s));
    return skus;
  },[skus, filter, master]);

  useEffect(()=>{ if(filteredSkus.length && !filteredSkus.includes(sku)) setSku(filteredSkus[0]); },[filteredSkus]);

  const liveEstimate = useMemo(()=> calculateBoxes(order, master).length, [order, master]);
  const outletInfo = outlet ? master.OUTLET_INFO?.[outlet.toUpperCase()] : undefined;

  const showToast = (msg:string)=>{ setToast(msg); setTimeout(()=> setToast(null), 2500); };

  const handleAdd = ()=>{
    const n = parseInt(qty,10);
    if(!n || n<=0) return showToast("❌ Enter valid quantity");
    if(!note) return showToast("❌ Select a note");
    addItem(sku, n, note);
    setQty(""); showToast(`✅ Added ${n} ${sku}`);
  };
  const handleSub = ()=>{
    const n = parseInt(qty,10);
    if(!n || n<=0) return showToast("❌ Enter valid quantity");
    subItem(sku,n); setQty(""); showToast(`➖ Removed ${n} ${sku}`);
  };

  const handleCalculate = ()=>{
    if(!Object.keys(order).length) return showToast("❌ Order is empty");
    const raw = calculateBoxes(order, master);
    setWorkingBoxes(JSON.parse(JSON.stringify(raw)));
    setShowReviewer(true);
  };
  const handleConfirmReviewer = ()=>{
    setBoxes(workingBoxes);
    setShowReviewer(false);
    showToast(`✅ ${workingBoxes.length} Koli Approved`);
  };

  const doExport = async (finalOutlet: string)=>{
    if(!boxes.length) return showToast("❌ Calculate boxes first");
    if(!finalOutlet) return showToast("❌ Enter outlet name");
    if(!checker || checker==="Select Checker") return showToast("❌ Select checker");
    const clusterText = cluster? `${checker} | Cluster: ${cluster}` : checker;
    try {
      const { deliveryNo } = await exportPackingList(finalOutlet, boxes, order, { ...master, companyCode } as any, clusterText, profile?.alias || profile?.email?.split("@")[0]);
      await exportLabels(finalOutlet, boxes, master);
      const hist = JSON.parse(localStorage.getItem("outlet_history")||"[]");
      if(!hist.includes(finalOutlet.toUpperCase())){ hist.push(finalOutlet.toUpperCase()); localStorage.setItem("outlet_history", JSON.stringify(hist)); }
      // If outlet was auto-registered, also push to backend like Python validate_or_register_outlet does
      const upper = finalOutlet.trim().toUpperCase();
      if(!master.OUTLET_INFO?.[upper]){
        try { await fetch(`${(import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000"))}/api/outlet/register`, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ outlet_name: upper, outlet_data: { name: finalOutlet, phone: "", address: "", auto_registered: true, registered_at: new Date().toISOString() }})}); } catch {}
        // Update local master
        const newMaster = { ...master, OUTLET_INFO: { ...(master.OUTLET_INFO||{}), [upper]: { name: finalOutlet, phone: "", address: "" } } };
        setMaster(newMaster);
      }
      showToast(`💾 Exported ${deliveryNo} • ${boxes.length} Koli`);
    } catch(e:any){ showToast("❌ Export failed: "+e.message); }
  };

  const handleExport = async ()=>{
    if(!boxes.length) return showToast("❌ Calculate boxes first");
    if(!outlet.trim()) return showToast("❌ Enter outlet name");
    if(!checker || checker==="Select Checker") return showToast("❌ Select checker");
    const upper = outlet.trim().toUpperCase();
    if(master.OUTLET_INFO?.[upper]){
      await doExport(outlet);
      return;
    }
    // Typo guard like core.py validate_or_register_outlet
    const allOutlets = Object.keys(master.OUTLET_INFO || {});
    const similar = allOutlets.filter(o=> upper.includes(o) || o.includes(upper)).slice(0,5);
    setOutletGuard({ outlet, similar, onConfirm: async (final:string)=>{ setOutletGuard(null); setOutlet(final); await doExport(final); } });
  };

  // Exact port of core.py handle_drop / addons.py open_auto_mode stock validation
  const applyScanResults = (results: Record<string, {qty:number, note:string}>, company: "BBB"|"BBT", fileName: string) => {
    setCompanyCode(company);
    const next = { ...order };
    // For PDF, scanner note is "" like Python; for Excel it's FILE_SCAN — keep as is
    for(const [s,r] of Object.entries(results)){
      // pendingTotals already includes multipliers? Scanner returns raw qty, we need to apply multipliers like Python handle_drop does
      // But scanner's raw qty is before multiplier; we apply here
      let adj = r.qty;
      if(["Beef Patty Small","Beef Patty Large"].includes(s)) adj *= 18;
      else if(s==="Thousand Island Mayonaise") adj *= 20;
      else if(s==="Butter") adj *= 40;
      if(s in next) next[s]={ qty: next[s].qty + adj, note: r.note && !next[s].note.includes(r.note) ? `${next[s].note}/${r.note}`.replace(/^\/|\/$/g,"") : next[s].note || r.note };
      else next[s]={ qty: adj, note: r.note };
    }
    setOrder(next);
    showToast(`🎯 Scanned ${fileName}: ${Object.keys(results).length} SKUs [${company}]`);
  };

  // 1:1 port of core.py handle_drop — supports 2 files dragged simultaneously
  const handleFiles = async (files: File[])=>{
    if(files.length===0) return;
    let successCount = 0;
    const pendingTotals: Record<string, number> = {};
    const processedResults: { results: Record<string, {qty:number, note:string}>, company: "BBB"|"BBT", fileName: string }[] = [];
    let lastCompany: "BBB"|"BBT" = companyCode;
    const errors: string[] = [];

    for(const file of files){
      const ext = file.name.split(".").pop()?.toLowerCase();
      try {
        let data: { results: Record<string, {qty:number, note:string}>, company: "BBB"|"BBT" } | null = null;
        if(ext==="xlsx"||ext==="xls"){
          data = await smartScanExcel(file, master);
        } else if(ext==="pdf"){
          data = await smartScanPdf(file, master);
        } else {
          errors.push(`${file.name}: unsupported`);
          continue;
        }
        if(!data || Object.keys(data.results).length===0){
          // Like Python: scanned_results is {} is falsy? Python checks if not scanned_results, but we treat empty as no scan
          if(data && Object.keys(data.results).length===0) errors.push(`${file.name}: no SKUs`);
          continue;
        }
        successCount++;
        processedResults.push({ ...data, fileName: file.name });
        lastCompany = data.company;
        // Accumulate pendingTotals with multipliers like Python handle_drop
        for(const [sku, d] of Object.entries(data.results)){
          let adj = d.qty;
          if(["Beef Patty Small","Beef Patty Large"].includes(sku)) adj *= 18;
          else if(sku==="Thousand Island Mayonaise") adj *= 20;
          else if(sku==="Butter") adj *= 40;
          pendingTotals[sku] = (pendingTotals[sku] || 0) + adj;
        }
      } catch(e:any){
        const msg = e?.message || String(e);
        if(msg.includes("PT BANGOR") || msg.includes("Document does not belong")){
          showToast(`❌ ${file.name}: Verification Failed — Document does not belong to PT BANGOR`);
          errors.push(`${file.name}: Company verification failed`);
          continue;
        } else {
          errors.push(`${file.name}: ${msg}`);
        }
      }
    }

    if(successCount===0){
      if(errors.length) showToast(`❌ Scan failed: ${errors.join("; ")}`);
      else showToast("❌ Invalid file(s) dropped or scan failed.");
      return;
    }

    // Single stock validation for combined pendingTotals like Python
    let currentStock: Record<string, number> = {};
    try { currentStock = await apiGet("/api/current_stock"); } catch { currentStock = {}; }
    const shortages: {sku:string, req:number, avail:number, short:number}[] = [];
    for(const [sku, req] of Object.entries(pendingTotals)){
      const avail = currentStock[sku] ?? 0;
      if(avail < req) shortages.push({ sku, req, avail, short: req - avail });
    }
    if(shortages.length>0){
      // Show shortage modal once for combined files
      const combinedPending: Record<string, {qty:number, note:string}> = {};
      for(const pr of processedResults) for(const [k,v] of Object.entries(pr.results)) {
        if(combinedPending[k]) combinedPending[k].qty += v.qty;
        else combinedPending[k] = { ...v };
      }
      setShortage({ shortages, pending: combinedPending, company: lastCompany, fileName: files.map(f=> f.name).join(", ") });
      try { fetch(`${(import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000"))}/api/audit_logs`, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({user:"Operator", role:"Terminal", action_type:"STOCK_SHORTAGE", details:`Shortage on ${files.map(f=>f.name).join(", ")}: ${shortages.map(s=>`${s.sku} req ${s.req} avail ${s.avail}`).join("; ")}`})}); } catch {}
      // Store processedResults for force import
      (window as any).__pendingScanResults = processedResults;
      (window as any).__pendingCompany = lastCompany;
      return;
    }

    // No shortage — merge all like Python handle_drop is_safe branch
    const next = { ...order };
    for(const pr of processedResults){
      for(const [s,r] of Object.entries(pr.results)){
        let adj = r.qty;
        if(["Beef Patty Small","Beef Patty Large"].includes(s)) adj *= 18;
        else if(s==="Thousand Island Mayonaise") adj *= 20;
        else if(s==="Butter") adj *= 40;
        if(s in next) next[s]={ qty: next[s].qty + adj, note: r.note && !next[s].note.includes(r.note) ? `${next[s].note}/${r.note}`.replace(/^\/|\/$/g,"") : next[s].note || r.note };
        else next[s]={ qty: adj, note: r.note };
      }
    }
    setCompanyCode(lastCompany);
    setOrder(next);
    showToast(`🎯 Scanned ${successCount} file(s): ${Object.keys(pendingTotals).length} SKUs [${lastCompany}]`);
  };

  const handleFile = async (file: File)=> handleFiles([file]);

  const onDrop = (e: React.DragEvent)=>{
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if(files.length===1) handleFile(files[0]);
    else if(files.length>1) handleFiles(files);
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 grid grid-cols-12 gap-4">
      {/* Left column */}
      <div className="col-span-12 lg:col-span-4 space-y-4">
        {/* Destination */}
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="font-bold text-sm text-[#2c3e50] mb-3">📍 Destination Details</h3>
          <label className="text-xs font-bold">Outlet Name</label>
          <input list="outlets" value={outlet} onChange={e=> setOutlet(e.target.value)} placeholder="BANGOR PONDOK GEDE" className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
          <datalist id="outlets">
            {Object.keys(master.OUTLET_INFO||{}).map(o=> <option key={o} value={o} />)}
          </datalist>
          <div className="mt-3 bg-[#ecf0f1] rounded-lg p-3 text-xs border">
            <div className="font-bold">PREVIEW</div>
            <div>👤 Receiver: {outletInfo?.name||"-"}</div>
            <div>📞 Phone: {outletInfo?.phone||"-"}</div>
            <div>📍 Address: {outletInfo?.address||"Select an outlet to view details"}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div>
              <label className="text-xs font-bold">Assigned Checker</label>
              <select value={checker} onChange={e=> setChecker(e.target.value)} className="w-full mt-1 border rounded-lg px-2 py-2 text-sm">
                <option>Select Checker</option>
                {checkersList.map(c=> <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold">Cluster / Route</label>
              <input value={cluster} onChange={e=> setCluster(e.target.value)} placeholder="Cikarang / Cluster 1" className="w-full mt-1 border rounded-lg px-2 py-2 text-sm" />
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-2">Master Data: {syncState} • Delivery: {getDeliveryDateWIB(1, master.HOLIDAYS||[])} • Box Tolerance: {master.BOX_TOLERANCE}</div>
        </div>

        {/* Order Entry */}
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="font-bold text-sm text-[#2c3e50] mb-3">🍔 Order Entry</h3>
          <div className="flex gap-1 mb-3 flex-wrap">
            {[
              ["All","All"], ["❄️ Frozen","Frozen"], ["🥫 Sauce & Bread","Sauce"], ["📦 Pack","Pack"], ["👕 Merch","Merch"]
            ].map(([label,val])=>(
              <button key={val} onClick={()=> setFilter(val)} className={`px-2 py-1 text-xs rounded-full font-bold border ${filter===val?"bg-[#2c3e50] text-white":"bg-white"}`}>{label}</button>
            ))}
          </div>
          {/* Dropzone */}
          <div
            onDragOver={e=>{e.preventDefault(); setDragOver(true)}}
            onDragLeave={()=> setDragOver(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl p-4 text-center mb-3 ${dragOver?"bg-green-50 border-green-500":"bg-[#f9fafb] border-gray-300"}`}
          >
            <div className="text-sm font-extrabold">{dragOver?"📥 DROP FILE HERE":"📄 DRAG & DROP PDF / Excel HERE"}</div>
            <div className="text-xs text-gray-500">Supports Surat Jalan PDF & Excel (xlsx/xls) — same logic as core.py/addons.py</div>
            <label className="inline-block mt-1 px-3 py-1 bg-[#3498db] text-white rounded-full text-xs font-bold cursor-pointer">
              📂 Browse File(s) — PDF/Excel, 2 files supported
              <input type="file" accept=".xlsx,.xls,.pdf" multiple className="hidden" onChange={e=>{ const files = Array.from(e.target.files || []); if(files.length===1) handleFile(files[0]); else if(files.length>1) handleFiles(files); (e.target as HTMLInputElement).value=""; }} />
            </label>
          </div>

          <label className="text-xs font-bold">Select SKU</label>
          <select value={sku} onChange={e=> setSku(e.target.value)} className="w-full mt-1 border rounded-lg px-2 py-2 text-sm">
            {filteredSkus.map(s=> <option key={s} value={s}>{s} ({master.BOX_CAPACITY[s]}/box)</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label className="text-xs font-bold">Quantity (Base)</label>
              <input value={qty} onChange={e=> setQty(e.target.value)} placeholder="e.g. 2" className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold">Note</label>
              <select value={note} onChange={e=> setNote(e.target.value)} className="w-full mt-1 border rounded-lg px-2 py-2 text-sm">
                <option value="BGB">BGB</option><option value="BBB">BBB</option><option value="✓">✓</option><option value="FILE_SCAN">FILE_SCAN</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button onClick={handleAdd} className="bg-[#27ae60] text-white rounded-lg py-2 font-bold text-sm">+ Add Item</button>
            <button onClick={handleSub} className="bg-[#e74c3c] text-white rounded-lg py-2 font-bold text-sm">- Subtract</button>
          </div>
        </div>

        {/* System Actions */}
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="font-bold text-sm text-[#2c3e50] mb-3">⚙️ System Actions</h3>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleCalculate} className="bg-[#3498db] text-white rounded-lg py-2 font-bold text-sm">🧮 Calculate Routing</button>
            <button onClick={handleExport} className="bg-[#27ae60] text-white rounded-lg py-2 font-bold text-sm">💾 Export & Save</button>
            <button onClick={()=> (document.querySelector<HTMLInputElement>('input[type=file]')?.click())} className="bg-[#9b59b6] text-white rounded-lg py-2 font-bold text-sm">📂 Scanner</button>
            <button onClick={async()=>{
              try{ const md=await apiGet("/api/master_data"); setMaster(md); showToast("✅ Master Data Refreshed");}
              catch{ showToast("❌ Sync failed");}
            }} className="bg-[#16a085] text-white rounded-lg py-2 font-bold text-sm">🔄 Live Sync</button>
            <button onClick={()=> showToast("🖨️ Printer routing uses browser print — configure in system dialog")} className="bg-gray-400 text-white rounded-lg py-1 font-bold text-xs">🖨️ Printer Settings</button>
            <button onClick={()=> showToast(`📊 Shift Total: ${Object.values(order).reduce((a,b)=>a+b.qty,0)} units`)} className="bg-[#f39c12] text-white rounded-lg py-1 font-bold text-xs">📊 Shift Report</button>
            <button onClick={()=> window.open("/live","_blank")} className="bg-[#3498db] text-white rounded-lg py-1 font-bold text-xs">📡 Live Board</button>
            <button onClick={()=> window.open("/admin","_blank")} className="bg-[#9b59b6] text-white rounded-lg py-1 font-bold text-xs">💳 Wallet / Admin</button>
          </div>
          <button onClick={clearOrder} className="w-full mt-2 bg-[#e74c3c] text-white rounded-lg py-2 font-bold text-sm">🗑️ CLEAR CURRENT ORDER</button>
        </div>
      </div>

      {/* Right column - Active Manifest */}
      <div className="col-span-12 lg:col-span-8 bg-white rounded-xl shadow p-4 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm text-[#2c3e50]">📋 Active Manifest</h3>
          <div className="text-right">
            <div className="text-xs">👤 Logged In As: {profile?.alias || profile?.email}</div>
            <div className={`text-xs font-bold ${liveEstimate? "text-[#27ae60]":"text-gray-400"}`}>📦 Live Koli Estimate: {liveEstimate}</div>
          </div>
        </div>
        <div className="border rounded-lg overflow-hidden flex-1">
          <div className="overflow-auto max-h-[520px]">
            <table className="w-full text-sm">
              <thead className="bg-[#f4f6f9] sticky top-0">
                <tr><th className="text-left p-2">SKU Name</th><th className="p-2">Qty</th><th className="p-2">UOM</th><th className="p-2">Notes</th><th className="p-2">Action</th></tr>
              </thead>
              <tbody>
                {Object.keys(order).length===0 && <tr><td colSpan={5} className="text-center p-8 text-gray-400">📦 Drag & Drop a file or Add Items to begin...</td></tr>}
                {Object.entries(order).map(([s, d], idx)=>(
                  <tr key={s} className={idx%2?"bg-[#f9fafb]":"bg-white"}>
                    <td className="p-2">{s}</td>
                    <td className="p-2 text-center">
                      <span className="inline-flex items-center gap-1">
                        <button onClick={()=> subItem(s,1)} className="w-6 h-6 rounded bg-gray-200">−</button>
                        <span className="w-12 text-center">{d.qty}</span>
                        <button onClick={()=> addItem(s,1,d.note)} className="w-6 h-6 rounded bg-gray-200">+</button>
                      </span>
                    </td>
                    <td className="p-2 text-center"><span className="px-2 py-1 rounded bg-[#ecf0f1] text-xs font-mono">{master.ITEM_UOM?.[s] || "Pack"}</span></td>
                    <td className="p-2 text-center">
                      {editingNote===s ? (
                        <input
                          autoFocus
                          defaultValue={d.note}
                          className="w-full border rounded px-1 py-0.5 text-xs text-center"
                          onBlur={(e)=>{ setItemNote(s, e.target.value); setEditingNote(null); }}
                          onKeyDown={(e)=>{ if(e.key==="Enter"){ setItemNote(s, (e.target as HTMLInputElement).value); setEditingNote(null); } if(e.key==="Escape") setEditingNote(null); }}
                        />
                      ) : (
                        <span onClick={()=> setEditingNote(s)} className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded text-xs" title="Click to edit note">{d.note || "—"}</span>
                      )}
                    </td>
                    <td className="p-2 text-center"><button onClick={()=>{
                      const n={...order}; delete n[s]; setOrder(n);
                    }} className="text-xs text-red-600">🗑️ Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {boxes.length>0 && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
            ✅ Pre-Flight Approved: <b>{boxes.length} Koli</b> ready for print — Outlet: <b>{outlet||"Draft Order"}</b>
          </div>
        )}
      </div>

      {/* Reviewer Modal — 1:1 with addons.py open_koli_reviewer */}
      {showReviewer && (
        <KoliReviewer
          outlet={outlet || "Draft Order"}
          boxes={workingBoxes}
          onApprove={(final)=>{
            setBoxes(final);
            setShowReviewer(false);
            showToast(`✅ ${final.length} Koli Approved`);
          }}
          onClose={()=> setShowReviewer(false)}
        />
      )}

      {shortage && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="bg-[#c0392b] text-white rounded-t-xl px-4 py-3 text-center">
              <div className="text-base font-extrabold">🚨 Stock Shortage — {shortage.shortages.length} SKUs</div>
              <div className="text-xs opacity-90 truncate">{shortage.fileName} • {shortage.company}</div>
            </div>
            <div className="p-3 flex-1 overflow-hidden flex flex-col min-h-0">
              <div className="border rounded-lg overflow-hidden flex-1 flex flex-col min-h-0">
                <div className="max-h-[38vh] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f4f6f9] sticky top-0 z-10"><tr><th className="p-1.5 text-left">SKU</th><th className="p-1.5">Req</th><th className="p-1.5">Have</th><th className="p-1.5 text-red-600">Short</th></tr></thead>
                    <tbody>{shortage.shortages.map(s=> <tr key={s.sku} className="border-t hover:bg-gray-50"><td className="p-1.5 font-medium truncate max-w-[180px]" title={s.sku}>{s.sku}</td><td className="p-1.5 text-center">{s.req}</td><td className="p-1.5 text-center text-gray-500">{s.avail}</td><td className="p-1.5 text-center font-bold text-red-600">-{s.short}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
              <div className="text-[11px] text-gray-500 mt-2">Admin notified • {shortage.shortages.length} items exceed stock. Choose action.</div>
            </div>
            <div className="p-3 flex gap-2 border-t bg-gray-50 rounded-b-xl">
              <button onClick={()=> { setShortage(null); (window as any).__pendingScanResults=null; showToast("⚠️ Import cancelled"); }} className="flex-1 bg-white border border-gray-300 text-gray-700 rounded-lg py-2.5 font-bold text-sm">Cancel</button>
              <button onClick={()=> { const d=shortage; const pendingResults = (window as any).__pendingScanResults as any[] | undefined; setShortage(null); (window as any).__pendingScanResults=null; (window as any).__pendingCompany=null; if(pendingResults && pendingResults.length>0){ const next={...order}; for(const pr of pendingResults){ for(const [s,r] of Object.entries(pr.results as any)){ let adj=(r as any).qty; if(["Beef Patty Small","Beef Patty Large"].includes(s)) adj*=18; else if(s==="Thousand Island Mayonaise") adj*=20; else if(s==="Butter") adj*=40; const note=(r as any).note; if(s in next) next[s]={ qty: next[s].qty+adj, note: note && !next[s].note.includes(note) ? `${next[s].note}/${(r as any).note}`.replace(/^\/|\/$/g,"") : next[s].note||note }; else next[s]={ qty:adj, note }; } } if(d) setCompanyCode(d.company); setOrder(next); } else if(d) applyScanResults(d.pending, d.company, d.fileName); showToast("⚠️ Force imported"); }} className="flex-1 bg-[#f39c12] text-white rounded-lg py-2.5 font-bold text-sm">Force Import</button>
            </div>
          </div>
        </div>
      )}

      {outletGuard && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="bg-[#f4f6f9] rounded-t-xl p-4 text-center border-b">
              <div className="text-lg font-extrabold text-[#e74c3c]">🆕 NEW OUTLET DETECTED</div>
              <div className="text-sm text-gray-600">"{outletGuard.outlet}" is not in Master Data — like core.py validate_or_register_outlet</div>
            </div>
            <div className="p-4">
              {outletGuard.similar.length>0 ? (
                <div>
                  <div className="text-sm font-bold mb-2">Did you mean one of these?</div>
                  <div className="space-y-2">
                    {outletGuard.similar.map(s=> <button key={s} onClick={()=> outletGuard.onConfirm(s)} className="w-full text-left px-3 py-2 border rounded-lg hover:bg-[#ecf0f1] text-sm"> {s} </button>)}
                    <button onClick={()=> outletGuard.onConfirm(outletGuard.outlet)} className="w-full text-left px-3 py-2 border-2 border-[#e74c3c] rounded-lg bg-red-50 text-sm font-bold text-[#e74c3c]">No — create it as NEW outlet: {outletGuard.outlet.toUpperCase()}</button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-600">No similar outlets found. Will create as new outlet.</div>
              )}
            </div>
            <div className="p-4 flex gap-2">
              <button onClick={()=> setOutletGuard(null)} className="flex-1 bg-gray-200 rounded-lg py-2 font-bold text-sm">❌ Cancel</button>
              <button onClick={()=> outletGuard.onConfirm(outletGuard.outlet)} className="flex-1 bg-[#27ae60] text-white rounded-lg py-2 font-bold text-sm">✅ Confirm & Export</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-4 right-4 bg-[#2c3e50] text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold z-50">{toast}</div>}
    </div>
  );
}
