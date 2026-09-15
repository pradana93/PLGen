import { useEffect, useMemo, useState } from "react";
import { usePackingStore } from "../store/usePackingStore";
import { calculateBoxes, getDeliveryDateWIB } from "../lib/packing";
import { apiGet } from "../lib/api";
import { exportLabels, exportPackingList } from "../lib/exportExcel";
import * as XLSX from "xlsx";

export default function Dashboard(){
  const { master, order, boxes, outlet, checker, cluster, setMaster, setOrder, setOutlet, setChecker, setCluster, addItem, subItem, clearOrder, setBoxes } = usePackingStore();
  const [sku, setSku] = useState("Beef Patty Small");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("BGB");
  const [filter, setFilter] = useState<string>("All");
  const [showReviewer, setShowReviewer] = useState(false);
  const [workingBoxes, setWorkingBoxes] = useState<any[]>([]);
  const [checkersList, setCheckersList] = useState<string[]>(["Masroor","Aji","Fadly","Luthfi"]);
  const [syncState, setSyncState] = useState("Local Backup 💾");
  const [toast, setToast] = useState<string|null>(null);
  const [dragOver, setDragOver] = useState(false);

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

  const handleExport = async ()=>{
    if(!boxes.length) return showToast("❌ Calculate boxes first");
    if(!outlet) return showToast("❌ Enter outlet name");
    if(!checker || checker==="Select Checker") return showToast("❌ Select checker");
    const clusterText = cluster? `${checker} | Cluster: ${cluster}` : checker;
    try {
      const { deliveryNo } = await exportPackingList(outlet, boxes, order, master, clusterText);
      await exportLabels(outlet, boxes, master);
      // outlet history local
      const hist = JSON.parse(localStorage.getItem("outlet_history")||"[]");
      if(!hist.includes(outlet.toUpperCase())){ hist.push(outlet.toUpperCase()); localStorage.setItem("outlet_history", JSON.stringify(hist)); }
      showToast(`💾 Exported ${deliveryNo} • ${boxes.length} Koli`);
    } catch(e:any){ showToast("❌ Export failed: "+e.message); }
  };

  const handleFile = async (file: File)=>{
    const ext = file.name.split(".").pop()?.toLowerCase();
    if(ext==="xlsx"||ext==="xls"){
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header:1 });
      // Simple scan: look for known SKUs in first column + qty in next cells
      const kodeMap: Record<string,string> = {};
      Object.entries(master.KODE_BARANG||{}).forEach(([k,v])=> kodeMap[String(k).toLowerCase()] = v as string);
      const skuLookup: Record<string,string> = {};
      Object.keys(master.BOX_CAPACITY).forEach(s=> skuLookup[s.toLowerCase()] = s);
      const results: Record<string, {qty:number, note:string}> = {};
      for(const row of rows){
        const rowStr = (row as any[]).join(" ").toLowerCase();
        let found: string|null=null;
        // kode first
        for(const k of Object.keys(kodeMap).sort((a,b)=>b.length-a.length)){ if(rowStr.includes(k)){ found=kodeMap[k]; break; } }
        if(!found) for(const k of Object.keys(skuLookup).sort((a,b)=>b.length-a.length)){ if(rowStr.includes(k)){ found=skuLookup[k]; break; } }
        if(found){
          // find qty: first number in row after sku
          for(const cell of (row as any[]).slice(1)){
            const nums = String(cell).replace(/\./g,"").replace(/,/g,"").match(/\d+/);
            if(nums){ const q=parseInt(nums[0],10); if(q>0){ results[found] = { qty: (results[found]?.qty||0)+q, note:"FILE_SCAN" }; break; } }
          }
        }
      }
      if(Object.keys(results).length){
        const next = { ...order };
        for(const [s,r] of Object.entries(results)){
          let adj=r.qty;
          if(["Beef Patty Small","Beef Patty Large"].includes(s)) adj*=1; // already base? keep as is for web
          if(s in next) next[s]={ qty: next[s].qty+adj, note: next[s].note.includes(r.note)?next[s].note:`${next[s].note}/${r.note}` };
          else next[s]={ qty: adj, note: r.note };
        }
        setOrder(next);
        showToast(`🎯 Scanned ${file.name}: ${Object.keys(results).length} SKUs`);
      } else showToast("❌ No SKUs found in file");
    } else if(ext==="pdf"){
      showToast("📄 PDF scan requires backend converter — please use Excel for web version or upload via desktop app");
    }
  };

  const onDrop = (e: React.DragEvent)=>{
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if(f) handleFile(f);
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
            <div className="text-sm font-extrabold">{dragOver?"📥 DROP FILE HERE":"📄 DRAG & DROP xlsx HERE"}</div>
            <div className="text-xs text-gray-500">or</div>
            <label className="inline-block mt-1 px-3 py-1 bg-[#3498db] text-white rounded-full text-xs font-bold cursor-pointer">
              📂 Browse File
              <input type="file" accept=".xlsx,.xls,.pdf" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) handleFile(f); }} />
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
            <div className="text-xs">👤 Logged In As: Operator (Web)</div>
            <div className={`text-xs font-bold ${liveEstimate? "text-[#27ae60]":"text-gray-400"}`}>📦 Live Koli Estimate: {liveEstimate}</div>
          </div>
        </div>
        <div className="border rounded-lg overflow-hidden flex-1">
          <div className="overflow-auto max-h-[520px]">
            <table className="w-full text-sm">
              <thead className="bg-[#f4f6f9] sticky top-0">
                <tr><th className="text-left p-2">SKU Name</th><th className="p-2">Qty</th><th className="p-2">Notes</th><th className="p-2">Action</th></tr>
              </thead>
              <tbody>
                {Object.keys(order).length===0 && <tr><td colSpan={4} className="text-center p-8 text-gray-400">📦 Drag & Drop a file or Add Items to begin...</td></tr>}
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
                    <td className="p-2 text-center">{d.note}</td>
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

      {/* Reviewer Modal */}
      {showReviewer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-bold">📦 Koli Pre-Flight Check: {outlet||"Draft Order"}</h3>
              <p className="text-xs text-gray-500">Drag concept: use Move controls to adjust. Total Koli: {workingBoxes.length}</p>
            </div>
            <div className="overflow-auto p-4 flex-1 space-y-3">
              {workingBoxes.map((box, idx)=>(
                <div key={idx} className="border rounded-lg p-3 bg-[#f9fafb]">
                  <div className="font-bold text-sm mb-2">📦 KOLI {idx+1} (Total Items: {Object.values(box).reduce((a:number,b:any)=>a+Number(b),0)})</div>
                  {Object.entries(box).map(([sku2,qty])=>(
                    <div key={sku2} className="flex justify-between text-sm py-1 border-b last:border-0">
                      <span>{sku2}</span><span className="font-bold">{String(qty)}</span>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-2">
                    <button onClick={()=>{
                      const nb=[...workingBoxes];
                      nb.splice(idx,1);
                      setWorkingBoxes(nb);
                    }} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Remove Koli</button>
                  </div>
                </div>
              ))}
              <button onClick={()=> setWorkingBoxes([...workingBoxes, {}])} className="w-full border-2 border-dashed rounded-lg p-3 text-sm">+ Add Empty Koli</button>
            </div>
            <div className="p-4 border-t flex gap-2 justify-end">
              <button onClick={()=> setShowReviewer(false)} className="px-4 py-2 rounded-lg bg-gray-200 text-sm">Cancel</button>
              <button onClick={handleConfirmReviewer} className="px-6 py-2 rounded-lg bg-[#27ae60] text-white font-bold text-sm">✅ Confirm & Approve</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-4 right-4 bg-[#2c3e50] text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold z-50">{toast}</div>}
    </div>
  );
}
