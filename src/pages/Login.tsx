import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

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
    if (r.error) {
      // Hide internal details like "Supabase not configured"
      const msg = r.error.toLowerCase().includes("supabase not configured") ? "Service temporarily unavailable. Please try again later." : r.error;
      setErr(msg);
    } else nav("/");
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 bg-[#f4f6f9]">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-2xl font-extrabold text-[#2c3e50]">PLGen</div>
          <div className="text-sm text-gray-500">Packing List Generator</div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-[#2c3e50]">Email</label>
            <input value={email} onChange={e=> setEmail(e.target.value)} placeholder="you@example.com" type="email" required autoComplete="email" className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3498db]/30 focus:border-[#3498db]" />
          </div>
          <div>
            <label className="text-sm font-semibold text-[#2c3e50]">Password</label>
            <input value={password} onChange={e=> setPassword(e.target.value)} placeholder="••••••••" type="password" required autoComplete="current-password" className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3498db]/30 focus:border-[#3498db]" />
          </div>
          {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{err}</div>}
          <button type="submit" disabled={loading} className="w-full bg-[#2c3e50] hover:bg-[#34495e] text-white rounded-lg py-3 font-bold text-sm disabled:opacity-50 transition-colors">
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <div className="text-xs text-gray-400 text-center mt-6">
          Need an account? Contact your administrator.
        </div>
      </div>
    </div>
  );
}
