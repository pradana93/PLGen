// Google Drive export client — per-user own Drive. Local flow untouched.
// Toggle state lives in localStorage (per browser); connection state is server-side per user.
import { supabase } from "./supabase";

const BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");
const DEST_KEY = "plgen-export-dest";

export type ExportDest = "local" | "drive";

export function getExportDest(): ExportDest {
  return (localStorage.getItem(DEST_KEY) === "drive" ? "drive" : "local");
}
export function setExportDest(d: ExportDest) {
  localStorage.setItem(DEST_KEY, d);
}

async function supaHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = (data as any)?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

export async function driveStatus(): Promise<{ connected: boolean; email?: string; clientReady?: boolean }> {
  const r = await fetch(`${BASE}/api/drive/status`, { headers: await supaHeaders() });
  if (!r.ok) throw new Error(`drive status ${r.status}`);
  return r.json();
}

export async function driveConnect(): Promise<void> {
  const r = await fetch(`${BASE}/api/drive/auth-url`, { headers: await supaHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `drive auth ${r.status}`);
  if (!j.url) throw new Error("No auth URL");
  window.location.href = j.url;
}

export async function driveDisconnect(): Promise<void> {
  await fetch(`${BASE}/api/drive/disconnect`, { method: "POST", headers: await supaHeaders() });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result || "");
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    fr.onerror = () => reject(new Error("blob read failed"));
    fr.readAsDataURL(blob);
  });
}

// Uploads one workbook into PLGen/{DDMMYYYY}_PL/{BBB|BBT}/{PL|Labels}/.
// dateFolder = DDMMYYYY digits (delivery date), company = BBB|BBT.
export async function driveUpload(args: {
  company: string; dateFolder: string; kind: "PL" | "Labels";
  filename: string; blob: Blob;
}): Promise<{ fileId: string; webViewLink: string | null }> {
  const contentBase64 = await blobToBase64(args.blob);
  const r = await fetch(`${BASE}/api/drive/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await supaHeaders()) },
    body: JSON.stringify({
      company: args.company, dateFolder: args.dateFolder, kind: args.kind,
      filename: args.filename,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      contentBase64,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err: any = new Error(j.error || `drive upload ${r.status}`);
    err.code = j.code;
    throw err;
  }
  return j;
}
