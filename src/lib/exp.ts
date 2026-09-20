// EXP client — formula mirror of api/index.ts (keep in sync!):
// level = floor(sqrt(exp/100)) + 1  → Lv100 ≈ 980k EXP. Titles + badge index shared.
import { supabase } from "./supabase";

const BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");

export function expLevel(exp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, Number(exp) || 0) / 100)) + 1;
}
export function expBaseForLevel(level: number): number {
  return 100 * Math.pow(Math.max(1, level) - 1, 2);
}
export function expTitle(level: number): string {
  if (level >= 100) return "Legend";
  if (level >= 75) return "Mythic";
  if (level >= 50) return "Master";
  if (level >= 25) return "Expert";
  if (level >= 10) return "Senior";
  return "Operator";
}
// PB-style badge index: 1-51 direct, then a prestige tier every 10 levels past 51.
export function badgeForLevel(level: number): number {
  if (level <= 51) return Math.max(1, level);
  return 51 + Math.floor((level - 51) / 10);
}
export function isExpEligible(role?: string | null): boolean {
  return role === "Super Admin" || role === "Admin";
}

async function supaHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = (data as any)?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

export type ExpMe = {
  exp: number; level: number; title: string; progress: number;
  base: number; next: number; exports: number; packs: number; days: number;
};
export type ExpEntry = {
  user_id: string; email: string; alias: string | null; role: string;
  exp: number; level: number; title: string;
};

export async function expFetchMe(): Promise<ExpMe | null> {
  try {
    const r = await fetch(`${BASE}/api/exp/me`, { headers: await supaHeaders() });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

export async function expFetchBoard(): Promise<ExpEntry[]> {
  try {
    const r = await fetch(`${BASE}/api/exp/leaderboard`, { headers: await supaHeaders() });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } catch { return []; }
}

// Fire-and-forget award call after a genuine export/pack (server validates + dedupes).
export async function expEarn(type: "export" | "pack", ref: string): Promise<void> {
  try {
    await fetch(`${BASE}/api/exp/earn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await supaHeaders()) },
      body: JSON.stringify({ type, ref }),
    });
  } catch {}
}

// Best-effort: match a Live Board checker display name to a leaderboard entry
// (profile alias first, then email local-part). Miss → null → no badge rendered.
export function expMatch(board: ExpEntry[], checker?: string | null): ExpEntry | null {
  const c = String(checker || "").trim().toLowerCase();
  if (!c || c === "select checker") return null;
  const byAlias = board.find(e => String(e.alias || "").trim().toLowerCase() === c);
  if (byAlias) return byAlias;
  return board.find(e => String(e.email || "").split("@")[0].toLowerCase() === c) || null;
}
