const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

export async function apiGet(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: "Bearer JESTA-SECURE-99X" } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}
export async function apiPost(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer JESTA-SECURE-99X" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}
export async function apiPut(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
