import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Profile = { id: string; email: string; role: string; alias?: string; last_seen_at?: string; last_login_at?: string; banned?: boolean; banned_reason?: string; banned_until?: string; approved?: boolean; approved_at?: string };
type AuthState = {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email:string, password:string)=>Promise<{error?:string}>;
  signOut: ()=>Promise<void>;
};

const Ctx = createContext<AuthState>({ user: null, profile: null, loading: true, signIn: async()=>({}), signOut: async()=>{} });
export const useAuth = ()=> useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{id:string,email:string}|null>(null);
  const [profile, setProfile] = useState<Profile|null>(null);
  const [loading, setLoading] = useState(true);

  const touchLastSeen = async (uid: string) => {
    if (!supabase) return;
    try {
      // fire-and-forget heartbeat — ignore RLS / missing-column errors (non-breaking)
      await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", uid);
    } catch {}
  };

  const fetchProfile = async (uid: string, email: string) => {
    if (!supabase) return null;
    const { data } = await supabase.from("profiles").select("id,email,role,alias,last_seen_at,last_login_at,created_at,banned,banned_reason,banned_until,approved,approved_at").eq("id", uid).single();
    if (data) {
      // Auto-fix SuperAdmin for majestap93@gmail.com if needed (in case trigger missed)
      if (email.toLowerCase()==="majestap93@gmail.com" && (data as any).role!=="Super Admin") {
        await supabase.from("profiles").update({ role: "Super Admin" }).eq("id", uid);
        (data as any).role = "Super Admin";
      }
      // opportunistic last_seen refresh (non-blocking)
      touchLastSeen(uid);
      return data as Profile;
    }
    // Fallback: create profile via API if not exists (should be created by trigger, but handle)
    return { id: uid, email, role: email.toLowerCase()==="majestap93@gmail.com" ? "Super Admin" : "Checker" } as Profile;
  };

  useEffect(()=>{
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(async ({ data }: any)=>{
      const s = data.session;
      if (s?.user) {
        setUser({ id: s.user.id, email: s.user.email || "" });
        const p = await fetchProfile(s.user.id, s.user.email || "");
        setProfile(p);
      }
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt: any, session: any)=>{
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email || "" });
        const p = await fetchProfile(session.user.id, session.user.email || "");
        setProfile(p);
        // record login time separately (audit)
        try { await supabase.from("profiles").update({ last_login_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }).eq("id", session.user.id); } catch {}
      } else {
        setUser(null); setProfile(null);
      }
      setLoading(false);
    });
    return ()=> sub.subscription.unsubscribe();
  },[]);

  // Heartbeat for Online Status — every 30s + on visibility
  useEffect(()=>{
    if (!supabase || !user?.id) return;
    const beat = () => touchLastSeen(user.id);
    beat();
    const id = setInterval(beat, 30000);
    const onVis = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", beat);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", beat); };
  }, [user?.id]);

  const signIn = async (email:string, password:string)=>{
    if (!supabase) return { error: "Supabase not configured" };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) return { error: error.message };
    return {};
  };
  const signOut = async ()=>{
    if (supabase) await supabase.auth.signOut();
    setUser(null); setProfile(null);
  };

  return <Ctx.Provider value={{ user, profile, loading, signIn, signOut }}>{children}</Ctx.Provider>;
}
