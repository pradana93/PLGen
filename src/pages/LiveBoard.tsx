import { useEffect, useState } from "react";
import { apiGet, apiPut } from "../lib/api";
import { useLanguage } from "../i18n";

export default function LiveBoard(){
  const { t } = useLanguage();
  const [data, setData]=useState<any[]>([]);
  const [filter, setFilter]=useState("");
  const fetchData=async()=>{ try{ const d=await apiGet("/api/packing_status"); setData(d);}catch{} };
  useEffect(()=>{ fetchData(); const t=setInterval(fetchData,5000); return ()=>clearInterval(t); },[]);
  const filtered = data.filter(e=> !filter || e.outlet?.toLowerCase().includes(filter.toLowerCase()) || e.delivery_no?.includes(filter));
  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">{t("live.title")}</h2>
          <div className="flex gap-2">
            <input value={filter} onChange={e=> setFilter(e.target.value)} placeholder={t("live.filter")} className="border rounded-lg px-3 py-1 text-sm" />
            <button onClick={fetchData} className="px-3 py-1 bg-[#3498db] text-white rounded-lg text-sm font-bold">{t("live.refresh")}</button>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#f4f6f9]"><tr><th className="p-2 text-left">{t("live.deliveryNo")}</th><th className="p-2">{t("live.outlet")}</th><th className="p-2">{t("live.checker")}</th><th className="p-2">{t("live.status")}</th><th className="p-2">{t("live.scannedAt")}</th><th className="p-2">{t("live.created")}</th><th className="p-2">{t("live.weight")}</th><th className="p-2">{t("dash.action")}</th></tr></thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={8} className="text-center p-8 text-gray-400">{t("live.noData")}</td></tr>}
              {filtered.map((e:any)=>(
                <tr key={e.delivery_no} className="border-b">
                  <td className="p-2 font-mono text-xs">{e.delivery_no}</td>
                  <td className="p-2">{e.outlet}</td>
                  <td className="p-2">{e.checker}</td>
                  <td className="p-2">{e.status==="READY"?t("live.ready"): e.status==="CANCELLED"?t("live.cancelled"):t("live.packing")}</td>
                  <td className="p-2">{e.scanned_at||"--:--:--"}</td>
                  <td className="p-2 text-xs">{e.created_at}</td>
                  <td className="p-2">{e.total_weight_kg||0} kg</td>
                  <td className="p-2">
                    {e.status!=="READY" && <button onClick={async()=>{ await apiPut(`/api/packing_status/${encodeURIComponent(e.delivery_no)}`,{status:"READY"}); fetchData(); }} className="text-xs bg-green-600 text-white px-2 py-1 rounded">{t("live.markReady")}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 p-3 bg-[#ecf0f1] rounded-lg">
          <h4 className="font-bold text-sm mb-2">{t("live.override")}</h4>
          <p className="text-xs text-gray-600">{t("live.overrideDesc")}</p>
        </div>
      </div>
    </div>
  );
}
