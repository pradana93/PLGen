import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Profile = { id: string; email: string; role: string; alias?: string };
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

  const fetchProfile = async (uid: string, email: string) => {
    if (!supabase) return null;
    const { data } = await supabase.from("profiles").select("id,email,role,alias").eq("id", uid).single();
    if (data) {
      // Auto-fix SuperAdmin for majestap93@gmail.com if needed (in case trigger missed)
      if (email.toLowerCase()==="majestap93@gmail.com" && data.role!=="SuperAdmin") {
        await supabase.from("profiles").update({ role: "SuperAdmin" }).eq("id", uid);
        data.role = "SuperAdmin";
      }
      return data as Profile;
    }
    // Fallback: create profile via API if not exists (should be created by trigger, but handle)
    return { id: uid, email, role: email.toLowerCase()==="majestap93@gmail.com" ? "SuperAdmin" : "LogisticVittoria" } as Profile;
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
      } else {
        setUser(null); setProfile(null);
      }
      setLoading(false);
    });
    return ()=> sub.subscription.unsubscribe();
  },[]);

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
