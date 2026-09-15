import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);
const ADMIN_SECRET = process.env.ADMIN_SECRET || "majesta93";
const API_BEARER = process.env.API_BEARER || "JESTA-SECURE-99X";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const IS_VERCEL = !!process.env.VERCEL;

// Middleware - on Vercel allow all origins
app.use(cors({ origin: IS_VERCEL ? true : CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Storage setup - Vercel has read-only FS except /tmp
// On Vercel we use /tmp (ephemeral) + Supabase (persistent) — see supabase/schema.sql
const DATA_DIR = IS_VERCEL ? path.join("/tmp", "plgen_data") : path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const MASTER_FILE = "master_data.json";

// PythonAnywhere as primary backend (user reverted: master_data.json lives there, Supabase optional)
// Supabase kept as persistent fallback when configured
const PYTHONANYWHERE_URL = process.env.PYTHONANYWHERE_URL || "https://jestu93.pythonanywhere.com";
const PY_HEADERS: Record<string,string> = { Authorization: API_BEARER };

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
export const isSupabaseConfigured = !!SUPABASE_URL && !!SUPABASE_SERVICE_KEY;

let supabase: any = null;
// Lazy Supabase client helper
async function getSupabase() {
  if (!isSupabaseConfigured) return null;
  if (supabase) return supabase;
  const { createClient } = await import("@supabase/supabase-js");
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  return supabase;
}
async function fetchSupabaseMaster(): Promise<any | null> {
  try {
    const sb = await getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.from("master_data").select("data").eq("id", 1).single();
    if (!error && data?.data) {
      // Cache locally
      try { jsonWrite(MASTER_FILE, data.data); } catch {}
      return data.data;
    }
  } catch {}
  return null;
}
async function saveSupabaseMaster(masterData: any): Promise<void> {
  try {
    const sb = await getSupabase();
    if (!sb) return;
    await sb.from("master_data").upsert({ id: 1, data: masterData, updated_at: new Date().toISOString() }, { onConflict: "id" });
  } catch {}
}
async function fetchSupabaseCheckers(): Promise<string[] | null> {
  try {
    const sb = await getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.from("checkers").select("list").eq("id", 1).single();
    if (!error && data?.list) return data.list;
  } catch {}
  return null;
}
async function saveSupabaseCheckers(list: string[]): Promise<void> {
  try {
    const sb = await getSupabase();
    if (!sb) return;
    await sb.from("checkers").upsert({ id: 1, list }, { onConflict: "id" });
  } catch {}
}
async function fetchSupabaseStock(): Promise<Record<string,number> | null> {
  try {
    const sb = await getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.from("current_stock").select("data").eq("id", 1).single();
    if (!error && data?.data) return data.data;
  } catch {}
  return null;
}
async function saveSupabaseStock(stock: Record<string,number>): Promise<void> {
  try {
    const sb = await getSupabase();
    if (!sb) return;
    await sb.from("current_stock").upsert({ id: 1, data: stock, updated_at: new Date().toISOString() }, { onConflict: "id" });
  } catch {}
}

async function fetchPythonAnywhereMaster(): Promise<any | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(()=> controller.abort(), 4000);
    let res = await fetch(`${PYTHONANYWHERE_URL}/static/master_data.json`, { headers: PY_HEADERS, signal: controller.signal } as any);
    if (!res.ok) res = await fetch(`${PYTHONANYWHERE_URL}/api/master_data`, { headers: PY_HEADERS, signal: controller.signal } as any);
    clearTimeout(t);
    if (res.ok) {
      const data = await res.json();
      try { jsonWrite(MASTER_FILE, data); } catch {}
      return data;
    }
  } catch {}
  return null;
}
async function fetchPythonAnywhereCheckers(): Promise<string[] | null> {
  try {
    const c = new AbortController(); const tt = setTimeout(()=> c.abort(), 3000);
    const r = await fetch(`${PYTHONANYWHERE_URL}/api/checkers`, { headers: PY_HEADERS, signal: c.signal } as any);
    clearTimeout(tt);
    if (r.ok) { const j = await r.json(); if (j.checkers) return j.checkers; }
  } catch {}
  return null;
}
async function fetchPythonAnywhereStock(): Promise<Record<string,number> | null> {
  try {
    const c = new AbortController(); const tt = setTimeout(()=> c.abort(), 3000);
    const r = await fetch(`${PYTHONANYWHERE_URL}/api/current_stock`, { headers: PY_HEADERS, signal: c.signal } as any);
    clearTimeout(tt);
    if (r.ok) return await r.json();
  } catch {}
  return null;
}

function jsonRead<T>(file: string, fallback: T): T {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return fallback;
  try {
    const c = fs.readFileSync(p, "utf-8").trim();
    if (!c) return fallback;
    return JSON.parse(c) as T;
  } catch { return fallback; }
}
function jsonWrite(file: string, data: any) {
  const p = path.join(DATA_DIR, file);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}
function txtReadLines(file: string): string[] {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf-8").split("\n").filter(Boolean);
}

// Helpers: WIB time
function getWibTime(): Date { return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })); }
function wibNowStr(): string {
  const d = getWibTime();
  const pad = (n:number)=> String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function wibDateStrYMD(): string {
  const d = getWibTime();
  const pad = (n:number)=> String(n).padStart(2,"0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
}

// ===== Default Master Data (doomsday fallback from core.py) =====
const FALLBACK_MASTER_DATA: any = {
  BOX_TOLERANCE: 1.859,
  CATEGORIES: {
    FROZEN_ITEMS: ["Beef Patty Small","Beef Patty Large","Keju Slice Non Brand","Keju Slice Non Brand A","Chicken Nugget","Spicy Chicken Nugget","Bangor Fried Chicken","Sosis","Ayam Crispy","Dori Crispy","BEEF SLICE","Smoke Beef Slice","Spicy Chicken Patty","Bangor Chicken Wings"],
    KENTANG_ITEMS: ["Kentang Goreng","Kentang Goreng Mc Cain"],
    SAUCE_ITEMS: ["BBQ Sauce","BBQ Spicy","Bolognese Sauce 500gr","Cheese Sauce","Nacho Sauce New","Mayonaise Garlic","Nestea Lemontea","Butter","Thousand Island Mayonaise"],
    PACKAGING_ITEMS: ["Kertas Nasi","Paper Kentang","Tray Kentang","Paper Bag","Packaging Box Sultan","Packaging HD","Kertas Printer","Cup Plastik 14 oz","Tutup Gelas","Cup Sauce","Sedotan","Hand Gloves","Kresek Kecil","Kresek Besar","Kresek Gelas","Bangor Crazy Bucket","Spunbond Bangor","Sticker Labeling","Tissue Pop Up","Box Hampers","Grill Box","Inner","Bangor Thermal Bag","Kertas Thermal","Kupon Umroh"],
    APPAREL_ITEMS: ["Kaus Seragam M","Kaus Seragam L","Kaus Seragam XL","Kaus Seragam XXL","Kaus Seragam XXXL","Topi","Polo Shirt S","Polo Shirt M","Polo Shirt L","Polo Shirt XL","Polo Shirt XXL","Polo Shirt XXXL","Apron","Seragam Owner S","Seragam Owner M","Seragam Owner L","Seragam Owner XL","Seragam Owner XXL","Seragam Owner XXXL"],
    BIG_ITEMS: ["Minyak Padat","Sabun Cuci Piring Mitra","Sabun Cuci Tangan @5 Liter","Sabun Lantai Mitra","Hand Sanitizer","Sabun MPC","Sabun Kerak","Cetakan Telur","Sambal Sachet Bangor","Saos Tomat Jerigen Delmonte"],
    BREAD_ITEMS: ["HD Bun","Burger Bun"],
    BUNDLE_ITEMS: ["Box Hampers","Grill Box","Inner"]
  },
  ITEM_UOM: {
    "Beef Patty Small":"Pack","Beef Patty Large":"Pack","Keju Slice Non Brand":"Pack","Keju Slice Non Brand A":"Pack","Chicken Nugget":"Pack","Spicy Chicken Nugget":"Pack","Kentang Goreng":"Pack","Kentang Goreng Mc Cain":"Pack","Bangor Fried Chicken":"Pack","Sosis":"Pack","Ayam Crispy":"Pack","Dori Crispy":"Pack","BEEF SLICE":"Pack","Smoke Beef Slice":"Pack","Spicy Chicken Patty":"Pack","HD Bun":"Pack","Burger Bun":"Pack","Thousand Island Mayonaise":"Pack","BBQ Sauce":"Pack","BBQ Spicy":"Pack","Bolognese Sauce 500gr":"Pack","Cheese Sauce":"Pack","Nacho Sauce New":"Pack","Mayonaise Garlic":"Pack","Nestea Lemontea":"Pack","Sambal Sachet Bangor":"Dus","Butter":"Pack","Sticker Labeling":"Ikat","Tissue Pop Up":"Pack","Kertas Nasi":"Pack","Paper Kentang":"Pack","Tray Kentang":"Pack","Paper Bag":"Pack","Packaging HD":"Ikat","Cup Plastik 14 oz":"Pack","Tutup Gelas":"Pack","Cup Sauce":"Pack","Sedotan":"Pack","Hand Gloves":"Pack","Kresek Kecil":"Pack","Kresek Besar":"Pack","Kresek Gelas":"Pack","Bangor Thermal Bag":"Pack","Kupon Umroh":"Buku","Packaging Box Sultan":"Ikat","Minyak Padat":"Dus","Box Hampers":"Pcs","Grill Box":"Pcs","Inner":"Pcs","Sabun Cuci Piring Mitra":"Jrg","Sabun Cuci Tangan @5 Liter":"Jrg","Sabun Lantai Mitra":"Jrg","Hand Sanitizer":"Jrg","Sabun MPC":"Jrg","Sabun Kerak":"Jrg","Kaus Seragam M":"Pcs","Kaus Seragam L":"Pcs","Kaus Seragam XL":"Pcs","Kaus Seragam XXL":"Pcs","Kaus Seragam XXXL":"Pcs","Topi":"Pcs","Bangor Crazy Bucket":"Pack","Polo Shirt S":"Pcs","Polo Shirt M":"Pcs","Polo Shirt L":"Pcs","Polo Shirt XL":"Pcs","Polo Shirt XXL":"Pcs","Polo Shirt XXXL":"Pcs","Apron":"Pcs","Seragam Owner S":"Pcs","Seragam Owner M":"Pcs","Seragam Owner L":"Pcs","Seragam Owner XL":"Pcs","Seragam Owner XXL":"Pcs","Seragam Owner XXXL":"Pcs","Cetakan Telur":"Pcs","Bangor Chicken Wings":"Pack","Kertas Thermal":"Pack","Saos Tomat Jerigen Delmonte":"Jrg"
  },
  BOX_CAPACITY: {
    "Beef Patty Small":18,"Beef Patty Large":18,"Keju Slice Non Brand":12,"Keju Slice Non Brand A":12,"Chicken Nugget":10,"HD Bun":30,"Burger Bun":20,"Kentang Goreng":15,"Kentang Goreng Mc Cain":20,"Bangor Fried Chicken":6,"Spicy Chicken Nugget":5,"Spicy Chicken Patty":10,"Sosis":10,"Ayam Crispy":10,"Dori Crispy":24,"BEEF SLICE":40,"Smoke Beef Slice":150,"Thousand Island Mayonaise":20,"BBQ Sauce":20,"BBQ Spicy":20,"Bolognese Sauce 500gr":20,"Cheese Sauce":12,"Nacho Sauce New":24,"Mayonaise Garlic":20,"Nestea Lemontea":12,"Butter":40,"Sambal Sachet Bangor":1,"Minyak Padat":1,"Kertas Nasi":20,"Paper Kentang":30,"Tray Kentang":60,"Paper Bag":30,"Packaging Box Sultan":50,"Packaging HD":50,"Kertas Printer":10,"Cup Plastik 14 oz":40,"Tutup Gelas":40,"Cup Sauce":24,"Sedotan":50,"Hand Gloves":150,"Kresek Kecil":50,"Kresek Besar":50,"Kresek Gelas":50,"Kaus Seragam M":50,"Kaus Seragam L":50,"Kaus Seragam XL":50,"Kaus Seragam XXL":50,"Kaus Seragam XXXL":50,"Topi":50,"Box Hampers":50,"Grill Box":50,"Inner":50,"Bangor Crazy Bucket":9,"Spunbond Bangor":50,"Bangor Thermal Bag":5,"Sticker Labeling":100,"Polo Shirt S":50,"Polo Shirt M":50,"Polo Shirt L":50,"Polo Shirt XL":50,"Polo Shirt XXL":50,"Polo Shirt XXXL":50,"Apron":50,"Seragam Owner S":50,"Seragam Owner M":50,"Seragam Owner L":50,"Seragam Owner XL":50,"Seragam Owner XXL":50,"Seragam Owner XXXL":50,"Cetakan Telur":2,"Sabun Cuci Piring Mitra":1,"Sabun Cuci Tangan @5 Liter":1,"Sabun Lantai Mitra":1,"Hand Sanitizer":1,"Sabun MPC":1,"Sabun Kerak":1,"Tissue Pop Up":50,"Bangor Chicken Wings":6,"Kertas Thermal":10,"Saos Tomat Jerigen Delmonte":1,"Kupon Umroh":200
  },
  HOLIDAYS: [],
  OUTLET_INFO: {
    "BANGOR PONDOK GEDE": { name: "Budi Santoso", phone: "081234567890", address: "Jl. Pondok Gede Raya No. 10, Bekasi" },
    "BANGOR KALIMALANG": { name: "Siti Aminah", phone: "081234567891", address: "Jl. Kalimalang No. 22, Jakarta Timur" }
  },
  KODE_BARANG: { "BP-SML": "Beef Patty Small", "BP-LRG": "Beef Patty Large", "CS-01": "Chicken Nugget" },
  ITEM_WEIGHT_GRAMS: { "Beef Patty Small": 1000, "Beef Patty Large": 1200, "Chicken Nugget": 500, "HD Bun": 800 }
};

// Ensure master_data.json exists — seed from committed data/ for zero-error (Vercel /tmp is empty on cold start)
if (!fs.existsSync(path.join(DATA_DIR, MASTER_FILE))) {
  try {
    const committed = path.join(process.cwd(), "data", MASTER_FILE);
    if (fs.existsSync(committed)) {
      fs.copyFileSync(committed, path.join(DATA_DIR, MASTER_FILE));
    } else {
      jsonWrite(MASTER_FILE, FALLBACK_MASTER_DATA);
    }
  } catch { jsonWrite(MASTER_FILE, FALLBACK_MASTER_DATA); }
}

// ===== Auth helpers =====
function requireAdmin(req: any, res: any, next: any) {
  const key = req.query.admin_key || req.body?.admin_key;
  if (key !== ADMIN_SECRET) return res.status(401).send("Unauthorized");
  next();
}
function requireBearer(req: any, res: any, next: any) {
  // optional bearer check - warn but allow
  next();
}

// ===== Supabase User Management (Login Page + Admin RM) =====
// Helper: get user from Supabase JWT (Authorization: Bearer <jwt>)
async function getUserFromReq(req: any): Promise<{ id: string, email: string, role: string } | null> {
  try {
    const auth = String(req.headers.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return null;
    const sb = await getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) return null;
    const uid = data.user.id;
    const email = (data.user.email || "").toLowerCase();
    // Fetch role from profiles (service_role bypass RLS, but we use same client)
    const { data: prof } = await sb.from("profiles").select("role,email").eq("id", uid).single();
    const role = prof?.role || (email === "majestap93@gmail.com" ? "SuperAdmin" : "LogisticVittoria");
    // Auto-fix SuperAdmin for majestap93@gmail.com if role is not SuperAdmin
    if (email === "majestap93@gmail.com" && role !== "SuperAdmin") {
      await sb.from("profiles").upsert({ id: uid, email, role: "SuperAdmin" }, { onConflict: "id" });
      return { id: uid, email, role: "SuperAdmin" };
    }
    return { id: uid, email, role };
  } catch { return null; }
}
async function requireSupabaseAdmin(req: any, res: any, next: any) {
  const user = await getUserFromReq(req);
  if (!user || !["SuperAdmin","Admin"].includes(user.role)) return res.status(403).json({ error: "Admin only" });
  (req as any).supaUser = user;
  next();
}

// GET /api/me — who am I (role)
app.get("/api/me", async (req, res) => {
  const user = await getUserFromReq(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  res.json(user);
});

// GET /api/users — list profiles (Admin only)
app.get("/api/users", requireSupabaseAdmin, async (_req, res) => {
  const sb = await getSupabase();
  if (!sb) return res.status(500).json({ error: "Supabase not configured" });
  const { data, error } = await sb.from("profiles").select("id,email,role,alias,created_at").order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/users — Admin creates account (email+password+role) — no public signup
app.post("/api/users", requireSupabaseAdmin, async (req, res) => {
  const { email, password, role, alias } = req.body;
  if (!email || !password || !role) return res.status(400).json({ error: "Missing email/password/role" });
  const allowed = ["SuperAdmin","Admin","JendralVittoria","InventoryVittoria","TSAVittoria","LogisticVittoria"];
  if (!allowed.includes(role)) return res.status(400).json({ error: "Invalid role" });
  // Prevent creating another SuperAdmin unless requester is SuperAdmin
  const requester = (req as any).supaUser;
  if (role === "SuperAdmin" && requester.role !== "SuperAdmin") return res.status(403).json({ error: "Only SuperAdmin can create SuperAdmin" });
  const sb = await getSupabase();
  if (!sb) return res.status(500).json({ error: "Supabase not configured" });
  const { data, error } = await sb.auth.admin.createUser({ email: String(email).toLowerCase().trim(), password, email_confirm: true, user_metadata: { alias: alias || email.split("@")[0], role } });
  if (error) return res.status(400).json({ error: error.message });
  const uid = data.user?.id;
  if (uid) {
    // Ensure profile role (trigger should have created, but upsert to be sure)
    await sb.from("profiles").upsert({ id: uid, email: String(email).toLowerCase().trim(), role, alias: alias || email.split("@")[0] }, { onConflict: "id" });
  }
  res.json({ status: "success", id: uid });
});

// PATCH /api/users/:id — Admin edits role/alias
app.patch("/api/users/:id", requireSupabaseAdmin, async (req, res) => {
  const { role, alias } = req.body;
  const id = req.params.id;
  const sb = await getSupabase();
  if (!sb) return res.status(500).json({ error: "Supabase not configured" });
  const updates: any = {};
  if (role) {
    const allowed = ["SuperAdmin","Admin","JendralVittoria","InventoryVittoria","TSAVittoria","LogisticVittoria"];
    if (!allowed.includes(role)) return res.status(400).json({ error: "Invalid role" });
    const requester = (req as any).supaUser;
    if (role === "SuperAdmin" && requester.role !== "SuperAdmin") return res.status(403).json({ error: "Only SuperAdmin can assign SuperAdmin" });
    updates.role = role;
  }
  if (alias !== undefined) updates.alias = alias;
  if (Object.keys(updates).length===0) return res.status(400).json({ error: "No updates" });
  const { error } = await sb.from("profiles").update(updates).eq("id", id);
  if (error) return res.status(400).json({ error: error.message });
  // Also update auth user_metadata if alias
  if (alias) try { await sb.auth.admin.updateUserById(id, { user_metadata: { alias } }); } catch {}
  res.json({ status: "success" });
});

// DELETE /api/users/:id — Admin removes account
app.delete("/api/users/:id", requireSupabaseAdmin, async (req, res) => {
  const id = req.params.id;
  // Prevent self-delete and SuperAdmin delete by non-SuperAdmin
  const requester = (req as any).supaUser;
  if (id === requester.id) return res.status(400).json({ error: "Cannot delete self" });
  const sb = await getSupabase();
  if (!sb) return res.status(500).json({ error: "Supabase not configured" });
  const { data: target } = await sb.from("profiles").select("role").eq("id", id).single();
  if (target?.role === "SuperAdmin" && requester.role !== "SuperAdmin") return res.status(403).json({ error: "Only SuperAdmin can delete SuperAdmin" });
  const { error } = await sb.auth.admin.deleteUser(id);
  if (error) return res.status(400).json({ error: error.message });
  await sb.from("profiles").delete().eq("id", id);
  res.json({ status: "success" });
});

// Health
app.get("/api/health", (_req, res) => res.json({ status: "ok", version: "2.0.0", wib: wibNowStr(), supabase: isSupabaseConfigured, pythonAnywhere: !!PYTHONANYWHERE_URL }));

// ===== Master Data — PythonAnywhere primary (user reverted), Supabase/file fallback =====
app.get("/api/master_data", async (req, res) => {
  const live = await fetchPythonAnywhereMaster();
  if (live) return res.json(live);
  const supa = await fetchSupabaseMaster();
  if (supa) return res.json(supa);
  const data = jsonRead<any>(MASTER_FILE, FALLBACK_MASTER_DATA);
  res.json(data);
});
app.get("/static/master_data.json", async (req, res) => {
  const live = await fetchPythonAnywhereMaster();
  if (live) return res.json(live);
  const supa = await fetchSupabaseMaster();
  if (supa) return res.json(supa);
  const data = jsonRead<any>(MASTER_FILE, FALLBACK_MASTER_DATA);
  res.json(data);
});
app.post("/api/master_data/sync", async (req, res) => {
  const live = await fetchPythonAnywhereMaster();
  if (live) return res.json({ status: "synced", source: PYTHONANYWHERE_URL, data: live });
  const supa = await fetchSupabaseMaster();
  if (supa) return res.json({ status: "synced", source: "supabase", data: supa });
  return res.status(502).json({ error: "PythonAnywhere and Supabase unreachable", fallback: jsonRead(MASTER_FILE, FALLBACK_MASTER_DATA) });
});
app.post("/api/master_data", requireAdmin, async (req, res) => {
  const md = req.body.master_data;
  if (!md) return res.status(400).json({ error: "Missing master_data" });
  // backup locally
  const backupsDir = path.join(DATA_DIR, "backups");
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  try { fs.writeFileSync(path.join(backupsDir, `master_${stamp}.json`), JSON.stringify(jsonRead(MASTER_FILE, FALLBACK_MASTER_DATA), null, 2)); } catch {}
  jsonWrite(MASTER_FILE, md);
  // Also push to PythonAnywhere to keep it as source of truth (per user revert)
  (async () => {
    try {
      const c = new AbortController(); const tt = setTimeout(()=> c.abort(), 5000);
      await fetch(`${PYTHONANYWHERE_URL}/api/master_data`, { method: "POST", headers: { ...PY_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ admin_key: ADMIN_SECRET, master_data: md }), signal: c.signal } as any);
      clearTimeout(tt);
    } catch {}
  })();
  // Also save to Supabase if configured (keeps Supabase in sync)
  saveSupabaseMaster(md).catch(()=>{});
  res.json({ status: "success", synced_to: PYTHONANYWHERE_URL });
});
app.get("/api/master_backups", requireAdmin, (req, res) => {
  const backupsDir = path.join(DATA_DIR, "backups");
  if (!fs.existsSync(backupsDir)) return res.json([]);
  const files = fs.readdirSync(backupsDir).filter(f=>f.endsWith(".json")).sort().reverse();
  res.json(files);
});
app.get("/api/master_backups/:file", requireAdmin, (req, res) => {
  const p = path.join(DATA_DIR, "backups", req.params.file);
  if (!fs.existsSync(p)) return res.status(404).json({ error: "Not found" });
  res.json(JSON.parse(fs.readFileSync(p, "utf-8")));
});

// ===== Current Stock — PythonAnywhere primary, Supabase fallback =====
app.get("/api/current_stock", async (req, res) => {
  const live = await fetchPythonAnywhereStock();
  if (live) { try { jsonWrite("current_stock.json", live); } catch {} return res.json(live); }
  const supa = await fetchSupabaseStock();
  if (supa) { try { jsonWrite("current_stock.json", supa); } catch {} return res.json(supa); }
  const stock = jsonRead<Record<string,number>>("current_stock.json", { "Beef Patty Small": 500, "Chicken Nugget": 300, "HD Bun": 1000 });
  res.json(stock);
});
app.post("/api/current_stock", requireAdmin, async (req, res) => {
  const stock = req.body.stock_data;
  if (!stock) return res.status(400).json({ error: "Missing stock_data" });
  jsonWrite("current_stock.json", stock);
  const ledger = jsonRead<Record<string, any[]>>("ledger.json", {});
  for (const [sku, qty] of Object.entries(stock as Record<string,number>)) {
    if (!ledger[sku]) ledger[sku] = [];
  }
  jsonWrite("ledger.json", ledger);
  saveSupabaseStock(stock).catch(()=>{});
  // Also mirror to PythonAnywhere
  (async()=>{ try{ const c=new AbortController(); const tt=setTimeout(()=>c.abort(),4000); await fetch(`${PYTHONANYWHERE_URL}/api/current_stock`,{method:"POST",headers:{...PY_HEADERS,"Content-Type":"application/json"},body:JSON.stringify({admin_key:ADMIN_SECRET,stock_data:stock}),signal:c.signal} as any); clearTimeout(tt);}catch{}})();
  res.json({ status: "success" });
});
app.get("/api/ledger/get", requireAdmin, (req, res) => {
  const ledger = jsonRead("ledger.json", {});
  res.json(ledger);
});
app.post("/api/ledger/record", (req, res) => {
  const { hwid, outlet, items } = req.body;
  if (!outlet || !items) return res.status(400).json({ error: "Missing outlet/items" });
  const ledger = jsonRead<Record<string, any[]>>("ledger.json", {});
  const now = wibNowStr();
  for (const [sku, qty] of Object.entries(items as Record<string, number>)) {
    if (!ledger[sku]) ledger[sku] = [];
    ledger[sku].push({ timestamp: now, hwid: hwid || "web", outlet, qty });
  }
  jsonWrite("ledger.json", ledger);
  res.json({ status: "success" });
});

// ===== Checkers =====
const CHECKERS_FILE = "checkers.json";
const DEFAULT_CHECKERS = ["Masroor","Aji","Fadly","Luthfi","Farel","Diki","Noel","Hatta"];
app.get("/api/checkers", async (req, res) => {
  const live = await fetchPythonAnywhereCheckers();
  if (live) { try { jsonWrite(CHECKERS_FILE, { checkers: live }); } catch {} return res.json({ checkers: live }); }
  const supa = await fetchSupabaseCheckers();
  if (supa) { try { jsonWrite(CHECKERS_FILE, { checkers: supa }); } catch {} return res.json({ checkers: supa }); }
  const data = jsonRead<any>(CHECKERS_FILE, { checkers: DEFAULT_CHECKERS });
  const list = data.checkers || DEFAULT_CHECKERS;
  res.json({ checkers: list });
});
app.post("/api/checkers", async (req, res) => {
  const { admin_key, action, checker_name } = req.body;
  if (admin_key !== ADMIN_SECRET) return res.status(401).send("Unauthorized");
  if (!checker_name) return res.status(400).json({ error: "Missing checker_name" });
  const data = jsonRead<any>(CHECKERS_FILE, { checkers: [...DEFAULT_CHECKERS] });
  let list: string[] = data.checkers;
  if (action === "add") {
    if (list.includes(checker_name)) return res.status(409).json({ error: "Exists" });
    list.push(checker_name);
  } else if (action === "remove") {
    if (!list.includes(checker_name)) return res.status(404).json({ error: "Not found" });
    list = list.filter(c=>c!==checker_name);
  } else return res.status(400).json({ error: "Invalid action" });
  jsonWrite(CHECKERS_FILE, { checkers: list });
  saveSupabaseCheckers(list).catch(()=>{});
  (async()=>{ try{ const c=new AbortController(); const tt=setTimeout(()=>c.abort(),4000); await fetch(`${PYTHONANYWHERE_URL}/api/checkers`,{method:"POST",headers:{...PY_HEADERS,"Content-Type":"application/json"},body:JSON.stringify({admin_key:ADMIN_SECRET,action,checker_name}),signal:c.signal} as any); clearTimeout(tt);}catch{}})();
  res.json({ status: "success" });
});

// ===== Packing Status (Live Board) =====
app.get("/api/packing_status", (req, res) => {
  const data = jsonRead<any[]>("packing_status.json", []);
  res.json(data);
});
app.post("/api/packing_status", (req, res) => {
  const { delivery_no, outlet, checker, status, total_weight_kg } = req.body;
  if (!delivery_no) return res.status(400).json({ error: "Missing delivery_no" });
  const statuses = jsonRead<any[]>("packing_status.json", []);
  let found = statuses.find(s=>s.delivery_no===delivery_no);
  if (found) {
    found.outlet = outlet ?? found.outlet;
    found.checker = checker ?? found.checker;
    found.status = status ?? found.status;
    if (total_weight_kg!==undefined) found.total_weight_kg = total_weight_kg;
    if (status==="IN PROGRESS") found.created_at = wibNowStr();
  } else {
    statuses.push({ delivery_no, outlet: outlet||"Unknown", checker: checker||"Unknown", status: status||"PENDING", total_weight_kg: total_weight_kg||0, created_at: wibNowStr(), scanned_at: "" });
  }
  jsonWrite("packing_status.json", statuses);
  res.json({ status: "success" });
});
app.get("/scan/:delivery_no", (req, res) => {
  // Compatibility: redirect to frontend scan page handled by frontend, but provide API
  res.json({ delivery_no: req.params.delivery_no });
});
app.post("/api/scan/:delivery_no", (req, res) => {
  const delivery_no = decodeURIComponent(req.params.delivery_no);
  const { checker, dus_l, dus_s, dus_besar } = req.body;
  const statuses = jsonRead<any[]>("packing_status.json", []);
  const entry = statuses.find(s=>s.delivery_no===delivery_no);
  if (!entry) return res.status(404).json({ error: "Not found" });
  if (entry.status==="READY"||entry.status==="CANCELLED") return res.status(400).json({ error: "Already processed" });
  entry.status = "READY";
  if (checker) entry.checker = checker;
  entry.dus_l = Number(dus_l)||0; entry.dus_s = Number(dus_s)||0; entry.dus_besar = Number(dus_besar)||0;
  entry.scanned_at = new Date().toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta"});
  jsonWrite("packing_status.json", statuses);
  res.json({ status: "success", entry });
});
// Pretty HTML scan pages (for QR)
app.get("/scan/*", (req, res) => {
  const delivery_no = decodeURIComponent((req.params as any)[0] || "");
  const statuses = jsonRead<any[]>("packing_status.json", []);
  const entry = statuses.find(s=>s.delivery_no===delivery_no);
  if (!entry) return res.status(404).send("<h1>❌ Not found</h1>");
  if (entry.status==="READY"||entry.status==="CANCELLED") {
    return res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h1 style="color:#c0392b">⛔ SCAN REJECTED</h1><p>Already ${entry.status} at ${entry.scanned_at}</p><p>${delivery_no}</p></body></html>`);
  }
  const checkers = jsonRead<any>(CHECKERS_FILE, { checkers: DEFAULT_CHECKERS }).checkers;
  const opts = checkers.map((c:string)=>`<option value="${c}">${c}</option>`).join("");
  res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verify Packing</title></head><body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f4f6f9"><div style="background:white;padding:32px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);max-width:420px;width:100%;text-align:center"><h1>📦 VERIFY PACKING</h1><p>Outlet: <b>${entry.outlet}</b><br>DO: ${delivery_no}</p><form method="POST" action="/api/scan/${encodeURIComponent(delivery_no)}"><select name="checker" required style="width:100%;padding:10px;margin:10px 0"><option value="">Select Checker</option>${opts}</select><div style="display:flex;gap:8px;margin:10px 0"><input name="dus_l" type="number" placeholder="Dus L" value="0" style="flex:1;padding:8px"/><input name="dus_s" type="number" placeholder="Dus S" value="0" style="flex:1;padding:8px"/><input name="dus_besar" type="number" placeholder="Dus Besar" value="0" style="flex:1;padding:8px"/></div><button type="submit" style="width:100%;padding:12px;background:#27ae60;color:white;border:none;border-radius:8px;font-weight:bold">CONFIRM & FINALIZE</button></form></div></body></html>`);
});

// ===== Packing Board update via PUT for status override =====
app.put("/api/packing_status/:delivery_no", (req, res) => {
  const dn = decodeURIComponent(req.params.delivery_no);
  const { status, checker } = req.body;
  const statuses = jsonRead<any[]>("packing_status.json", []);
  const entry = statuses.find(s=>s.delivery_no===dn);
  if (!entry) return res.status(404).json({ error: "Not found" });
  if (status) entry.status = status;
  if (checker) entry.checker = checker;
  if (status==="READY") entry.scanned_at = new Date().toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta"});
  jsonWrite("packing_status.json", statuses);
  res.json({ status: "success" });
});

// ===== Upload packing list =====
const upload = multer({ dest: UPLOAD_DIR });
app.post("/api/upload_packing_list", upload.single("file"), (req, res) => {
  // just ack
  res.json({ status: "success", filename: req.file?.originalname });
});
app.post("/api/track_item_usage", (req, res) => {
  const usage = jsonRead<any[]>("item_usage.json", []);
  usage.push({ ...req.body, timestamp: wibNowStr() });
  jsonWrite("item_usage.json", usage);
  res.json({ status: "success" });
});

// ===== Wallet =====
app.get("/api/wallet_info", (req, res) => {
  const hwid = String(req.query.hwid||"");
  const wallet = jsonRead<Record<string,any>>("wallet.json", {});
  const dbLines = txtReadLines("database.txt");
  let found=false, expiry=null;
  for (const line of dbLines) {
    const parts=line.split(":");
    if (parts[0]===hwid) { found=true; expiry=parts[3]||null; break; }
  }
  const balance = wallet[hwid]?.balance || 0;
  if (!found) return res.json({ status:"UNREGISTERED", balance:0, expiry:null });
  res.json({ status:"REGISTERED", balance, expiry });
});
app.post("/api/register_trial", (req,res)=>{
  const { hwid } = req.body;
  if(!hwid) return res.status(400).json({error:"Missing HWID"});
  const dbPath = path.join(DATA_DIR,"database.txt");
  if (fs.existsSync(dbPath)){
    const content=fs.readFileSync(dbPath,"utf-8");
    if (content.includes(hwid+":")) return res.status(409).json({error:"Exists"});
  }
  const wib = getWibTime(); wib.setDate(wib.getDate()+3);
  const exp = `${wib.getFullYear()}${String(wib.getMonth()+1).padStart(2,"0")}${String(wib.getDate()).padStart(2,"0")}`;
  fs.appendFileSync(dbPath, `${hwid}:Trial-User:ACTIVE:${exp}\n`);
  res.json({ status:"success", expiry:exp });
});
app.post("/api/extend_license", (req,res)=>{
  const { hwid, days } = req.body;
  const d = Number(days);
  const prices:Record<number,number>={30:100000,90:270000,180:518000,365:912000};
  if(!(d in prices)) return res.status(400).json({error:"Invalid plan"});
  const price=prices[d];
  const wallet=jsonRead<Record<string,any>>("wallet.json",{});
  if(!wallet[hwid]||wallet[hwid].balance<price) return res.status(400).json({error:"Insufficient Balance"});
  wallet[hwid].balance-=price; jsonWrite("wallet.json", wallet);
  const wib=getWibTime(); wib.setDate(wib.getDate()+d);
  const exp=`${wib.getFullYear()}${String(wib.getMonth()+1).padStart(2,"0")}${String(wib.getDate()).padStart(2,"0")}`;
  const dbPath=path.join(DATA_DIR,"database.txt");
  let lines: string[]=[];
  let found=false;
  if(fs.existsSync(dbPath)) lines=fs.readFileSync(dbPath,"utf-8").split("\n").filter(Boolean);
  lines=lines.map(l=>{ if(l.startsWith(hwid+":")){ found=true; return `${hwid}:Auto-Paid-Via-QRIS:ACTIVE:${exp}`;} return l;});
  if(!found) lines.push(`${hwid}:Auto-Paid-Via-QRIS:ACTIVE:${exp}`);
  fs.writeFileSync(dbPath, lines.join("\n")+"\n");
  res.json({ status:"success", new_balance: wallet[hwid].balance });
});
app.post("/api/topup_request", (req,res)=>{
  const { hwid, amount } = req.body;
  if(Number(amount)<10000) return res.status(400).json({error:"Minimum 10000"});
  const order_id=`TOPUP-${hwid}-${Date.now()}`;
  // mock QR response - in production integrate Midtrans
  res.json({ status:"pending", order_id, amount, qr_string:`MOCK_QR_${order_id}`, message:"Scan QR to pay (Sandbox mock)" });
});
app.post("/api/payment_webhook", (req,res)=>{
  const { transaction_status, order_id, gross_amount } = req.body;
  if(order_id?.startsWith("TOPUP-") && ["capture","settlement"].includes(transaction_status)){
    const hwid=order_id.split("-")[1];
    const wallet=jsonRead<Record<string,any>>("wallet.json",{});
    if(!wallet[hwid]) wallet[hwid]={balance:0};
    wallet[hwid].balance+=Number(gross_amount)||0;
    jsonWrite("wallet.json", wallet);
  }
  res.send("OK");
});

// ===== Outbound Manifests =====
app.get("/api/outbound_manifests", (req,res)=>{
  res.json(jsonRead("outbound_manifests.json", []));
});
app.post("/api/outbound_manifests", (req,res)=>{
  const manifests=jsonRead<any[]>("outbound_manifests.json",[]);
  const manifest_id=`MAN-${Date.now()}`;
  const m={ manifest_id, manifest_name:req.body.manifest_name||"Unnamed", truck_plate:req.body.truck_plate||"Unknown", driver:req.body.driver||"Unknown", created_by:req.body.created_by||"Nur", created_at:wibNowStr(), outlets:req.body.outlets||[], status:"MANIFESTED", loading_started_at:null, loading_finished_at:null, loaded_by:null };
  manifests.push(m); jsonWrite("outbound_manifests.json", manifests);
  res.status(201).json({ status:"success", manifest_id });
});
app.put("/api/outbound_manifests/:id", (req,res)=>{
  const manifests=jsonRead<any[]>("outbound_manifests.json",[]);
  const m=manifests.find(x=>x.manifest_id===req.params.id);
  if(!m) return res.status(404).json({error:"Not found"});
  const { status, loaded_by }=req.body;
  if(status){ m.status=status; if(status==="LOADING") m.loading_started_at=wibNowStr(); if(status==="DISPATCHED"){ m.loading_finished_at=wibNowStr(); m.loaded_by=loaded_by||"Unknown"; } }
  jsonWrite("outbound_manifests.json", manifests);
  res.json({ status:"success" });
});

// ===== Inbound Logs =====
app.get("/api/inbound_logs", (req,res)=>{
  if(req.query.admin_key!==ADMIN_SECRET) return res.status(401).send("Unauthorized");
  const logs=jsonRead<any[]>("inbound_logs.json",[]);
  logs.sort((a,b)=>(b.timestamp||"").localeCompare(a.timestamp||""));
  res.json(logs);
});
app.post("/api/inbound_logs", (req,res)=>{
  const payload=Array.isArray(req.body)?req.body:[req.body];
  const logs=jsonRead<any[]>("inbound_logs.json",[]);
  for(const e of payload){ logs.push({ timestamp: e.timestamp||wibNowStr(), pic:e.pic||"Unknown", warehouse:e.warehouse||"DC VITTORIA", vendor:e.vendor||"Unknown", sku:e.sku||"Unknown", uom:e.uom||"Unit", po_qty:e.po_qty||"", received_qty:e.received_qty||0, rejected_qty:e.rejected_qty||"", time_to_load:e.time_to_load||"", total_weight_kg:e.total_weight_kg||0 }); }
  jsonWrite("inbound_logs.json", logs);
  res.status(201).json({ status:"success", logged_entries: payload.length });
});

// Inbound Plan
app.get("/api/inbound_plan", (req,res)=>{
  const plan=jsonRead<Record<string,any>>("inbound_plan.json",{});
  const d=String(req.query.date||"");
  if(d) return res.json(plan[d]||[]);
  res.json(plan);
});
app.post("/api/inbound_plan", (req,res)=>{
  const { date, vendors }=req.body;
  if(!date) return res.status(400).json({error:"Missing date"});
  const plan=jsonRead<Record<string,any>>("inbound_plan.json",{});
  plan[date]=vendors||[];
  jsonWrite("inbound_plan.json", plan);
  res.json({ status:"success" });
});

// Driver Queue
app.get("/api/driver_queue", (req,res)=>{ res.json(jsonRead("driver_queue.json",[])); });
app.post("/api/driver_queue", (req,res)=>{
  const { driver_name, vehicle_plate, vendor, status }=req.body;
  const q=jsonRead<any[]>("driver_queue.json",[]);
  let found=q.find(x=>x.vehicle_plate===vehicle_plate);
  if(found){ found.status=status||found.status; if(status==="FINISH") found.finished_at=wibNowStr(); }
  else q.push({ driver_name:driver_name||"Unknown", vehicle_plate:vehicle_plate||"Unknown", vendor:vendor||"Unknown", status:status||"CHECKED IN", checked_in_at:wibNowStr(), finished_at:null });
  jsonWrite("driver_queue.json", q);
  res.json({ status:"success" });
});

// Inbound Draft
app.get("/api/inbound_draft", (req,res)=>{
  const user=String(req.query.user||"");
  if(!user) return res.status(400).json({error:"Missing user"});
  const drafts=jsonRead<Record<string,any>>("inbound_drafts.json",{});
  res.json(drafts[user]||null);
});
app.post("/api/inbound_draft", (req,res)=>{
  const user=String(req.query.user||"");
  if(!user) return res.status(400).json({error:"Missing user"});
  const drafts=jsonRead<Record<string,any>>("inbound_drafts.json",{});
  drafts[user]={ vendor_name:req.body.vendor_name||"", cart:req.body.cart||{}, start_time:req.body.start_time||null, saved_at:wibNowStr() };
  jsonWrite("inbound_drafts.json", drafts);
  res.json({ status:"success" });
});
app.delete("/api/inbound_draft", (req,res)=>{
  const user=String(req.query.user||"");
  if(!user) return res.status(400).json({error:"Missing user"});
  const drafts=jsonRead<Record<string,any>>("inbound_drafts.json",{});
  if(drafts[user]){ delete drafts[user]; jsonWrite("inbound_drafts.json", drafts); }
  res.json({ status:"success" });
});

// Audit Logs
app.get("/api/audit_logs", (req,res)=>{
  if(req.query.admin_key!==ADMIN_SECRET) return res.status(401).send("Unauthorized");
  const logs=jsonRead<any[]>("audit_logs.json",[]);
  res.json(logs.sort((a,b)=>(b.timestamp||"").localeCompare(a.timestamp||"")));
});
app.post("/api/audit_logs", (req,res)=>{
  const logs=jsonRead<any[]>("audit_logs.json",[]);
  logs.push({ timestamp:req.body.timestamp||wibNowStr(), user:req.body.user||"Unknown", role:req.body.role||"Unknown", action_type:req.body.action_type||"UNKNOWN", details:req.body.details||"" });
  if(logs.length>5000) logs.splice(0, logs.length-5000);
  jsonWrite("audit_logs.json", logs);
  res.status(201).json({ status:"success" });
});

// Staff Roster & OT
app.get("/api/staff_roster", (req,res)=>{
  if(req.query.admin_key!==ADMIN_SECRET) return res.status(401).send("Unauthorized");
  res.json(jsonRead("staff_roster.json", {}));
});
app.post("/api/staff_roster", (req,res)=>{
  if(req.body.admin_key!==ADMIN_SECRET) return res.status(401).send("Unauthorized");
  const id=req.body.staff_id;
  if(!id) return res.status(400).json({error:"Missing staff_id"});
  const roster=jsonRead<Record<string,any>>("staff_roster.json",{});
  roster[id]={ name:req.body.name||"Unknown", role:req.body.role||"Packer", status:req.body.status||"Active", join_date:req.body.join_date||new Date().toISOString().slice(0,10) };
  jsonWrite("staff_roster.json", roster);
  res.json({ status:"success", staff_id:id });
});
app.delete("/api/staff_roster/:id", (req,res)=>{
  if(req.query.admin_key!==ADMIN_SECRET) return res.status(401).send("Unauthorized");
  const roster=jsonRead<Record<string,any>>("staff_roster.json",{});
  if(!roster[req.params.id]) return res.status(404).json({error:"Not found"});
  delete roster[req.params.id]; jsonWrite("staff_roster.json", roster);
  res.json({ status:"success" });
});
app.get("/api/staff_ot_logs", (req,res)=>{
  if(req.query.admin_key!==ADMIN_SECRET) return res.status(401).send("Unauthorized");
  const logs=jsonRead<Record<string,any>>("staff_ot_logs.json",{});
  const d=String(req.query.date||""), m=String(req.query.month||"");
  if(d) return res.json(logs[d]||{});
  if(m){ const out:Record<string,any>={}; for(const [k,v] of Object.entries(logs)) if(k.startsWith(m)) out[k]=v; return res.json(out); }
  res.json(logs);
});
app.post("/api/staff_ot_logs", (req,res)=>{
  if(req.body.admin_key!==ADMIN_SECRET) return res.status(401).send("Unauthorized");
  const date=req.body.date;
  if(!date) return res.status(400).json({error:"Missing date"});
  const logs=jsonRead<Record<string,any>>("staff_ot_logs.json",{});
  const rate=20000;
  logs[date]=(req.body.logs||[]).map((e:any)=>({ staff_id:e.staff_id, name:e.name||"Unknown", role:e.role||"Packer", ot_hours:Number(e.ot_hours)||0, cost:(Number(e.ot_hours)||0)*rate, note:e.note||"" }));
  jsonWrite("staff_ot_logs.json", logs);
  res.json({ status:"success", date, entries: logs[date].length });
});

// Auth / License
app.get("/check", (req,res)=>{
  const hwid=String(req.query.id||"");
  const lines=txtReadLines("database.txt");
  for(const line of lines){
    const p=line.split(":");
    if(p[0]===hwid){
      if(p.length>=4) return res.json({ status:p[2], expiry:p[3] });
      if(p.length===3) return res.json({ status:p[1], expiry:p[2] });
    }
  }
  res.json({ status:"NOT_FOUND" });
});
app.post("/register_user", (req,res)=>{
  if(req.body.admin_key!==ADMIN_SECRET) return res.status(401).send("Unauthorized");
  const { hwid, alias, status, expiry }=req.body;
  const newEntry=`${hwid}:${String(alias||"Unknown").replace(/:/g,"-")}:${status}:${expiry}\n`;
  const p=path.join(DATA_DIR,"database.txt");
  let lines:string[]=[];
  let found=false;
  if(fs.existsSync(p)) lines=fs.readFileSync(p,"utf-8").split("\n").filter(Boolean);
  const out=lines.map(l=>{ if(l.startsWith(hwid+":")){ found=true; return newEntry.trim(); } return l; });
  if(!found) out.push(newEntry.trim());
  fs.writeFileSync(p, out.join("\n")+"\n");
  res.send("User Registered Successfully");
});
app.get("/list_users", (req,res)=>{
  if(req.query.admin_key!==ADMIN_SECRET) return res.status(401).send("Unauthorized");
  const lines=txtReadLines("database.txt");
  const users=lines.map(l=>{
    const p=l.split(":");
    if(p.length>=4) return { hwid:p[0], alias:p[1], status:p[2], expiry:p[3] };
    if(p.length===3) return { hwid:p[0], alias:"Unknown", status:p[1], expiry:p[2] };
    return null;
  }).filter(Boolean);
  res.json(users);
});
app.post("/delete_user", (req,res)=>{
  if(req.body.admin_key!==ADMIN_SECRET) return res.status(401).send("Unauthorized");
  const p=path.join(DATA_DIR,"database.txt");
  if(!fs.existsSync(p)) return res.status(404).send("Database empty");
  const lines=fs.readFileSync(p,"utf-8").split("\n").filter(l=>!l.startsWith(req.body.hwid+":")).filter(Boolean);
  fs.writeFileSync(p, lines.join("\n")+(lines.length?"\n":""));
  res.send(`User ${req.body.hwid} deleted`);
});
app.post("/revoke_user", (req,res)=>{
  if(req.body.admin_key!==ADMIN_SECRET) return res.status(401).send("Unauthorized");
  const p=path.join(DATA_DIR,"database.txt");
  if(!fs.existsSync(p)) return res.status(404).send("Database empty");
  let lines=fs.readFileSync(p,"utf-8").split("\n").filter(Boolean);
  let found=false;
  lines=lines.map(l=>{
    const parts=l.split(":");
    if(parts[0]===req.body.hwid){
      found=true;
      // set status to REVOKED
      if(parts.length>=4) return `${parts[0]}:${parts[1]}:REVOKED:${parts[3]}`;
      if(parts.length===3) return `${parts[0]}:REVOKED:${parts[2]}`;
    }
    return l;
  });
  if(!found) return res.status(404).send("Not found");
  fs.writeFileSync(p, lines.join("\n")+"\n");
  res.send("Revoked");
});

// Outlet register (from core.py Typo Guard)
app.post("/api/outlet/register", (req,res)=>{
  const { outlet_name, outlet_data }=req.body;
  if(!outlet_name||!outlet_data) return res.status(400).json({error:"Missing"});
  const md=jsonRead<any>(MASTER_FILE, FALLBACK_MASTER_DATA);
  if(!md.OUTLET_INFO) md.OUTLET_INFO={};
  md.OUTLET_INFO[outlet_name]=outlet_data;
  jsonWrite(MASTER_FILE, md);
  res.json({ status:"success" });
});

// Live telemetry + intercept (light)
app.post("/api/live_status", (req,res)=>{ // used by admin_overhaul radar alternative
  res.json(jsonRead("live_status.json", {}));
});
app.post("/report_crash", (req,res)=>{ 
  const logs=jsonRead<any[]>("crash_logs.json",[]);
  logs.push({ hwid:req.body.hwid, error:req.body.error, timestamp:wibNowStr() });
  jsonWrite("crash_logs.json", logs);
  res.json({ status:"ok" });
});
app.post("/api/intercept", upload.single("file"), (req,res)=>{
  const arr=jsonRead<any[]>("intercepted.json",[]);
  arr.push({ hwid:req.body.hwid, filename:req.file?.originalname, timestamp:wibNowStr() });
  jsonWrite("intercepted.json", arr);
  res.json({ status:"ok" });
});
app.post("/upload_shift", (req,res)=>{
  const shifts=jsonRead<any[]>("shifts.json",[]);
  shifts.push({ ...req.body, received_at:wibNowStr() });
  jsonWrite("shifts.json", shifts);
  res.json({ status:"ok" });
});

// Offline PIN generator - port of Devmode.py (Jesta Offline Vault 2026)
const MAJESTA_SECRET_SALT = process.env.MAJESTA_SECRET_SALT || "JESTA_OFFLINE_VAULT_2026";
function generateOfflinePin(hwid: string, dateStr: string): string {
  const raw = `${hwid}|${dateStr}|${MAJESTA_SECRET_SALT}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const digits = hash.replace(/\D/g, "");
  return digits.slice(0,6).padEnd(6,"0");
}
app.get("/api/offline_pin", (req,res)=>{
  const hwid = String(req.query.hwid||"").toUpperCase().trim();
  if(!hwid || hwid.length!==16) return res.status(400).json({ error:"HWID must be 16 chars" });
  const today = new Date();
  const fmt = (d:Date)=> `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  const todayStr = fmt(today);
  const yest = new Date(today); yest.setDate(yest.getDate()-1);
  const yestStr = fmt(yest);
  res.json({
    hwid,
    today: todayStr,
    yesterday: yestStr,
    pin_today: generateOfflinePin(hwid, todayStr),
    pin_yesterday: generateOfflinePin(hwid, yestStr),
    note: "Verify license status in Admin Panel before sharing PIN"
  });
});
app.post("/api/offline_pin/verify", (req,res)=>{
  const { hwid, pin } = req.body;
  if(!hwid || !pin) return res.status(400).json({ error:"Missing hwid/pin" });
  const today = new Date();
  const fmt = (d:Date)=> `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  const valid = pin === generateOfflinePin(String(hwid).toUpperCase(), fmt(today)) || pin === generateOfflinePin(String(hwid).toUpperCase(), fmt(new Date(today.getTime()-86400000)));
  res.json({ valid });
});

// Version
app.get("/static/version.txt", (req,res)=> res.send("2.0.0"));
app.get("/static/core_update.sha256", (req,res)=> res.send("mock-hash"));

// Static serving for uploads
app.use("/uploads", express.static(UPLOAD_DIR));

// Fallback
app.use((req,res)=> res.status(404).json({ error:"Not found", path:req.path }));

// Export for Vercel serverless, listen only when run directly
export default app;
if (!IS_VERCEL && require.main === module) {
  app.listen(PORT, ()=> {
    console.log(`✅ PLGen Backend 2.0.0 running on http://localhost:${PORT}`);
    console.log(`   WIB Time: ${wibNowStr()} | CORS: ${CORS_ORIGIN} | Vercel:${IS_VERCEL} | Supabase:${isSupabaseConfigured}`);
    console.log(`   Admin secret: ${ADMIN_SECRET.slice(0,3)}*** | API bearer: ${API_BEARER.slice(0,4)}***`);
    if (IS_VERCEL && !isSupabaseConfigured) console.warn("⚠️  Vercel without Supabase: file DB is ephemeral (/tmp) — set SUPABASE_URL+KEY for persistence");
  });
}
