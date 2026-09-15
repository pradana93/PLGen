import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import LiveBoard from "./pages/LiveBoard";
import Admin from "./pages/Admin";
import Manifests from "./pages/Manifests";
import Inbound from "./pages/Inbound";
import ScanPage from "./pages/ScanPage";
import Devmode from "./pages/Devmode";

function Nav(){
  const loc = useLocation();
  const link = (to:string, label:string)=> (
    <Link to={to} className={`px-3 py-2 rounded-lg text-sm font-semibold ${loc.pathname===to?"bg-white text-[#2c3e50] shadow":"text-white/90 hover:bg-white/20"}`}>{label}</Link>
  );
  return (
    <nav className="bg-[#2c3e50] text-white px-4 py-3 flex items-center gap-2 sticky top-0 z-50">
      <div className="font-extrabold tracking-tight text-lg">🛡️ PLGen <span className="font-normal opacity-70">v2.0</span></div>
      <div className="ml-6 flex gap-1">
        {link("/","Dashboard")}
        {link("/live","Live Board")}
        {link("/manifests","Manifests")}
        {link("/inbound","Inbound")}
        {link("/admin","Admin")}
        {link("/devmode","PIN")}
      </div>
      <div className="ml-auto text-xs opacity-70 hidden md:block">Interactive WebApp • React/TypeScript • Supabase Ready</div>
    </nav>
  );
}

export default function App(){
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/live" element={<LiveBoard />} />
        <Route path="/manifests" element={<Manifests />} />
        <Route path="/inbound" element={<Inbound />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/scan/:deliveryNo" element={<ScanPage />} />
        <Route path="/devmode" element={<Devmode />} />
      </Routes>
      <footer className="text-center text-xs text-gray-500 py-6">Made by A. Majesta P. • Burger Bangor Logistics • Production-Live v2.0 | Logic preserved 1:1 from Python core</footer>
    </BrowserRouter>
  );
}
