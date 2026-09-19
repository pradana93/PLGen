// Remastered Dashboard — separate tab. Multi-DO/IT aggregate scan → per-outlet
// resolve → per-outlet koli review → one multi-sheet workbook (full PL per sheet).
// Core math untouched: per-outlet calculateBoxes (packing.ts), kode tiers (scanner.ts),
// toPackedQty multipliers (packing.ts, same as Dashboard scan path), PL/ numbering
// (packing.ts getNextDeliveryNumber, shared per-company counters with Legacy).
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api";
import { calculateBoxes, getNextDeliveryNumber, toPackedQty, Box, Order } from "../lib/packing";
import { smartScanPdfSections, smartScanExcelSections, OutletSection } from "../lib/remasteredScan";
import { resolveOutlet, companyForOutlet, sheetNameFor } from "../lib/outletResolver";
import { exportRemasteredWorkbook, RemasteredSheet } from "../lib/remasteredExport";
import { usePackingStore } from "../store/usePackingStore";
import { useAuth } from "../context/AuthContext";
import KoliReviewer from "../components/KoliReviewer";

type V2Outlet = {
  key: string; // ref
  ref: string;
  outletRaw: string;
  canonical: string | null;
  matchKind: "exact" | "fuzzy" | "unmatched" | "manual";
  company: "BBB" | "BBT";
  order: Order;
  boxes: Box[];
  reviewed: boolean;
  excluded: boolean;
  deliveryNo: string | null;
};

const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");

