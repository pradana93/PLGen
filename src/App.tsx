import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import LiveBoard from "./pages/LiveBoard";
import Admin from "./pages/Admin";
import Manifests from "./pages/Manifests";
import Inbound from "./pages/Inbound";
import ScanPage from "./pages/ScanPage";
import Login from "./pages/Login";
import { AuthProvider, useAuth } from "./context/AuthContext";

function Nav(){
  const loc = useLocation();
  const { user, profile, signOut } = useAuth();
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
      </div>
      <div className="ml-auto flex items-center gap-2">
        {user ? (
          <>
            <span className="text-xs hidden md:block">{profile?.email} <span className="opacity-70">({profile?.role})</span></span>
            <button onClick={signOut} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded">Logout</button>
          </>
        ) : (
          <Link to="/login" className="text-xs bg-white text-[#2c3e50] px-3 py-1 rounded font-bold">Login</Link>
        )}
      </div>
    </nav>
  );
}

function Protected({ children, roles }: { children: React.ReactNode, roles?: string[] }){
  const { user, profile, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-sm">Loading auth…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && profile && !roles.includes(profile.role)) {
    return <div className="p-8 text-center"><div className="text-lg font-bold">⛔ Access Denied</div><div className="text-sm text-gray-500">Role {profile.role} cannot access this page. Required: {roles.join(", ")}</div></div>;
  }
  return <>{children}</>;
}

function AppRoutes(){
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/live" element={<Protected><LiveBoard /></Protected>} />
        <Route path="/manifests" element={<Protected><Manifests /></Protected>} />
        <Route path="/inbound" element={<Protected><Inbound /></Protected>} />
        <Route path="/admin" element={<Protected roles={["SuperAdmin","Admin"]}><Admin /></Protected>} />
        <Route path="/scan/:deliveryNo" element={<ScanPage />} />
      </Routes>
      <footer className="text-center text-xs text-gray-500 py-6">Made by A. Majesta P. • Burger Bangor Logistics • Production-Live v2.0 | Login via Supabase • PythonAnywhere Master Data</footer>
    </>
  );
}

export default function App(){
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
