const BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");

async function parseError(r: Response): Promise<string> {
  try {
    const t = await r.text();
    // Try to surface JSON error details
    try { const j = JSON.parse(t); return j.error || j.message || t || `${r.status} ${r.statusText}`; } catch { return t || `${r.status} ${r.statusText}`; }
  } catch { return `${r.status} ${r.statusText}`; }
}

export async function apiGet(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: "Bearer JESTA-SECURE-99X" } });
  if (!r.ok) throw new Error(await parseError(r));
  return r.json();
}
export async function apiPost(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer JESTA-SECURE-99X" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await parseError(r));
  return r.json();
}
export async function apiPut(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await parseError(r));
  return r.json();
}
