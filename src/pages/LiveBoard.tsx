import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPut } from "../lib/api";
import { useLanguage } from "../i18n";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, Legend, Cell,
  PieChart, Pie
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
  const isBoardAdmin = profile?.role === "SuperAdmin" || profile?.role === "Admin";
  const [plView, setPlView] = useState<any|null>(null);
  const [data, setData]=useState<any[]>([]);
  const [filter, setFilter]=useState("");
  const [summary, setSummary]=useState<Summary|null>(null);
  const [loading, setLoading]=useState(true);
  const [range, setRange]=useState<"all"|"30d"|"90d">("all");
  const [skuMetric, setSkuMetric]=useState<"qty"|"kg">("qty");
  const [skuView, setSkuView]=useState<"bar"|"barH"|"doughnut"|"pie"|"line">("bar");
  const [dateFrom, setDateFrom]=useState<string>("");
  const [dateTo, setDateTo]=useState<string>("");
  const [activePie, setActivePie]=useState<number>(0);
  const [showLive, setShowLive]=useState(false);
  const [livePage, setLivePage]=useState(1);
  const [livePageSize, setLivePageSize]=useState<25|50|100>(50);
  const [liveStatus, setLiveStatus]=useState<"ALL"|"PENDING"|"READY"|"CANCELLED">("ALL");
  const [archive, setArchive]=useState<any[]>([]);
  const [archiveFilter, setArchiveFilter]=useState("");
  const [checkers, setCheckers]=useState<string[]>([]);
  const [editingChecker, setEditingChecker]=useState<string|null>(null);
  const [editCheckerVal, setEditCheckerVal]=useState<string>("");

  const buildSummaryQs = ()=>{
    if(dateFrom || dateTo) {
      const p = new URLSearchParams();
      if(dateFrom) p.set("from", dateFrom);
      if(dateTo) p.set("to", dateTo);
      return `/api/report/summary?${p.toString()}`;
    }
    return "/api/report/summary";
  };

  const fetchAll=async()=>{
    setLoading(true);
    try{
      const [ps, sum, arch, ch] = await Promise.all([
        apiGet("/api/packing_status").catch(()=>[]),
        apiGet(buildSummaryQs()).catch(()=>null),
        apiGet("/api/packing_lists").catch(()=>[]),
        apiGet("/api/checkers").catch(()=>({ checkers: [] })),
      ]);
      setData(Array.isArray(ps)?ps:[]);
      if(sum) setSummary(sum);
      if(Array.isArray(arch)) setArchive(arch);
      if(ch?.checkers) setCheckers(ch.checkers);
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

  const handleCheckerUpdate = async (deliveryNo:string)=>{
    if(!editCheckerVal || editCheckerVal===archive.find((a:any)=> a.delivery_no===deliveryNo)?.checker) { setEditingChecker(null); return; }
    if(!confirm(`Change checker for ${deliveryNo} to "${editCheckerVal}"?`)) return;
    try{
      await apiPut(`/api/packing_status/${encodeURIComponent(deliveryNo)}`, { checker: editCheckerVal });
      setEditingChecker(null);
      fetchAll();
    }catch(e:any){ alert(`Update failed: ${e.message||e}`); }
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
  // Re-fetch summary when calendar range changes (packing_status poll stays 30s, summary re-fetches on apply)
  useEffect(()=>{ if(dateFrom || dateTo) fetchAll(); else if(!dateFrom && !dateTo) fetchAll(); },[dateFrom, dateTo]);
  // Reset page when filters change
  useEffect(()=>{ setLivePage(1); },[filter, liveStatus, livePageSize, dateFrom, dateTo]);

  const inCalendarRange = (ts:string)=>{
    if(!dateFrom && !dateTo) return true;
    const m = String(ts||"").match(/^(\d{4}-\d{2}-\d{2})/);
    if(!m) return false;
    const d = m[1];
    if(dateFrom && d < dateFrom) return false;
    if(dateTo && d > dateTo) return false;
    return true;
  };

  const filtered = data.filter(e=>{
    const hit = !filter || e.outlet?.toLowerCase().includes(filter.toLowerCase()) || e.delivery_no?.toLowerCase().includes(filter.toLowerCase());
    const statusHit = liveStatus==="ALL" || String(e.status||"").toUpperCase()===liveStatus;
    return hit && statusHit && inCalendarRange(String(e.created_at||""));
  });
  const liveTotal = filtered.length;
  const liveTotalPages = Math.max(1, Math.ceil(liveTotal / livePageSize));
  const livePaginated = filtered.slice((livePage-1)*livePageSize, livePage*livePageSize);
  const filteredArchive = archive.filter((a:any)=>{
    const hit = !archiveFilter || String(a.outlet||"").toLowerCase().includes(archiveFilter.toLowerCase()) || String(a.delivery_no||"").toLowerCase().includes(archiveFilter.toLowerCase()) || String(a.checker||"").toLowerCase().includes(archiveFilter.toLowerCase());
    return hit && inCalendarRange(String(a.created_at||""));
  });

  const topSkuDisplay = useMemo(()=>{
    if(!summary) return [];
    const arr = [...summary.topSku];
    if(skuMetric==="kg") arr.sort((a,b)=> b.kg - a.kg);
    return arr.slice(0,25);
  },[summary, skuMetric]);

  const monthlyFiltered = useMemo(()=>{
    if(!summary) return [];
    if(range==="all") return summary.monthly;
    const n = range==="30d" ? 2 : 4;
    return summary.monthly.slice(-n);
  },[summary, range]);

  const checkerLeaderboard = useMemo(()=>{
    if(!data.length) return [];
    const map: Record<string, { count:number, tonnage:number, last:string, first:string }> = {};
    for(const p of data){
      const c = String(p.checker||"Unknown").trim() || "Unknown";
      if(!map[c]) map[c]={count:0, tonnage:0, last: p.created_at||"", first: p.created_at||""};
      map[c].count+=1;
      map[c].tonnage+=Number(p.total_weight_kg||0);
      if(String(p.created_at) > String(map[c].last)) map[c].last = p.created_at;
      if(String(p.created_at) < String(map[c].first)) map[c].first = p.created_at;
    }
    const now = Date.now();
    const arr = Object.entries(map).map(([checker, v])=>{
      const first = new Date(v.first).getTime();
      const days = isNaN(first) ? 1 : Math.max(1, Math.ceil((now - first)/(1000*60*60*24)));
      const plPerDay = v.count / days;
      const relevant = data.filter((p:any)=> String(p.checker||"Unknown").trim()===checker && p.scanned_at && p.created_at);
      let avgMinutes = 0;
      if(relevant.length){
        let totalMin=0, cnt=0;
        for(const r of relevant){
          cnt++; totalMin += 0;
        }
        avgMinutes = cnt? Math.round(totalMin/cnt):0;
      }
      return { checker, count: v.count, tonnage: Math.round(v.tonnage*10)/10, avgKg: v.count? Math.round((v.tonnage/v.count)*10)/10 : 0, last: v.last, plPerDay: Math.round(plPerDay*10)/10, avgMinutes };
    });
    arr.sort((a,b)=> b.tonnage - a.tonnage || b.count - a.count);
    return arr;
  },[data]);

  const weeklyCheckerData = useMemo(()=>{
    if(!data.length || !checkerLeaderboard.length) return [];
    const topChecker = checkerLeaderboard[0]?.checker;
    if(!topChecker) return [];
    const weeks: Record<string, number> = {};
    for(const p of data){
      if(String(p.checker||"Unknown").trim()!==topChecker) continue;
      const d = new Date(String(p.created_at||"").replace(" ","T"));
      if(isNaN(d.getTime())) continue;
      const day = d.getDay();
      const diff = d.getDate() - day + (day===0 ? -6 : 1);
      const mon = new Date(d); mon.setDate(diff);
      const key = mon.toISOString().slice(0,10);
      weeks[key] = (weeks[key]||0)+1;
    }
    return Object.entries(weeks).sort(([a],[b])=> a.localeCompare(b)).slice(-8).map(([week, pl])=> ({ week: week.slice(5), pl }));
  },[data, checkerLeaderboard]);

  const kpi = summary?.totals || { totalPL: data.length, totalTonnage: 0, totalUsageRows: 0 };
  const avgWeight = kpi.totalPL ? (kpi.totalTonnage / kpi.totalPL) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <style>{`
        @keyframes lb-shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes lb-fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lb-pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
        @keyframes lb-countUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .lb-section { animation: lb-fadeUp 0.4s ease-out both; }
        .lb-section:nth-child(2) { animation-delay: 0.05s; }
        .lb-section:nth-child(3) { animation-delay: 0.10s; }
        .lb-section:nth-child(4) { animation-delay: 0.15s; }
        .lb-section:nth-child(5) { animation-delay: 0.20s; }
        .lb-section:nth-child(6) { animation-delay: 0.25s; }
        .lb-section:nth-child(7) { animation-delay: 0.30s; }
        .lb-section:nth-child(8) { animation-delay: 0.35s; }
        .lb-kpi-value { animation: lb-countUp 0.5s ease-out both; }
        .lb-shimmer-header {
          background: linear-gradient(110deg, #1a252f 0%, #2c3e50 25%, #3d566e 50%, #2c3e50 75%, #1a252f 100%);
          background-size: 200% 100%;
          animation: lb-shimmer 8s linear infinite;
        }
        .lb-card-hover { transition: all 0.25s cubic-bezier(0.4,0,0.2,1); }
        .lb-card-hover:hover { transform: translateY(-3px); box-shadow: 0 12px 32px -8px rgba(0,0,0,0.12); }
        .lb-glass { background: rgba(255,255,255,0.72); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        .lb-pulse-live { animation: lb-pulse-dot 2s ease-in-out infinite; }
        .lb-row-hover { transition: background-color 0.15s ease; }
        .lb-row-hover:hover { background-color: rgba(44,62,80,0.04); }
      `}</style>

      <div className="max-w-[1400px] mx-auto p-6 space-y-5">

          {/* ── Premium Header ── */}
        <div className="lb-section lb-shimmer-header rounded-2xl shadow-xl p-6 text-white overflow-hidden relative">
          {/* Decorative orbs */}
          <div className="absolute -right-16 -top-16 w-48 h-48 bg-white/[0.04] rounded-full blur-3xl" />
          <div className="absolute -left-12 -bottom-12 w-36 h-36 bg-emerald-400/[0.08] rounded-full blur-2xl" />
          <div className="absolute right-1/4 top-0 w-24 h-24 bg-blue-400/[0.06] rounded-full blur-xl" />
          <div className="relative flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.1] border border-white/[0.15] flex items-center justify-center backdrop-blur-sm shadow-lg shadow-black/10">
                  <span className="text-xl">📊</span>
                </div>
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight leading-tight">Data Report</h1>
                  <p className="text-[13px] text-white/60 font-medium mt-0.5">Top SKU · Premium Outlets · Monthly Tonnage & PL Analytics</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <select value={range} onChange={e=> setRange(e.target.value as any)} className="bg-white/[0.1] border border-white/[0.15] rounded-xl px-4 py-2 text-xs font-bold backdrop-blur-sm text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all cursor-pointer">
                  <option value="all" className="text-slate-800">All Time</option>
                  <option value="90d" className="text-slate-800">Last 90 Days</option>
                  <option value="30d" className="text-slate-800">Last 30 Days</option>
                </select>
                <button onClick={exportReportExcel} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-400/30 transition-all active:scale-95">⬇ Excel</button>
                <button onClick={exportReportCSV} className="px-4 py-2 bg-white/[0.1] border border-white/[0.2] text-white hover:bg-white/[0.18] rounded-xl text-xs font-extrabold transition-all active:scale-95">CSV</button>
                <button onClick={fetchAll} className="px-4 py-2 bg-white text-[#1a252f] hover:bg-gray-100 rounded-xl text-xs font-extrabold shadow-lg shadow-black/10 transition-all active:scale-95">↻ Refresh</button>
              </div>
            </div>
            {/* Flagship Calendar Filter */}
            <div className="flex flex-col md:flex-row md:items-center gap-3 bg-white/[0.08] border border-white/[0.12] rounded-2xl p-3 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-xs font-extrabold tracking-widest text-white/90">
                <span className="w-8 h-8 rounded-xl bg-white text-[#1a252f] flex items-center justify-center text-sm shadow">📅</span>
                CALENDAR FILTER
                {(dateFrom || dateTo) && <span className="ml-1 px-2 py-0.5 rounded-full bg-emerald-400 text-white text-[10px]">ACTIVE</span>}
              </div>
              <div className="flex items-center gap-2 flex-wrap flex-1">
                <label className="flex items-center gap-1.5 bg-white rounded-xl px-3 py-2 border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-black tracking-widest text-slate-400">FROM</span>
                  <input type="date" value={dateFrom} onChange={e=> setDateFrom(e.target.value)} className="text-xs font-bold text-[#1a252f] bg-transparent focus:outline-none cursor-pointer" />
                </label>
                <span className="text-white/60 font-bold">—</span>
                <label className="flex items-center gap-1.5 bg-white rounded-xl px-3 py-2 border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-black tracking-widest text-slate-400">TO</span>
                  <input type="date" value={dateTo} onChange={e=> setDateTo(e.target.value)} className="text-xs font-bold text-[#1a252f] bg-transparent focus:outline-none cursor-pointer" />
                </label>
                <div className="flex items-center gap-1.5 ml-1">
                  <button onClick={()=> {setDateFrom(""); setDateTo("");}} className="px-3 py-2 bg-white/[0.12] border border-white/20 text-white rounded-xl text-xs font-bold hover:bg-white/[0.18] transition">Clear</button>
                  <button onClick={fetchAll} className="px-3 py-2 bg-white text-[#1a252f] rounded-xl text-xs font-extrabold shadow hover:bg-gray-100 transition">Apply</button>
                </div>
                <span className="hidden lg:block text-[11px] text-white/50 ml-auto">Filters Top 25 SKU, Top Outlets, Monthly, Archive & Live Stream • WIB</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="lb-section grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "TOTAL PL EXPORTED", value: loading ? "—" : kpi.totalPL.toLocaleString(), sub: `${kpi.totalUsageRows} usage rows`, color: "from-[#2c3e50] to-[#34495e]", accent: "bg-[#2c3e50]", icon: "📋" },
            { label: "TOTAL TONNAGE", value: loading ? "—" : formatKg(kpi.totalTonnage), sub: `avg ${avgWeight.toFixed(1)} kg / PL`, color: "from-emerald-500 to-emerald-600", accent: "bg-emerald-500", icon: "⚖️" },
            { label: "UNIQUE SKUS TRACKED", value: loading ? "—" : String(summary?.topSku.length||0), sub: "Top 25 shown", color: "from-[#3498db] to-[#2980b9]", accent: "bg-[#3498db]", icon: "🏷️" },
            { label: "ACTIVE OUTLETS", value: loading ? "—" : String(summary?.topOutlet.length||0), sub: "Top 10 valuable", color: "from-[#8e44ad] to-[#9b59b6]", accent: "bg-[#8e44ad]", icon: "🏪" },
          ].map((kpiCard, idx) => (
            <div key={idx} className="lb-card-hover bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${kpiCard.color}`} />
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-sm">{kpiCard.icon}</div>
              </div>
              <div className="text-[10px] font-extrabold tracking-[0.15em] text-slate-400 uppercase">{kpiCard.label}</div>
              <div className="lb-kpi-value text-2xl font-black text-[#1a252f] mt-1.5 leading-none">{kpiCard.value}</div>
              <div className="text-[11px] text-slate-400 mt-2 font-medium">{kpiCard.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Checker Leaderboard ── */}
        <div className="lb-section bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
          <div className="px-6 pt-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md shadow-amber-500/20">
                  <span className="text-sm">🏅</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-[#1a252f]">Checker Leaderboard</h3>
                  <p className="text-[11px] text-slate-400 font-medium">PL/day · tonnage · avg · last active</p>
                </div>
              </div>
              <span className="text-[11px] font-bold bg-slate-100 border border-slate-200 rounded-full px-3 py-1 text-slate-600">{checkerLeaderboard.length} checkers</span>
            </div>
            {checkerLeaderboard.length===0 ? (
              <div className="text-center py-12 text-slate-300">
                <div className="text-3xl mb-2">📊</div>
                <div className="text-sm font-medium">No checker data yet — export PLs to rank.</div>
              </div>
            ) : (
              <>
                <div className="overflow-auto rounded-xl border border-slate-100 max-h-[340px]">
                  <table className="w-full text-xs">
                    <thead className="bg-gradient-to-r from-slate-50 to-slate-100/80 sticky top-0">
                      <tr>
                        <th className="px-3 py-3 text-center font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">#</th>
                        <th className="px-3 py-3 text-left font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">Checker</th>
                        <th className="px-3 py-3 text-center font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">PL</th>
                        <th className="px-3 py-3 text-center font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">Tonnage</th>
                        <th className="px-3 py-3 text-center font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">Avg / PL</th>
                        <th className="px-3 py-3 text-center font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">PL/day</th>
                        <th className="px-3 py-3 text-left font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">Last Active (WIB)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checkerLeaderboard.map((r,i)=>{
                        const rankBadge = i===0 ? "bg-gradient-to-br from-yellow-400 to-amber-500 text-white shadow-lg shadow-amber-500/30" : i===1 ? "bg-gradient-to-br from-gray-300 to-gray-400 text-white" : i===2 ? "bg-gradient-to-br from-amber-600 to-amber-700 text-white" : "bg-slate-100 text-slate-500";
                        return (
                          <tr key={r.checker} className={`border-t border-slate-50 lb-row-hover ${i===0 ? "bg-amber-50/30" : ""}`}>
                            <td className="px-3 py-3 text-center">
                              <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-[11px] font-black ${rankBadge}`}>{i+1}</span>
                            </td>
                            <td className="px-3 py-3">
                              <span className="font-bold text-[#1a252f] truncate max-w-[160px] block">{r.checker}</span>
                            </td>
                            <td className="px-3 py-3 text-center font-mono font-black text-[#1a252f]">{r.count}</td>
                            <td className="px-3 py-3 text-center font-mono font-bold text-emerald-600">{formatKg(r.tonnage)}</td>
                            <td className="px-3 py-3 text-center text-slate-500 font-medium">{r.avgKg} kg</td>
                            <td className="px-3 py-3 text-center">
                              <span className="px-2.5 py-1 rounded-full bg-[#1a252f] text-white text-[11px] font-bold shadow-sm">{r.plPerDay}/d</span>
                            </td>
                            <td className="px-3 py-3 text-[11px] text-slate-400 font-medium">{r.last ? new Date(String(r.last).replace(" ","T")).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"}) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {weeklyCheckerData.length>0 && (
                  <div className="mt-4 p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl border border-slate-100">
                    <div className="text-[11px] font-extrabold text-slate-400 tracking-wider uppercase mb-2">Top Checker ({checkerLeaderboard[0]?.checker}) — Weekly PL (last 8 weeks)</div>
                    <div className="h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeklyCheckerData} margin={{ left: 0, right: 12 }}>
                          <defs>
                            <linearGradient id="lbBarGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#2c3e50" stopOpacity={1}/>
                              <stop offset="100%" stopColor="#34495e" stopOpacity={0.85}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                          <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} />
                          <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} axisLine={false} />
                          <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px -4px rgba(0,0,0,0.1)", fontSize: "12px" }} />
                          <Bar dataKey="pl" name="PL" fill="url(#lbBarGrad)" radius={[6,6,0,0]} barSize={18} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
                <div className="text-[11px] text-slate-300 mt-3 px-1">Ranked by tonnage · SuperAdmin inline edit in Archive to correct field changes — leaderboard updates live (30s poll).</div>
              </>
            )}
          </div>
        </div>

        {/* ── Top 25 SKU — Flagship Multi-View ── */}
        <div className="lb-section bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
          <div className="px-6 pt-5 pb-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20">
                  <span className="text-sm">🏆</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-[#1a252f]">Top 25 SKU Exported</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Multiple views for Management — easy read</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Chart type switcher — flagship pills */}
                <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 shadow-sm">
                  {[
                    {id:"bar", label:"Bar", icon:"▮"},
                    {id:"barH", label:"Horizontal", icon:"▬"},
                    {id:"doughnut", label:"Doughnut", icon:"◉"},
                    {id:"pie", label:"Pie", icon:"◯"},
                    {id:"line", label:"Trend", icon:"〰"},
                  ].map(v=> (
                    <button key={v.id} onClick={()=> setSkuView(v.id as any)} className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-all flex items-center gap-1 ${skuView===v.id?"bg-[#1a252f] text-white shadow-sm":"text-slate-500 hover:text-slate-700 hover:bg-white"}`}>
                      <span className="text-[11px]">{v.icon}</span>{v.label}
                    </button>
                  ))}
                </div>
                <span className="hidden md:block w-px h-6 bg-slate-200 mx-1" />
                <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50">
                  <button onClick={()=> setSkuMetric("qty")} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${skuMetric==="qty"?"bg-[#1a252f] text-white shadow-sm":"text-slate-500 hover:text-slate-700"}`}>Qty</button>
                  <button onClick={()=> setSkuMetric("kg")} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${skuMetric==="kg"?"bg-emerald-600 text-white shadow-sm":"text-slate-500 hover:text-slate-700"}`}>Kg</button>
                </div>
              </div>
            </div>
            {!summary || topSkuDisplay.length===0 ? (
              <div className="text-center py-12 text-slate-300">
                <div className="text-3xl mb-2">📦</div>
                <div className="text-sm font-medium">No SKU data yet — export a Packing List to populate.</div>
              </div>
            ) : (
              <>
                {skuView==="bar" && (
                  <div className="h-[440px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topSkuDisplay} layout="vertical" margin={{ left: 12, right: 24, top: 5, bottom: 5 }}>
                        <defs>
                          <linearGradient id="lbSkuGrad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor={skuMetric==="qty" ? "#2c3e50" : "#27ae60"} stopOpacity={1}/>
                            <stop offset="100%" stopColor={skuMetric==="qty" ? "#34495e" : "#2ecc71"} stopOpacity={0.85}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} />
                        <YAxis dataKey="sku" type="category" width={160} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} />
                        <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px -4px rgba(0,0,0,0.1)", fontSize: "12px" }} formatter={(v:any, n:any)=> [n==="qty"? `${v} ${topSkuDisplay[0]?.uom||""}` : formatKg(Number(v)), n==="qty"?"Qty":"Tonnage"]} />
                        <Bar dataKey={skuMetric} fill="url(#lbSkuGrad)" radius={[0,6,6,0]} barSize={12}>
                          {topSkuDisplay.map((_,i)=> <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {skuView==="barH" && (
                  <div className="h-[440px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topSkuDisplay} margin={{ left: 12, right: 12, top: 10, bottom: 40 }}>
                        <defs>
                          <linearGradient id="lbSkuGradH" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={skuMetric==="qty" ? "#3498db" : "#27ae60"} stopOpacity={1}/>
                            <stop offset="100%" stopColor={skuMetric==="qty" ? "#2c3e50" : "#16a085"} stopOpacity={0.85}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="sku" tick={{ fontSize: 9, fill: "#64748b" } as any} interval={0} height={70} axisLine={{ stroke: "#e2e8f0" }} angle={-28} textAnchor="end" />
                        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} />
                        <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px -4px rgba(0,0,0,0.1)", fontSize: "12px" }} formatter={(v:any, n:any)=> [n==="qty"? `${v}` : formatKg(Number(v)), n==="qty"?"Qty":"Tonnage"]} />
                        <Bar dataKey={skuMetric} fill="url(#lbSkuGradH)" radius={[6,6,0,0]} barSize={22}>
                          {topSkuDisplay.map((_,i)=> <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {skuView==="doughnut" && (
                  <div className="h-[440px] flex flex-col lg:flex-row gap-4">
                    <div className="flex-1 min-h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={topSkuDisplay.slice(0,12)} dataKey={skuMetric} nameKey="sku" cx="50%" cy="50%" innerRadius={74} outerRadius={122} paddingAngle={2} onMouseEnter={(_,i)=> setActivePie(i)}>
                            {topSkuDisplay.slice(0,12).map((_,i)=> <Cell key={i} fill={COLORS[i%COLORS.length]} stroke="white" strokeWidth={2} />)}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px" }} formatter={(v:any, n:any, p:any)=> [skuMetric==="qty"? `${v} ${p.payload?.uom||""}` : formatKg(Number(v)), p.payload?.sku]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="lg:w-[340px] grid grid-cols-1 gap-1.5 max-h-[440px] overflow-auto pr-1 content-start">
                      {topSkuDisplay.slice(0,12).map((r,i)=>(
                        <div key={r.sku} className={`flex items-center justify-between rounded-xl px-3 py-2 border text-xs ${activePie===i?"bg-slate-900 text-white border-slate-900 shadow":"bg-slate-50 border-slate-100 hover:bg-white"}`}>
                          <span className="flex items-center gap-2 truncate">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{background: COLORS[i%COLORS.length]}} />
                            <span className="font-bold truncate max-w-[160px]">{r.sku}</span>
                          </span>
                          <span className={`font-mono font-black ${activePie===i?"text-white":"text-[#1a252f]"}`}>{skuMetric==="qty"? r.qty.toLocaleString(): formatKg(r.kg)}</span>
                        </div>
                      ))}
                      <div className="text-[11px] text-slate-400 px-1 pt-1">Doughnut shows Top 12 — hover slice for share. Total Top 25 {skuMetric==="qty"? "qty" : "tonnage"} dominates report.</div>
                    </div>
                  </div>
                )}
                {skuView==="pie" && (
                  <div className="h-[440px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={topSkuDisplay.slice(0,10)} dataKey={skuMetric} nameKey="sku" cx="50%" cy="50%" outerRadius={148} label={({sku, percent})=> `${sku.slice(0,14)} ${(percent*100).toFixed(0)}%`} labelLine>
                          {topSkuDisplay.slice(0,10).map((_,i)=> <Cell key={i} fill={COLORS[i%COLORS.length]} stroke="white" strokeWidth={2} />)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px" }} formatter={(v:any, n:any, p:any)=> [skuMetric==="qty"? `${v}` : formatKg(Number(v)), p.payload?.sku]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {skuView==="line" && (
                  <div className="h-[440px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={topSkuDisplay} margin={{ left: 12, right: 24, top: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="sku" tick={{ fontSize: 9, fill: "#64748b" } as any} interval={0} height={70} axisLine={{ stroke: "#e2e8f0" }} angle={-22} textAnchor="end" />
                        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} />
                        <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px" }} formatter={(v:any)=> skuMetric==="qty"? `${v}` : formatKg(Number(v))} />
                        <Line type="monotone" dataKey={skuMetric} stroke={skuMetric==="qty" ? "#2c3e50" : "#27ae60"} strokeWidth={2.5} dot={{ r: 3, fill: skuMetric==="qty" ? "#2c3e50" : "#27ae60" }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
            {summary && <div className="text-[11px] text-slate-300 mt-2 px-1 flex items-center gap-2 flex-wrap">Sorted by {skuMetric==="qty"?"quantity":"tonnage"} · {summary.topSku.length} SKUs ranked {(dateFrom||dateTo) && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-bold">Filtered {dateFrom||"…"} → {dateTo||"…"} </span>}</div>}
          </div>
        </div>

        {/* ── Top 10 Outlet + Monthly (side by side) ── */}
        <div className="lb-section grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Top 10 Outlet */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
            <div className="px-6 pt-5 pb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-md shadow-purple-500/20">
                  <span className="text-sm">💎</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-[#1a252f]">Top 10 Most Valuable Outlets</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Ranked by tonnage</p>
                </div>
              </div>
              {!summary || summary.topOutlet.length===0 ? (
                <div className="text-center py-12 text-slate-300">
                  <div className="text-3xl mb-2">🏪</div>
                  <div className="text-sm font-medium">No outlet data yet.</div>
                </div>
              ) : (
                <div className="h-[380px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.topOutlet} layout="vertical" margin={{ left: 0, right: 24 }}>
                      <defs>
                        <linearGradient id="lbOutletGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#8e44ad" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#9b59b6" stopOpacity={0.85}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} />
                      <YAxis dataKey="outlet" type="category" width={140} tick={{ fontSize: 9, fill: "#64748b" }} tickFormatter={(v:string)=> v.length>18? v.slice(0,18)+"…":v} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px -4px rgba(0,0,0,0.1)", fontSize: "12px" }} formatter={(v:any, n:any)=> n==="tonnage"? formatKg(Number(v)) : `${v} PL`} />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                      <Bar dataKey="tonnage" name="Tonnage (kg)" fill="url(#lbOutletGrad)" radius={[0,6,6,0]} barSize={14} />
                      <Bar dataKey="count" name="PL Count" fill="#3498db" radius={[0,6,6,0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="grid grid-cols-1 gap-1.5 mt-3 max-h-[140px] overflow-auto pr-1">
                {summary?.topOutlet.map((o,i)=>(
                  <div key={o.outlet} className="flex items-center justify-between text-xs bg-slate-50/80 border border-slate-100 rounded-xl px-3 py-2 hover:bg-slate-100/80 transition-colors">
                    <span className="flex items-center gap-2.5 truncate">
                      <span className="w-6 h-6 rounded-lg bg-[#1a252f] text-white flex items-center justify-center text-[10px] font-black shrink-0">{i+1}</span>
                      <span className="font-bold text-[#1a252f] truncate">{o.outlet}</span>
                    </span>
                    <span className="text-slate-400 shrink-0 font-medium">{o.count} PL · {formatKg(o.tonnage)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Monthly */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
            <div className="px-6 pt-5 pb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md shadow-emerald-500/20">
                  <span className="text-sm">📅</span>
                </div>
                <h3 className="font-extrabold text-sm text-[#1a252f]">Monthly Tonnage & Exported PL</h3>
              </div>
              {!summary || monthlyFiltered.length===0 ? (
                <div className="text-center py-12 text-slate-300">
                  <div className="text-3xl mb-2">📆</div>
                  <div className="text-sm font-medium">No monthly data — {summary?.monthly.length||0} months tracked.</div>
                </div>
              ) : (
                <div className="h-[380px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyFiltered} margin={{ left: 0, right: 12, top: 10 }}>
                      <defs>
                        <linearGradient id="tonG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#27ae60" stopOpacity={0.35}/><stop offset="95%" stopColor="#27ae60" stopOpacity={0}/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 8px 24px -4px rgba(0,0,0,0.1)", fontSize: "12px" }} formatter={(v:any, n:any)=> n==="tonnage"? formatKg(Number(v)) : `${v} PL`} />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                      <Area yAxisId="left" type="monotone" dataKey="tonnage" name="Tonnage (kg)" stroke="#27ae60" fill="url(#tonG)" strokeWidth={2.5} dot={{ r:3, fill:"#27ae60", strokeWidth:0 }} activeDot={{ r:5, stroke:"#27ae60", strokeWidth:2, fill:"white" }} />
                      <Line yAxisId="right" type="monotone" dataKey="pl" name="PL Count" stroke="#2c3e50" strokeWidth={2.5} dot={{ r:3, fill:"#2c3e50", strokeWidth:0 }} activeDot={{ r:5, stroke:"#2c3e50", strokeWidth:2, fill:"white" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              {/* Monthly table */}
              <div className="mt-3 border border-slate-100 rounded-xl overflow-hidden">
                <div className="max-h-[140px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gradient-to-r from-slate-50 to-slate-100/80 sticky top-0">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">Month</th>
                        <th className="px-3 py-2.5 text-center font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">PL</th>
                        <th className="px-3 py-2.5 text-right font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">Tonnage</th>
                        <th className="px-3 py-2.5 text-right font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">Avg / PL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyFiltered.slice().reverse().map(m=>(
                        <tr key={m.month} className="border-t border-slate-50 lb-row-hover">
                          <td className="px-3 py-2.5 font-mono font-bold text-[#1a252f]">{m.month}</td>
                          <td className="px-3 py-2.5 text-center font-bold">{m.pl}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-emerald-600 font-bold">{formatKg(m.tonnage)}</td>
                          <td className="px-3 py-2.5 text-right text-slate-400 font-medium">{m.pl? (m.tonnage/m.pl).toFixed(1):"—"} kg</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── PL Archive ── */}
        <div className="lb-section bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
          <div className="px-6 pt-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shadow-md shadow-slate-600/20">
                  <span className="text-sm">📦</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-[#1a252f]">Exported PL Archive</h3>
                  <p className="text-[11px] text-slate-400 font-medium">{archive.length} files · Supabase Storage</p>
                </div>
              </div>
              <input value={archiveFilter} onChange={e=> setArchiveFilter(e.target.value)} placeholder="Filter outlet / DO..." className="border border-slate-200 rounded-xl px-4 py-2 text-xs font-medium w-52 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/20 focus:border-[#2c3e50]/40 transition-all bg-slate-50 placeholder:text-slate-300" />
            </div>
            {filteredArchive.length===0 ? (
              <div className="text-center py-12 text-slate-300">
                <div className="text-3xl mb-2">📁</div>
                <div className="text-sm font-medium">{archive.length===0 ? "No PLs yet — export from Dashboard to auto-upload." : "No results for current calendar/filter — try Clear."}</div>
              </div>
            ) : (
              <div className="overflow-auto rounded-xl border border-slate-100 max-h-[340px]">
                <table className="w-full text-xs">
                  <thead className="bg-gradient-to-r from-slate-50 to-slate-100/80 sticky top-0">
                    <tr>
                      <th className="px-3 py-3 text-left font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">Delivery No</th>
                      <th className="px-3 py-3 text-left font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">Outlet</th>
                      <th className="px-3 py-3 font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">Checker</th>
                      <th className="px-3 py-3 font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">PL</th>
                      <th className="px-3 py-3 font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">Status</th>
                      <th className="px-3 py-3 font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">Created (WIB)</th>
                      <th className="px-3 py-3 font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">File</th>
                      <th className="px-3 py-3 text-center font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredArchive.slice(0,200).map((a:any)=>(
                      <tr key={a.delivery_no} className="border-t border-slate-50 lb-row-hover">
                        <td className="px-3 py-2.5 font-mono font-bold text-[#1a252f]">{a.delivery_no}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-600">{a.outlet}</td>
                        <td className="px-3 py-2.5 text-center">
                          {editingChecker===a.delivery_no ? (
                            <div className="flex items-center gap-1 justify-center">
                              <select value={editCheckerVal} onChange={e=> setEditCheckerVal(e.target.value)} className="border border-slate-200 rounded-lg px-1.5 py-1 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-[#2c3e50]/30">
                                {checkers.map(c=> <option key={c} value={c}>{c}</option>)}
                              </select>
                              <button onClick={()=> handleCheckerUpdate(a.delivery_no)} className="text-emerald-600 font-bold text-[11px] hover:underline">✓</button>
                              <button onClick={()=> setEditingChecker(null)} className="text-slate-400 text-[11px] hover:text-slate-600">✕</button>
                            </div>
                          ) : (
                            <button onClick={()=>{ setEditingChecker(a.delivery_no); setEditCheckerVal(a.checker||""); }} className="text-[11px] text-[#3498db] hover:text-[#2980b9] font-bold hover:underline cursor-pointer">{a.checker||"—"}</button>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold">{a.total_weight_kg||0} kg</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${a.status==="READY"?"bg-emerald-100 text-emerald-700 border border-emerald-200":"bg-amber-100 text-amber-700 border border-amber-200"}`}>{a.status}</span>
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-slate-400 font-medium">{a.created_at||"—"}</td>
                        <td className="px-3 py-2.5 text-center">{a.hasFile ? <span className="text-emerald-500">✅</span> : <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={()=> handleDownload(a.delivery_no)} className="w-7 h-7 rounded-lg bg-[#1a252f] text-white flex items-center justify-center text-xs font-bold hover:bg-[#2c3e50] transition-colors shadow-sm active:scale-95" title="Download">⬇</button>
                            {isSuperAdmin && <button onClick={()=> handleDelete(a.delivery_no)} title="Delete — SuperAdmin only" className="w-7 h-7 rounded-lg bg-white border border-red-200 text-red-500 flex items-center justify-center text-xs font-bold hover:bg-red-50 transition-colors active:scale-95">🗑️</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="text-[11px] text-slate-300 mt-3 px-1">Files stored in Supabase Storage bucket <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-400">packing-lists</code> per delivery folder — downloadable via signed URL (1h) or direct stream. Auto-upload on every Dashboard export.</div>
          </div>
        </div>

        {/* ── Live Stream ── */}
        <div className="lb-section bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
          <button onClick={()=> setShowLive(!showLive)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/80 transition-colors">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-md shadow-red-500/20">
                    <span className="text-sm">🔴</span>
                  </div>
                  {showLive && <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full lb-pulse-live border-2 border-white" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-[#1a252f]">Live Stream — Packing Status</h3>
                  <p className="text-[11px] text-slate-400 font-medium">{liveTotal} filtered • {data.length} total • Page {Math.min(livePage,liveTotalPages)}/{liveTotalPages} • 50/page server-paged ready</p>
                </div>
              </div>
              <span className={`text-xs font-bold px-4 py-2 rounded-xl transition-all ${showLive?"bg-[#1a252f] text-white shadow-sm":"bg-slate-100 text-slate-500 border border-slate-200"}`}>{showLive?"Hide":"Show"}</span>
            </button>
            {showLive && (
              <div className="px-6 pb-5 border-t border-slate-100">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4 pt-4">
                  <h4 className="font-bold text-sm text-[#1a252f]">{t("live.title")}</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50">
                      {(["ALL","PENDING","READY","CANCELLED"] as const).map(s=> (
                        <button key={s} onClick={()=> setLiveStatus(s)} className={`px-3 py-1 text-xs font-extrabold rounded-lg transition ${liveStatus===s?"bg-[#1a252f] text-white shadow":"text-slate-500 hover:bg-white"}`}>{s}</button>
                      ))}
                    </div>
                    <input value={filter} onChange={e=> setFilter(e.target.value)} placeholder={t("live.filter")} className="border border-slate-200 rounded-xl px-4 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/20 focus:border-[#2c3e50]/40 transition-all placeholder:text-slate-300 w-44" />
                    <select value={livePageSize} onChange={e=> setLivePageSize(Number(e.target.value) as any)} className="border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold bg-white">
                      <option value={25}>25/page</option><option value={50}>50/page</option><option value={100}>100/page</option>
                    </select>
                    <button onClick={fetchAll} className="px-4 py-2 bg-[#3498db] hover:bg-[#2980b9] text-white rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95">↻ {t("live.refresh")}</button>
                  </div>
                </div>
              <div className="overflow-auto rounded-xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-r from-slate-50 to-slate-100/80 sticky top-0">
                    <tr>
                      <th className="px-3 py-3 text-left font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">{t("live.deliveryNo")}</th>
                      <th className="px-3 py-3 font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">{t("live.outlet")}</th>
                      <th className="px-3 py-3 font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">{t("live.checker")}</th>
                      <th className="px-3 py-3 font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">{t("live.status")}</th>
                      <th className="px-3 py-3 font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">{t("live.scannedAt")}</th>
                      <th className="px-3 py-3 font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">{t("live.created")}</th>
                      <th className="px-3 py-3 font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">{t("live.weight")}</th>
                      <th className="px-3 py-3 text-center font-extrabold text-[10px] tracking-widest text-slate-400 uppercase">{t("dash.action")}</th>
                    </tr>
                  </thead>
                  <tbody>
                      {livePaginated.length===0 && <tr><td colSpan={8} className="text-center py-12 text-slate-300"><div className="text-2xl mb-2">📭</div><div className="text-sm font-medium">{t("live.noData")}</div></td></tr>}
                      {livePaginated.map((e:any)=>(
                        <tr key={e.delivery_no} className="border-t border-slate-50 lb-row-hover">
                          <td className="px-3 py-2.5 font-mono text-xs font-bold text-[#1a252f]">{e.delivery_no}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-600">{e.outlet}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-600">{e.checker}</td>
                          <td className="px-3 py-2.5">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${e.status==="READY"?"bg-emerald-100 text-emerald-700 border border-emerald-200":e.status==="CANCELLED"?"bg-red-100 text-red-700 border border-red-200":"bg-amber-100 text-amber-700 border border-amber-200"}`}>{e.status==="READY"?t("live.ready"): e.status==="CANCELLED"?t("live.cancelled"):t("live.packing")}</span>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{e.scanned_at||"--:--:--"}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-400 font-medium">{e.created_at}</td>
                          <td className="px-3 py-2.5 font-mono font-bold text-[#1a252f]">{e.total_weight_kg||0} kg</td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {isBoardAdmin && <button title="Packed results (Digital PL)" onClick={async()=>{ try{ const d = await apiGet(`/api/digital_pl/${encodeURIComponent(e.delivery_no)}`); setPlView(d); }catch(err:any){ setPlView({ delivery_no: e.delivery_no, header: e, boxes: [], checks: [], error: err?.message }); } }} className="px-2.5 py-1.5 bg-[#1a252f] hover:bg-black text-white text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95">👁️</button>}
                            {e.status!=="READY" && <button onClick={async()=>{ await apiPut(`/api/packing_status/${encodeURIComponent(e.delivery_no)}`,{status:"READY"}); fetchAll(); }} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95">{t("live.markReady")}</button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Flagship paginator — fixes long-af page at 10k */}
                <div className="mt-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
                  <div className="text-slate-400 font-medium">Showing {(livePage-1)*livePageSize+1}-{Math.min(livePage*livePageSize, liveTotal)} of {liveTotal} • {liveTotalPages} pages • {livePageSize}/page</div>
                  <div className="flex items-center gap-1.5">
                    <button disabled={livePage<=1} onClick={()=> setLivePage(p=> Math.max(1,p-1))} className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold disabled:opacity-40 hover:bg-slate-50">‹ Prev</button>
                    <span className="px-3 py-1.5 rounded-xl bg-[#1a252f] text-white font-black">{livePage} / {liveTotalPages}</span>
                    <button disabled={livePage>=liveTotalPages} onClick={()=> setLivePage(p=> Math.min(liveTotalPages,p+1))} className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold disabled:opacity-40 hover:bg-slate-50">Next ›</button>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl border border-slate-100">
                  <h4 className="font-bold text-sm mb-1 text-[#1a252f]">{t("live.override")}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{t("live.overrideDesc")}</p>
                </div>
              </div>
            )}
          </div>

      </div>
      {/* Packed Digital PL results — Admin/SuperAdmin only, read-only, additive */}
      {plView && (
        <div className="fixed inset-0 bg-[#0f1e2e]/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={()=> setPlView(null)}>
          <div className="bg-white rounded-[20px] shadow-[0_24px_64px_rgba(0,0,0,0.35)] border border-white/40 w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden" onClick={e=> e.stopPropagation()}>
            <div className="bg-gradient-to-br from-[#0f1e2e] via-[#1a2f4a] to-[#2c3e50] text-white px-5 py-4 flex items-center justify-between">
              <div><div className="font-black text-sm">📱 Packed Results — {plView.delivery_no}</div><div className="text-[11px] text-white/60">{(plView.checks||[]).filter((c:any)=>c?.checked).length}/{(plView.boxes||[]).length||"—"} koli packed • Dus Besar {plView.dus_besar??"—"} / L {plView.dus_l??"—"} / S {plView.dus_s??"—"}{plView.packed_by?` • by ${plView.packed_by}`:""}</div></div>
              <button onClick={()=> setPlView(null)} className="text-white/70 hover:text-white text-lg">✖</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {plView.error && !(plView.boxes||[]).length && <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3">No Digital PL snapshot yet ({plView.error}). Outlet: {plView.header?.outlet||"—"} • Status: {plView.header?.status||"—"}</div>}
              {(plView.boxes||[]).length>0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {plView.boxes.map((box:any,i:number)=>{
                    const c = (plView.checks||[])[i];
                    return (
                      <div key={i} className={`rounded-xl border p-3 text-xs ${c?.checked?"bg-emerald-50 border-emerald-200":"bg-slate-50 border-slate-200"}`}>
                        <div className="flex items-center gap-2 font-black text-[#0f1e2e]"><span>{c?.checked?"✅":"⬜"} Koli {i+1}</span>{c?.by && <span className="ml-auto font-bold text-emerald-600 truncate max-w-[140px]">{c.by}</span>}</div>
                        <div className="mt-1.5 space-y-0.5">{Object.entries(box||{}).map(([sku,qty]:any)=>(<div key={sku} className="flex justify-between"><span className="text-slate-600 truncate mr-2">{sku}</span><span className="font-mono font-bold">×{String(qty)}</span></div>))}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
