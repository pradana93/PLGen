import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPut } from "../lib/api";
import { useLanguage } from "../i18n";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, Legend, Cell
} from "recharts";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

type Summary = {
  topSku: { sku: string; qty: number; kg: number; uom: string }[];
  topOutlet: { outlet: string; count: number; tonnage: number }[];
  monthly: { month: string; tonnage: number; pl: number }[];
  totals: { totalPL: number; totalTonnage: number; totalUsageRows: number };
};

const COLORS = ["#2c3e50","#3498db","#27ae60","#e67e22","#8e44ad","#16a085","#c0392b","#f39c12","#2980b9","#d35400"];

function formatKg(v:number){ return `${v.toLocaleString()} kg`; }

export default function LiveBoard(){
  const { t } = useLanguage();
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === "SuperAdmin";
  const [data, setData]=useState<any[]>([]);
  const [filter, setFilter]=useState("");
  const [summary, setSummary]=useState<Summary|null>(null);
  const [loading, setLoading]=useState(true);
  const [range, setRange]=useState<"all"|"30d"|"90d">("all");
  const [skuMetric, setSkuMetric]=useState<"qty"|"kg">("qty");
  const [showLive, setShowLive]=useState(false);
  const [archive, setArchive]=useState<any[]>([]);
  const [archiveFilter, setArchiveFilter]=useState("");

  const fetchAll=async()=>{
    setLoading(true);
    try{
      const [ps, sum, arch] = await Promise.all([
        apiGet("/api/packing_status").catch(()=>[]),
        apiGet("/api/report/summary").catch(()=>null),
        apiGet("/api/packing_lists").catch(()=>[]),
      ]);
      setData(Array.isArray(ps)?ps:[]);
      if(sum) setSummary(sum);
      if(Array.isArray(arch)) setArchive(arch);
    }catch{}
    setLoading(false);
  };

  const handleDownload = async (deliveryNo:string)=>{
    try{
      const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");
      const r = await fetch(`${base}/api/packing_lists/${encodeURIComponent(deliveryNo)}/download`);
      if(!r.ok){ const j=await r.json().catch(()=>({})); throw new Error((j as any).error||`${r.status}`); }
      const ct = r.headers.get("Content-Type")||"";
      if(ct.includes("application/json")){
        const j = await r.json() as any;
        if(j.url){
          window.open(j.url, "_blank");
          return;
        }
      } else {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a=document.createElement("a");
        a.href=url; a.download=`${deliveryNo}.xlsx`; a.click();
        setTimeout(()=> URL.revokeObjectURL(url), 2000);
      }
    }catch(e:any){ alert(`Download failed: ${e.message||e}`); }
  };

  const handleDelete = async (deliveryNo:string)=>{
    if(!isSuperAdmin) return alert("Only SuperAdmin can delete.");
    if(!confirm(`Delete ${deliveryNo}?\nThis will remove the PL from packing_status, item_usage, and Storage — Data Report (Top 25 SKU, Top 10 Outlets, Monthly Tonnage/PL) will update automatically. This cannot be undone.`)) return;
    try{
      const { data } = await supabase.auth.getSession() as any;
      const token = data?.session?.access_token;
      const base = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");
      const r = await fetch(`${base}/api/packing_lists/${encodeURIComponent(deliveryNo)}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} as any });
      const j = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error((j as any).error || `${r.status}`);
      alert(`Deleted ${deliveryNo} — ${j.deleted?.packing_status||0} PL, ${j.deleted?.item_usage||0} usage, ${j.deleted?.files||0} files`);
      fetchAll();
    }catch(e:any){ alert(`Delete failed: ${e.message||e}`); }
  };

  const exportReportExcel = async ()=>{
    if(!summary) return alert("No data to export");
    const wb = new ExcelJS.Workbook();
    wb.creator = "PLGen Data Report";
    const nav = "#FF2C3E50";
    const addSheet = (name:string, headers:string[], rows:any[][])=>{
      const ws = wb.addWorksheet(name);
      ws.getRow(1).values = headers;
      ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getRow(1).fill = { type:"pattern", pattern:"solid", fgColor:{ argb: nav } };
      ws.getRow(1).alignment = { horizontal:"center", vertical:"middle" };
      rows.forEach(r=> ws.addRow(r));
      ws.columns.forEach((c:any)=> c.width = 18);
      if(name==="Top 25 SKU") ws.getColumn(1).width = 32;
      if(name==="Top 10 Outlets") ws.getColumn(1).width = 28;
      ws.views = [{ state:"frozen", ySplit:1 }];
    };
    addSheet("Summary", ["Metric","Value"], [
      ["Report Generated (WIB)", new Date().toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})],
      ["Total PL Exported", kpi.totalPL],
      ["Total Tonnage (kg)", kpi.totalTonnage],
      ["Avg kg / PL", avgWeight.toFixed(2)],
      ["Unique SKUs (ranked)", summary.topSku.length],
      ["Active Outlets (top 10)", summary.topOutlet.length],
      ["Usage Rows", kpi.totalUsageRows],
      ["Range", range],
    ]);
    addSheet("Top 25 SKU", ["Rank","SKU","Qty","Tonnage (kg)","UOM"], topSkuDisplay.map((r,i)=> [i+1, r.sku, r.qty, r.kg, r.uom]));
    addSheet("Top 10 Outlets", ["Rank","Outlet","PL Count","Tonnage (kg)"], summary.topOutlet.map((r,i)=> [i+1, r.outlet, r.count, r.tonnage]));
    addSheet("Monthly", ["Month","PL","Tonnage (kg)","Avg kg/PL"], monthlyFiltered.map(m=> [m.month, m.pl, m.tonnage, m.pl? (m.tonnage/m.pl).toFixed(1):"—"]));
    // Archive sheet
    const archRows = archive.slice(0,500).map(a=> [a.delivery_no, a.outlet, a.checker||"-", a.status, a.total_weight_kg||0, a.created_at||"—", a.hasFile?"Yes":"No"]);
    addSheet("Archive PL", ["Delivery No","Outlet","Checker","Status","Tonnage (kg)","Created WIB","File in Storage"], archRows);
    const buf = await wb.xlsx.writeBuffer();
    const ts = new Date().toISOString().slice(0,10);
    saveAs(new Blob([buf]), `PLGen_Data_Report_${ts}.xlsx`);
  };

  const exportReportCSV = ()=>{
    if(!summary) return alert("No data");
    const esc = (v:any)=> `"${String(v??"").replace(/"/g,'""')}"`;
    const sections:string[] = [];
    sections.push("Summary");
    sections.push(["Metric","Value"].map(esc).join(","));
    [["Total PL",kpi.totalPL],["Total Tonnage kg",kpi.totalTonnage],["Avg kg/PL",avgWeight.toFixed(2)],["Range",range]].forEach(r=> sections.push(r.map(esc).join(",")));
    sections.push("");
    sections.push("Top 25 SKU");
    sections.push(["Rank","SKU","Qty","Tonnage kg","UOM"].map(esc).join(","));
    topSkuDisplay.forEach((r,i)=> sections.push([i+1,r.sku,r.qty,r.kg,r.uom].map(esc).join(",")));
    sections.push("");
    sections.push("Top 10 Outlets");
    sections.push(["Rank","Outlet","PL Count","Tonnage kg"].map(esc).join(","));
    summary.topOutlet.forEach((r,i)=> sections.push([i+1,r.outlet,r.count,r.tonnage].map(esc).join(",")));
    sections.push("");
    sections.push("Monthly");
    sections.push(["Month","PL","Tonnage kg","Avg"].map(esc).join(","));
    monthlyFiltered.forEach(m=> sections.push([m.month,m.pl,m.tonnage,m.pl?(m.tonnage/m.pl).toFixed(1):""].map(esc).join(",")));
    const csv = sections.join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const ts = new Date().toISOString().slice(0,10);
    saveAs(blob, `PLGen_Data_Report_${ts}.csv`);
  };
  useEffect(()=>{ fetchAll(); const id=setInterval(fetchAll, 30000); return ()=>clearInterval(id); },[]);

  const filtered = data.filter(e=> !filter || e.outlet?.toLowerCase().includes(filter.toLowerCase()) || e.delivery_no?.toLowerCase().includes(filter.toLowerCase()));

  // Derived KPIs (supports range filtering on monthly only for now; sku/outlet are overall — keeps core simple)
  const topSkuDisplay = useMemo(()=>{
    if(!summary) return [];
    const arr = [...summary.topSku];
    // sort by selected metric
    if(skuMetric==="kg") arr.sort((a,b)=> b.kg - a.kg);
    return arr.slice(0,25);
  },[summary, skuMetric]);

  const monthlyFiltered = useMemo(()=>{
    if(!summary) return [];
    if(range==="all") return summary.monthly;
    // assume summary.monthly sorted asc; take last N months
    const n = range==="30d" ? 2 : 4; // 30d ~ 1-2 months, 90d ~ 3-4 months
    return summary.monthly.slice(-n);
  },[summary, range]);

  const kpi = summary?.totals || { totalPL: data.length, totalTonnage: 0, totalUsageRows: 0 };
  const avgWeight = kpi.totalPL ? (kpi.totalTonnage / kpi.totalPL) : 0;

  return (
    <div className="max-w-[1400px] mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#2c3e50] via-[#34495e] to-[#2c3e50] rounded-2xl shadow-lg p-5 text-white overflow-hidden relative">
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
        <div className="absolute -left-10 -bottom-10 w-24 h-24 bg-emerald-400/10 rounded-full blur-xl" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center backdrop-blur-sm shrink-0">📊</div>
            <div>
              <div className="text-lg font-extrabold tracking-tight">Data Report</div>
              <div className="text-xs text-white/70">Top SKU • Valuable Outlets • Monthly Tonnage & PL — PythonAnywhere primary</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={range} onChange={e=> setRange(e.target.value as any)} className="bg-white/10 border border-white/15 rounded-lg px-3 py-1.5 text-xs font-bold backdrop-blur-sm">
              <option value="all" className="text-slate-800">All Time</option>
              <option value="90d" className="text-slate-800">Last 90 Days</option>
              <option value="30d" className="text-slate-800">Last 30 Days</option>
            </select>
            <button onClick={exportReportExcel} className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-extrabold shadow hover:bg-emerald-600">⬇ Excel</button>
            <button onClick={exportReportCSV} className="px-3 py-1.5 bg-white/10 border border-white/20 text-white rounded-lg text-xs font-extrabold hover:bg-white/20">CSV</button>
            <button onClick={fetchAll} className="px-3 py-1.5 bg-white text-[#2c3e50] rounded-lg text-xs font-extrabold shadow hover:bg-gray-100">↻ Refresh</button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow p-4 border border-slate-200/60">
          <div className="text-[11px] font-bold tracking-widest text-slate-500">TOTAL PL EXPORTED</div>
          <div className="text-2xl font-extrabold text-[#2c3e50] mt-1">{loading ? "—" : kpi.totalPL.toLocaleString()}</div>
          <div className="text-xs text-gray-500">{kpi.totalUsageRows} usage rows</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border border-slate-200/60">
          <div className="text-[11px] font-bold tracking-widest text-slate-500">TOTAL TONNAGE</div>
          <div className="text-2xl font-extrabold text-emerald-600 mt-1">{loading ? "—" : formatKg(kpi.totalTonnage)}</div>
          <div className="text-xs text-gray-500">avg {avgWeight.toFixed(1)} kg / PL</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border border-slate-200/60">
          <div className="text-[11px] font-bold tracking-widest text-slate-500">UNIQUE SKUS TRACKED</div>
          <div className="text-2xl font-extrabold text-[#3498db] mt-1">{loading ? "—" : (summary?.topSku.length||0)}</div>
          <div className="text-xs text-gray-500">Top 25 shown</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border border-slate-200/60">
          <div className="text-[11px] font-bold tracking-widest text-slate-500">ACTIVE OUTLETS</div>
          <div className="text-2xl font-extrabold text-[#8e44ad] mt-1">{loading ? "—" : (summary?.topOutlet.length||0)}</div>
          <div className="text-xs text-gray-500">Top 10 valuable</div>
        </div>
      </div>

      {/* Top 25 SKU */}
      <div className="bg-white rounded-2xl shadow p-4 border border-slate-200/60">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-sm text-[#2c3e50]">🏆 Top 25 SKU Exported</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 hidden md:block">Metric:</span>
            <div className="inline-flex rounded-full border p-0.5 bg-slate-100">
              <button onClick={()=> setSkuMetric("qty")} className={`px-3 py-1 text-xs font-bold rounded-full ${skuMetric==="qty"?"bg-[#2c3e50] text-white":"text-gray-600"}`}>Qty</button>
              <button onClick={()=> setSkuMetric("kg")} className={`px-3 py-1 text-xs font-bold rounded-full ${skuMetric==="kg"?"bg-emerald-600 text-white":"text-gray-600"}`}>Kg</button>
            </div>
          </div>
        </div>
        {!summary || topSkuDisplay.length===0 ? (
          <div className="text-center p-8 text-gray-400 text-sm">No SKU data yet — export a Packing List to populate <code>/api/track_item_usage</code>.</div>
        ) : (
          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSkuDisplay} layout="vertical" margin={{ left: 12, right: 24, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="sku" type="category" width={160} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v:any, n:any)=> [n==="qty"? `${v} ${topSkuDisplay[0]?.uom||""}` : formatKg(Number(v)), n==="qty"?"Qty":"Tonnage"]} />
                <Bar dataKey={skuMetric} fill={skuMetric==="qty" ? "#2c3e50" : "#27ae60"} radius={[0,6,6,0]} barSize={12}>
                  {topSkuDisplay.map((_,i)=> <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {summary && <div className="text-[11px] text-gray-400 mt-2">Sorted by {skuMetric==="qty"?"quantity":"tonnage"} • {summary.topSku.length} SKUs ranked</div>}
      </div>

      {/* Top 10 Outlet + Monthly */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top 10 Outlet */}
        <div className="bg-white rounded-2xl shadow p-4 border border-slate-200/60">
          <h3 className="font-extrabold text-sm text-[#2c3e50] mb-3">💎 Top 10 Most Valuable Outlets <span className="text-xs font-normal text-gray-500">(by tonnage)</span></h3>
          {!summary || summary.topOutlet.length===0 ? (
            <div className="text-center p-8 text-gray-400 text-sm">No outlet data yet.</div>
          ) : (
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.topOutlet} layout="vertical" margin={{ left: 0, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="outlet" type="category" width={140} tick={{ fontSize: 9 }} tickFormatter={(v:string)=> v.length>18? v.slice(0,18)+"…":v} />
                  <Tooltip formatter={(v:any, n:any)=> n==="tonnage"? formatKg(Number(v)) : `${v} PL`} />
                  <Legend />
                  <Bar dataKey="tonnage" name="Tonnage (kg)" fill="#8e44ad" radius={[0,6,6,0]} barSize={14} />
                  <Bar dataKey="count" name="PL Count" fill="#3498db" radius={[0,6,6,0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="grid grid-cols-1 gap-1.5 mt-3 max-h-[140px] overflow-auto pr-1">
            {summary?.topOutlet.map((o,i)=>(
              <div key={o.outlet} className="flex items-center justify-between text-xs bg-slate-50 border rounded-lg px-2.5 py-1.5">
                <span className="flex items-center gap-2 truncate"><span className="w-5 h-5 rounded-full bg-[#2c3e50] text-white flex items-center justify-center text-[10px] font-bold shrink-0">{i+1}</span><span className="font-bold truncate">{o.outlet}</span></span>
                <span className="text-gray-500 shrink-0">{o.count} PL • {formatKg(o.tonnage)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly */}
        <div className="bg-white rounded-2xl shadow p-4 border border-slate-200/60">
          <h3 className="font-extrabold text-sm text-[#2c3e50] mb-3">📅 Monthly Tonnage & Exported PL</h3>
          {!summary || monthlyFiltered.length===0 ? (
            <div className="text-center p-8 text-gray-400 text-sm">No monthly data — {summary?.monthly.length||0} months tracked.</div>
          ) : (
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyFiltered} margin={{ left: 0, right: 12, top: 10 }}>
                  <defs>
                    <linearGradient id="tonG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#27ae60" stopOpacity={0.4}/><stop offset="95%" stopColor="#27ae60" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v:any, n:any)=> n==="tonnage"? formatKg(Number(v)) : `${v} PL`} />
                  <Legend />
                  <Area yAxisId="left" type="monotone" dataKey="tonnage" name="Tonnage (kg)" stroke="#27ae60" fill="url(#tonG)" strokeWidth={2} dot />
                  <Line yAxisId="right" type="monotone" dataKey="pl" name="PL Count" stroke="#2c3e50" strokeWidth={2.5} dot={{ r:3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          {/* Monthly table */}
          <div className="mt-3 border rounded-xl overflow-hidden">
            <div className="max-h-[140px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#f4f6f9] sticky top-0"><tr><th className="p-2 text-left">Month</th><th className="p-2 text-center">PL</th><th className="p-2 text-right">Tonnage</th><th className="p-2 text-right">Avg / PL</th></tr></thead>
                <tbody>
                  {monthlyFiltered.slice().reverse().map(m=>(
                    <tr key={m.month} className="border-t hover:bg-gray-50">
                      <td className="p-2 font-mono font-bold">{m.month}</td>
                      <td className="p-2 text-center">{m.pl}</td>
                      <td className="p-2 text-right">{formatKg(m.tonnage)}</td>
                      <td className="p-2 text-right text-gray-500">{m.pl? (m.tonnage/m.pl).toFixed(1):"—"} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Packing Lists Archive — auto-uploaded PLs, downloadable (Supabase Storage) */}
      <div className="bg-white rounded-2xl shadow p-4 border border-slate-200/60">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-sm text-[#2c3e50]">📦 Exported PL Archive <span className="ml-2 text-xs font-normal text-gray-500">({archive.length} files — Supabase Storage)</span></h3>
          <input value={archiveFilter} onChange={e=> setArchiveFilter(e.target.value)} placeholder="Filter outlet / DO..." className="border rounded-lg px-3 py-1.5 text-xs w-48" />
        </div>
        {archive.length===0 ? (
          <div className="text-center p-6 text-gray-400 text-sm">No PLs yet — export from Dashboard to auto-upload.</div>
        ) : (
          <div className="overflow-auto border rounded-xl max-h-[320px]">
            <table className="w-full text-xs">
              <thead className="bg-[#f4f6f9] sticky top-0"><tr><th className="p-2 text-left">Delivery No</th><th className="p-2 text-left">Outlet</th><th className="p-2">PL</th><th className="p-2">Status</th><th className="p-2">Created (WIB)</th><th className="p-2">File</th><th className="p-2 text-center">Actions</th></tr></thead>
              <tbody>
                {archive.filter((a:any)=> !archiveFilter || String(a.outlet||"").toLowerCase().includes(archiveFilter.toLowerCase()) || String(a.delivery_no||"").toLowerCase().includes(archiveFilter.toLowerCase())).slice(0,100).map((a:any)=>(
                  <tr key={a.delivery_no} className="border-t hover:bg-gray-50">
                    <td className="p-2 font-mono font-bold">{a.delivery_no}</td>
                    <td className="p-2 truncate max-w-[180px]">{a.outlet}</td>
                    <td className="p-2 text-center">{a.total_weight_kg||0} kg</td>
                    <td className="p-2 text-center"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${a.status==="READY"?"bg-emerald-100 text-emerald-700":"bg-amber-100 text-amber-700"}`}>{a.status}</span></td>
                    <td className="p-2 text-[11px]">{a.created_at||"—"}</td>
                    <td className="p-2 text-center">{a.hasFile ? "✅" : "—"}</td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={()=> handleDownload(a.delivery_no)} className="text-xs bg-[#2c3e50] text-white px-2.5 py-1 rounded-full font-bold hover:bg-[#34495e]">⬇</button>
                        {isSuperAdmin && <button onClick={()=> handleDelete(a.delivery_no)} title="Delete — SuperAdmin only" className="text-xs bg-white border border-red-200 text-red-600 px-2 py-1 rounded-full font-bold hover:bg-red-50">🗑️</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-[11px] text-gray-400 mt-2">Files stored in Supabase Storage bucket <code>packing-lists</code> per delivery folder — downloadable via signed URL (1h) or direct stream. Auto-upload happens on every Dashboard export.</div>
      </div>

      {/* Live Stream — preserved, collapsible, not removed */}
      <div className="bg-white rounded-2xl shadow border border-slate-200/60 overflow-hidden">
        <button onClick={()=> setShowLive(!showLive)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50">
          <span className="font-bold text-sm text-[#2c3e50]">🔴 Live Stream — Packing Status <span className="ml-2 text-xs font-normal text-gray-500">({filtered.length}/{data.length})</span></span>
          <span className={`text-xs font-bold px-2 py-1 rounded-full border ${showLive?"bg-[#2c3e50] text-white":"bg-white"}`}>{showLive?"Hide":"Show"}</span>
        </button>
        {showLive && (
          <div className="p-4 border-t">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-sm">{t("live.title")}</h4>
              <div className="flex gap-2">
                <input value={filter} onChange={e=> setFilter(e.target.value)} placeholder={t("live.filter")} className="border rounded-lg px-3 py-1.5 text-sm" />
                <button onClick={fetchAll} className="px-3 py-1.5 bg-[#3498db] text-white rounded-lg text-sm font-bold">↻ {t("live.refresh")}</button>
              </div>
            </div>
            <div className="overflow-auto border rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-[#f4f6f9] sticky top-0"><tr><th className="p-2 text-left">{t("live.deliveryNo")}</th><th className="p-2">{t("live.outlet")}</th><th className="p-2">{t("live.checker")}</th><th className="p-2">{t("live.status")}</th><th className="p-2">{t("live.scannedAt")}</th><th className="p-2">{t("live.created")}</th><th className="p-2">{t("live.weight")}</th><th className="p-2">{t("dash.action")}</th></tr></thead>
                <tbody>
                  {filtered.length===0 && <tr><td colSpan={8} className="text-center p-8 text-gray-400">{t("live.noData")}</td></tr>}
                  {filtered.map((e:any)=>(
                    <tr key={e.delivery_no} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-mono text-xs">{e.delivery_no}</td>
                      <td className="p-2">{e.outlet}</td>
                      <td className="p-2">{e.checker}</td>
                      <td className="p-2"><span className={`px-2 py-1 rounded-full text-xs font-bold ${e.status==="READY"?"bg-emerald-100 text-emerald-700":e.status==="CANCELLED"?"bg-red-100 text-red-700":"bg-amber-100 text-amber-700"}`}>{e.status==="READY"?t("live.ready"): e.status==="CANCELLED"?t("live.cancelled"):t("live.packing")}</span></td>
                      <td className="p-2">{e.scanned_at||"--:--:--"}</td>
                      <td className="p-2 text-xs">{e.created_at}</td>
                      <td className="p-2">{e.total_weight_kg||0} kg</td>
                      <td className="p-2">
                        {e.status!=="READY" && <button onClick={async()=>{ await apiPut(`/api/packing_status/${encodeURIComponent(e.delivery_no)}`,{status:"READY"}); fetchAll(); }} className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700">{t("live.markReady")}</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 p-3 bg-[#ecf0f1] rounded-xl">
              <h4 className="font-bold text-sm mb-1">{t("live.override")}</h4>
              <p className="text-xs text-gray-600">{t("live.overrideDesc")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