export default function RemasteredDashboard(){
  const { profile } = useAuth();
  const { setMaster } = usePackingStore();
  const [master, setMasterLocal] = useState<any>(null);
  const [checkersList, setCheckersList] = useState<string[]>(["Masroor","Aji","Fadly","Luthfi"]);
  const [checker, setChecker] = useState("Select Checker");
  const [cluster, setCluster] = useState("");
  const [outlets, setOutlets] = useState<V2Outlet[]>([]);
  const [toast, setToast] = useState<string|null>(null);
  const [scanning, setScanning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reviewKey, setReviewKey] = useState<string|null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{file:string;pages:number;textChars:number;rowsTotal:number;refsSeen:number;textSample:string;rowSample:string[]}[]>([]);

  useEffect(()=>{
    (async()=>{
      try {
        const md = await apiGet("/api/master_data");
        setMasterLocal(md);
        try { setMaster(md); } catch {}
        const ch = await apiGet("/api/checkers");
        if(ch.checkers) setCheckersList(ch.checkers);
      } catch {}
    })();
  },[]);

  const showToast = (msg:string)=>{ setToast(msg); setTimeout(()=> setToast(null), 3000); };

  const buildOutlet = (sec: OutletSection, md: any): V2Outlet | null => {
    if (Object.keys(sec.results).length === 0) return null;
    const m = resolveOutlet(sec.outletRaw, md);
    const canonical = m.canonical;
    const company = companyForOutlet(canonical, sec.outletRaw);
    // packed qty via shared toPackedQty — same rule as Dashboard scan path
    const order: Order = {};
    for (const [sku, r] of Object.entries(sec.results)) {
      const qty = toPackedQty(sku, (r as any).qty);
      order[sku] = { qty, note: (r as any).note || "" };
    }
    const boxes = calculateBoxes(order, md);
    return { key: sec.ref, ref: sec.ref, outletRaw: sec.outletRaw, canonical, matchKind: m.kind as any, company, order, boxes, reviewed: false, excluded: false, deliveryNo: null };
  };

  const handleFiles = async (files: File[])=>{
    if(!master) return showToast("Master not loaded yet — wait a moment");
    setScanning(true);
    try {
      const merged = new Map<string, V2Outlet>();
      const debugs: string[] = [];
      const dbgRows: {file:string;pages:number;textChars:number;rowsTotal:number;refsSeen:number;textSample:string;rowSample:string[]}[] = [];
      for (const file of files) {
        const isXlsx = /\.xlsx?$/i.test(file.name);
        const data = isXlsx ? await smartScanExcelSections(file, master) : await smartScanPdfSections(file, master);
        if (data.debug) {
          debugs.push(`${file.name}: ${data.debug.pages}p/${data.debug.textChars}ch/${data.debug.rowsTotal}rows/${data.debug.refsSeen}refs`);
          dbgRows.push({ file: file.name, ...data.debug });
        }
        for (const sec of data.sections) {
          const built = buildOutlet(sec, master);
          if (!built) continue;
          const prev = merged.get(built.key);
          if (prev) {
            // same ref twice → merge quantities (packed), recalc koli
            const next: Order = { ...prev.order };
            for (const [sku, it] of Object.entries(built.order)) {
              if (next[sku]) next[sku] = { qty: next[sku].qty + (it as any).qty, note: next[sku].note || (it as any).note };
              else next[sku] = { ...(it as any) };
            }
            prev.order = next;
            prev.boxes = calculateBoxes(next, master);
            prev.reviewed = false;
          } else merged.set(built.key, built);
        }
      }
      const list = [...merged.values()];
      setDebugInfo(dbgRows);
      if (!list.length) showToast(`No scannable outlet sections found (${debugs.join(" • ") || "no text extracted — scanned-image PDF? try Excel export"})`);
      else { setDebugInfo([]); showToast(`Scanned ${list.length} outlets`); }
      setOutlets(prev => {
        const map = new Map(prev.map(o => [o.key, o]));
        for (const o of list) if (!map.has(o.key)) map.set(o.key, o);
        return [...map.values()];
      });
    } catch(e:any){ showToast(e?.message || "Scan failed"); }
    setScanning(false);
  };

  const setCanonical = (key: string, canonical: string)=>{
    setOutlets(prev => prev.map(o => o.key===key ? { ...o, canonical: canonical || null, matchKind: canonical ? "manual" as const : "unmatched" as const, company: companyForOutlet(canonical || null, o.outletRaw), reviewed: false } : o));
  };

  const reviewOutlet = useMemo(()=> outlets.find(o=>o.key===reviewKey) || null,[outlets, reviewKey]);

  const included = outlets.filter(o=>!o.excluded && Object.keys(o.order).length>0);
  const bbbCount = included.filter(o=>o.company==="BBB").length;
  const bbtCount = included.filter(o=>o.company==="BBT").length;
  const totalKoli = included.reduce((a,o)=>a+o.boxes.length,0);

  const handleExportAll = async ()=>{
    if(!included.length) return showToast("Nothing to export");
    if(!checker || checker==="Select Checker") return showToast("Pick a checker first");
    const unreviewed = included.filter(o=>!o.reviewed);
    if(unreviewed.length && !confirm(`${unreviewed.length} outlet(s) not koli-reviewed. Export anyway?`)) return;
    const bad = included.filter(o=>!o.canonical);
    if(bad.length && !confirm(`${bad.length} outlet(s) have no master match (${bad.map(o=>o.outletRaw).join(", ")}). Export with scanned names?`)) return;
    setExporting(true);
    try {
      const checkerDisplay = cluster ? `${checker} | Cluster: ${cluster}` : checker;
      const preparedBy = profile?.alias || profile?.email?.split("@")[0];
      const used = new Set<string>();
      // Sequential PL/ numbers per company — same counters as Legacy Dashboard
      const sheets: RemasteredSheet[] = included.map(o=>{
        const deliveryNo = getNextDeliveryNumber(o.company);
        return {
          tabName: sheetNameFor(o.canonical || o.outletRaw, used),
          outlet: (o.canonical || o.outletRaw).toUpperCase(),
          boxes: o.boxes, order: o.order, companyCode: o.company,
          deliveryNo, sourceRef: o.ref,
        };
      });
      const { blob, filename } = await exportRemasteredWorkbook(sheets, master, checkerDisplay, preparedBy);
      // Per-sheet posts — same 4 calls as Legacy export, looped (board + Digital PL entries per sheet)
      let ok = 0;
      for (const s of sheets) {
        const o = included.find(x=>x.ref===s.sourceRef)!;
        const totalWeight = Object.entries(o.order).reduce((acc,[sku,d]:any)=> acc + (d.qty*(master.ITEM_WEIGHT_GRAMS?.[sku]||0))/1000, 0);
        try {
          await fetch(`${base}/api/packing_status`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({delivery_no:s.deliveryNo,outlet:s.outlet,checker:checkerDisplay,status:"PENDING",total_weight_kg:Number(totalWeight.toFixed(2))})});
          await fetch(`${base}/api/track_item_usage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({delivery_no:s.deliveryNo,outlet:s.outlet,items:Object.fromEntries(Object.entries(o.order).map(([k,v]:any)=>[k,v.qty]))})});
          await fetch(`${base}/api/digital_pl/${encodeURIComponent(s.deliveryNo)}/snapshot`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({boxes:o.boxes})});
          const fd = new FormData();
          fd.append("file", blob, filename);
          fd.append("delivery_no", s.deliveryNo);
          fd.append("outlet", s.outlet);
          await fetch(`${base}/api/upload_packing_list`,{method:"POST",body:fd});
          ok++;
        } catch(e){ console.warn("remastered post failed for", s.deliveryNo, e); }
      }
      setOutlets(prev => prev.map(o=>{
        const s = sheets.find(x=>x.sourceRef===o.ref);
        return s ? { ...o, deliveryNo: s.deliveryNo } : o;
      }));
      showToast(`Exported ${ok}/${sheets.length} PL sheets`);
    } catch(e:any){ showToast(e?.message || "Export failed"); }
    setExporting(false);
  };

  const masterKeys = useMemo(()=> Object.keys(master?.OUTLET_INFO||{}).sort(),[master]);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="bg-gradient-to-br from-[#0f1e2e] via-[#1a2f4a] to-[#2c3e50] text-white rounded-[24px] border border-white/10 shadow-[0_24px_64px_rgba(0,0,0,0.28)] p-5 md:p-6 relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-48 h-48 bg-white/[0.06] rounded-full blur-2xl pointer-events-none" />
        <div className="relative flex items-center gap-3 flex-wrap">
          <div className="w-12 h-12 rounded-2xl bg-white text-[#0f1e2e] flex items-center justify-center text-xl shadow-lg">⚡</div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-[18px] tracking-tight">Remastered Dashboard</span>
              <span className="text-[10px] font-bold tracking-widest bg-white text-[#0f1e2e] px-2 py-0.5 rounded-full">V2 • MULTI-OUTLET</span>
            </div>
            <div className="text-xs text-white/60 mt-1">Aggregate scan → per-outlet resolve → koli review → one multi-sheet file. Legacy Dashboard untouched.</div>
          </div>
          <div className="ml-auto flex gap-2 text-[11px] font-black">
            <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15">BBB ×{bbbCount}</span>
            <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15">BBT ×{bbtCount}</span>
            <span className="px-3 py-1.5 rounded-full bg-emerald-500 text-white">{totalKoli} koli</span>
          </div>
        </div>
      </div>

      {toast && <div className="text-xs font-semibold p-3 rounded-2xl border bg-[#0f1e2e] text-white border-white/10">{toast}</div>}

      {outlets.length===0 && debugInfo.length>0 && (
        <details className="bg-white/95 rounded-[20px] border border-amber-300 shadow p-5 text-xs">
          <summary className="cursor-pointer font-black text-[#0f1e2e]">🔍 Scan diagnostics — expand and send me this text</summary>
          {debugInfo.map((d,i)=>(
            <div key={i} className="mt-3 space-y-2">
              <div className="font-mono font-bold">{d.file} — {d.pages}p/{d.textChars}ch/{d.rowsTotal}rows/{d.refsSeen}refs</div>
              <div>
                <div className="font-bold text-slate-500">TEXT SAMPLE (first 2000 chars):</div>
                <pre className="mt-1 max-h-48 overflow-auto bg-slate-900 text-emerald-200 rounded-xl p-3 whitespace-pre-wrap break-all font-mono text-[11px]">{d.textSample || "(empty)"}</pre>
              </div>
              <div>
                <div className="font-bold text-slate-500">FIRST {Math.min(30,d.rowSample.length)} ROWS:</div>
                <pre className="mt-1 max-h-48 overflow-auto bg-slate-50 border rounded-xl p-3 whitespace-pre-wrap break-all font-mono text-[11px]">{d.rowSample.map((r,j)=>`${j+1}. ${r}`).join("\n") || "(none)"}</pre>
              </div>
            </div>
          ))}
        </details>
      )}

      <div
        onDragOver={e=>{e.preventDefault();setDragOver(true);}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false); handleFiles([...e.dataTransfer.files]);}}
        className={`bg-white/95 rounded-[20px] border-2 border-dashed p-6 text-center transition ${dragOver?"border-emerald-400 bg-emerald-50":"border-slate-200"}`}
      >
        <div className="text-2xl">📄</div>
        <div className="font-black text-[#0f1e2e]">Drop Surat Jalan PDFs / Excel here</div>
        <div className="text-xs text-slate-400 mt-1">Multi-DO/IT files split per outlet • box SKUs (Dus Logo/Medium) ignored by design</div>
        <label className="inline-block mt-3 px-5 py-2.5 rounded-xl bg-[#0f1e2e] text-white text-sm font-black cursor-pointer hover:bg-black">
          {scanning ? "Scanning…" : "Browse files"}
          <input type="file" multiple accept=".pdf,.xlsx,.xls" className="hidden" onChange={e=>{ if(e.target.files) handleFiles([...e.target.files]); e.target.value=""; }} />
        </label>
      </div>

      <div className="bg-white/95 rounded-[20px] border border-white/40 shadow p-5 grid grid-cols-1 md:grid-cols-3 gap-2">
        <select value={checker} onChange={e=>setChecker(e.target.value)} className="border rounded-xl px-3 py-2.5 text-sm bg-slate-50">
          <option>Select Checker</option>
          {checkersList.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <input value={cluster} onChange={e=>setCluster(e.target.value)} placeholder="Cluster (optional)" className="border rounded-xl px-3 py-2.5 text-sm bg-slate-50" />
        <button onClick={handleExportAll} disabled={exporting || !included.length} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl py-2.5 font-black text-sm shadow active:scale-[0.99]">
          {exporting ? "Exporting…" : `Export ${included.length} sheets → 1 file`}
        </button>
      </div>

      {outlets.length>0 && (
        <div className="bg-white/95 rounded-[20px] border border-white/40 shadow p-5">
          <div className="font-black text-[15px] text-[#0f1e2e] mb-1">Scanned outlets ({outlets.length}) — click a card for koli review</div>
          <div className="text-[11px] text-slate-400 mb-3">DOC numbers issued sequentially per company at export, like the current Dashboard</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {outlets.map(o=>(
              <div key={o.key} className={`rounded-2xl border-2 p-3.5 transition ${o.excluded?"opacity-50 bg-slate-50 border-slate-200":o.deliveryNo?"bg-emerald-50 border-emerald-300":"bg-white border-slate-200 hover:border-slate-300"}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${o.company==="BBT"?"bg-violet-100 text-violet-700":"bg-sky-100 text-sky-700"}`}>{o.company}</span>
                  <span className="font-mono text-[11px] font-bold text-slate-500 truncate">{o.ref}</span>
                  {o.deliveryNo && <span className="ml-auto text-[10px] font-mono font-bold text-emerald-600">{o.deliveryNo}</span>}
                </div>
                <div className="font-black text-sm text-[#0f1e2e] mt-1 truncate" title={o.outletRaw}>{o.canonical || o.outletRaw}</div>
                {o.canonical ? (
                  <div className={`text-[11px] mt-0.5 font-bold ${o.matchKind==="exact"||o.matchKind==="manual"?"text-emerald-600":"text-amber-600"}`}>
                    {o.matchKind==="manual" ? "✓ matched manually" : o.matchKind==="exact" ? "✓ master match" : "~ fuzzy match — verify"}
                  </div>
                ) : (
                  <select value="" onChange={e=>setCanonical(o.key, e.target.value)} className="mt-1.5 w-full border border-amber-300 rounded-lg px-2 py-1.5 text-xs bg-amber-50">
                    <option value="">⚠ No master match — pick outlet…</option>
                    {masterKeys.map(k=><option key={k} value={k}>{k}</option>)}
                  </select>
                )}
                <div className="text-[11px] text-slate-500 mt-1">{Object.keys(o.order).length} SKUs • {o.boxes.length} koli {o.reviewed && <span className="text-emerald-600 font-bold">• reviewed ✓</span>}</div>
                <div className="flex gap-1.5 mt-2">
                  <button onClick={()=>setReviewKey(o.key)} className="flex-1 px-3 py-1.5 rounded-lg bg-[#0f1e2e] text-white text-xs font-black hover:bg-black">Koli review</button>
                  <button onClick={()=>setOutlets(prev=>prev.map(x=>x.key===o.key?{...x,excluded:!x.excluded}:x))} className="px-3 py-1.5 rounded-lg border text-xs font-bold hover:bg-slate-50">{o.excluded?"Include":"Skip"}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {reviewOutlet && (
        <div className="fixed inset-0 bg-[#0f1e2e]/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={()=>setReviewKey(null)}>
          <div className="bg-white rounded-[20px] w-full max-w-4xl max-h-[90vh] overflow-auto" onClick={e=>e.stopPropagation()}>
            <KoliReviewer
              outlet={reviewOutlet.canonical || reviewOutlet.outletRaw}
              boxes={reviewOutlet.boxes}
              onApprove={(final)=>{ setOutlets(prev=>prev.map(o=>o.key===reviewOutlet.key?{...o,boxes:final,reviewed:true}:o)); setReviewKey(null); showToast(`${reviewOutlet.ref} koli approved (${final.length})`); }}
              onClose={()=>setReviewKey(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
