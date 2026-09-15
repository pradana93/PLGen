import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";

export default function Login(){
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent)=>{
    e.preventDefault();
    setErr(""); setLoading(true);
    const r = await signIn(email, password);
    setLoading(false);
    if (r.error) setErr(r.error);
    else nav("/");
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow p-6 w-full max-w-md">
        <h1 className="text-xl font-extrabold text-center">🔐 PLGen Login</h1>
        <p className="text-xs text-gray-500 text-center mt-1">PythonAnywhere Master Data • Supabase User Management</p>
        <p className="text-xs text-gray-400 text-center mt-1">No public registration — accounts are created by Admin (majestap93@gmail.com is SuperAdmin).</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-bold">Email</label>
            <input value={email} onChange={e=> setEmail(e.target.value)} placeholder="majestap93@gmail.com" type="email" required className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-bold">Password</label>
            <input value={password} onChange={e=> setPassword(e.target.value)} placeholder="••••••••" type="password" required className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
          </div>
          {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</div>}
          <button type="submit" disabled={loading} className="w-full bg-[#2c3e50] text-white rounded-lg py-2 font-bold text-sm disabled:opacity-50">{loading ? "Signing in…" : "🔓 Login"}</button>
        </form>
        <div className="text-xs text-gray-400 text-center mt-4">
          SuperAdmin: <b>majestap93@gmail.com</b> — will be auto-assigned on first login.<br/>
          Other users: Ask Admin to create your account in <Link to="/admin" className="text-[#3498db] underline">Admin → User Management</Link>.
        </div>
      </div>
    </div>
  );
}
