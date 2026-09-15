import { useEffect, useState } from "react";

export default function Inbound(){
  const [logs,setLogs]=useState<any[]>([]);
  useEffect(()=>{ fetch(`${import.meta.env.VITE_API_URL||"http://localhost:4000"}/api/inbound_logs?admin_key=majesta93`).then(r=>r.json()).then(setLogs).catch(()=>{}); },[]);
  return (
    <div className="max-w-5xl mx-auto p-4">
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="font-bold text-lg mb-4">📥 Inbound Logs</h2>
        <table className="w-full text-sm">
          <thead className="bg-[#f4f6f9]"><tr><th className="p-2">Timestamp</th><th className="p-2">SKU</th><th className="p-2">Received</th><th className="p-2">Vendor</th></tr></thead>
          <tbody>{logs.map((l:any,idx:number)=> <tr key={idx} className="border-b"><td className="p-2 text-xs">{l.timestamp}</td><td className="p-2">{l.sku}</td><td className="p-2 text-center">{l.received_qty}</td><td className="p-2">{l.vendor}</td></tr>)}{logs.length===0 && <tr><td colSpan={4} className="text-center p-6 text-gray-400">No inbound logs yet</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}
