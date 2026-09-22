import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { useLanguage } from "../i18n";

export default function Manifests(){
  const { t } = useLanguage();
  const [data,setData]=useState<any[]>([]);
  const [name,setName]=useState("");
  const [truck,setTruck]=useState("");
  const [driver,setDriver]=useState("");
  const fetchData=async()=>{ try{ setData(await apiGet("/api/outbound_manifests")); }catch{} };
  useEffect(()=>{ fetchData(); },[]);
  return (
    <div className="max-w-5xl mx-auto p-4">
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="font-bold text-lg mb-4">{t("man.title")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
          <input value={name} onChange={e=> setName(e.target.value)} placeholder={t("man.name")} className="border rounded-lg px-3 py-2 text-sm" />
          <input value={truck} onChange={e=> setTruck(e.target.value)} placeholder={t("man.truck")} className="border rounded-lg px-3 py-2 text-sm" />
          <input value={driver} onChange={e=> setDriver(e.target.value)} placeholder={t("man.driver")} className="border rounded-lg px-3 py-2 text-sm" />
          <button onClick={async()=>{ await apiPost("/api/outbound_manifests",{ manifest_name:name, truck_plate:truck, driver }); setName(""); setTruck(""); setDriver(""); fetchData(); }} className="bg-[#27ae60] text-white rounded-lg font-bold">{t("man.create")}</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#f4f6f9]"><tr><th className="p-2 text-left">{t("man.manifest")}</th><th className="p-2">{t("man.truckTh")}</th><th className="p-2">{t("man.driverTh")}</th><th className="p-2">{t("live.status")}</th><th className="p-2">{t("live.created")}</th></tr></thead>
          <tbody>{data.map((m:any)=> <tr key={m.manifest_id} className="border-b"><td className="p-2">{m.manifest_name}</td><td className="p-2">{m.truck_plate}</td><td className="p-2">{m.driver}</td><td className="p-2">{m.status}</td><td className="p-2 text-xs">{m.created_at}</td></tr>)}{data.length===0 && <tr><td colSpan={5} className="text-center p-6 text-gray-400">{t("man.empty")}</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}
