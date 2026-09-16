import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anon) {
  console.warn("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — Auth will not work. Set in Vercel env. URL:", url ? "set" : "missing", "anon:", anon ? "set" : "missing");
}

export const supabase = url && anon ? createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
}) : (null as any);

// Helper to detect misconfiguration early (used by AuthContext)
export const isSupabaseConfigured = Boolean(url && anon);
