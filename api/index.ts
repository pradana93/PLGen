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
async function fetchSupabasePackingStatus(): Promise<any[] | null> {
  try {
    const sb = await getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.from("packing_status").select("*").order("created_at", { ascending: false }).limit(2000);
    if (!error && data) return data;
  } catch {}
  return null;
}
async function saveSupabasePackingStatus(entry: any): Promise<void> {
  try {
    const sb = await getSupabase();
    if (!sb) return;
    await sb.from("packing_status").upsert(entry, { onConflict: "delivery_no" });
  } catch {}
}
async function fetchSupabaseItemUsage(): Promise<any[] | null> {
  try {
    const sb = await getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.from("item_usage").select("*").order("timestamp", { ascending: false }).limit(5000);
    if (!error && data) return data.map((r:any)=> ({ delivery_no: r.delivery_no, outlet: r.outlet, items: r.items, timestamp: r.timestamp }));
  } catch {}
  return null;
}
async function saveSupabaseItemUsage(entry: any): Promise<void> {
  try {
    const sb = await getSupabase();
    if (!sb) return;
    await sb.from("item_usage").insert(entry);
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
  "BOX_TOLERANCE": 1.859,
  "CATEGORIES": {
    "APPAREL_ITEMS": [
      "Kaus Seragam M",
      "Kaus Seragam L",
      "Kaus Seragam XL",
      "Kaus Seragam XXL",
      "Kaus Seragam XXXL",
      "Topi",
      "Polo Shirt S",
      "Polo Shirt M",
      "Polo Shirt L",
      "Polo Shirt XL",
      "Polo Shirt XXL",
      "Polo Shirt XXXL",
      "Apron",
      "Seragam Owner S",
      "Seragam Owner M",
      "Seragam Owner L",
      "Seragam Owner XL",
      "Seragam Owner XXL",
      "Seragam Owner XXXL",
      "Name Tag"
    ],
    "BIG_ITEMS": [
      "Minyak Padat",
      "Sabun Cuci Piring Mitra",
      "Sabun Lantai Mitra",
      "Sabun MPC",
      "Sabun Kerak",
      "Sambal Sachet Bangor",
      "Saos Tomat Jerigen Delmonte",
      "Pembersih Kerak",
      "Sabun MPC (BBT)",
      "Pembersih Kerak (BBT)",
      "Sabun Cuci Tangan",
      "Hand Sanitizer"
    ],
    "BREAD_ITEMS": [
      "HD Bun",
      "Burger Bun (20)",
      "HD Bun (BBT)",
      "Burger Bun (BBT)"
    ],
    "BUNDLE_ITEMS": [
      "Box Hampers",
      "Grill Box",
      "Inner",
      "Dus Hampers"
    ],
    "FROZEN_ITEMS": [
      "Beef Patty Small",
      "Beef Patty Large",
      "Keju Slice Non Brand",
      "Keju Slice Non Brand A",
      "Chicken Nugget",
      "Spicy Chicken Nugget",
      "Bangor Fried Chicken",
      "Sosis",
      "Ayam Crispy",
      "Dori Crispy",
      "Smoke Beef Slice",
      "Bangor Chicken Wings",
      "Cheese Slice",
      "Beef Slice",
      "Chicken Wings",
      "Spicy Chicken Patty",
      "Beef Patty Large (BBT)",
      "Beef Patty Small (BBT)",
      "Keju Anchor",
      "Jawara Patty"
    ],
    "KENTANG_ITEMS": [
      "Kentang Goreng",
      "Kentang Goreng Mc Cain"
    ],
    "PACKAGING_ITEMS": [
      "Poster Halal",
      "Kertas Nasi",
      "Paper Kentang",
      "Tray Kentang",
      "Paper Bag",
      "Packaging Box Sultan",
      "Packaging HD",
      "Kertas Printer",
      "Cup Plastik 14 oz",
      "Tutup Gelas",
      "Cup Sauce",
      "Sedotan",
      "Hand Gloves",
      "Kresek Kecil",
      "Kresek Besar",
      "Kresek Gelas",
      "Bangor Crazy Bucket",
      "Sticker Labeling",
      "Tissue Pop Up",
      "Box Hampers",
      "Grill Box",
      "Inner",
      "Bangor Thermal Bag",
      "Kertas Thermal",
      "Spunbond Bangor",
      "Spunbond Polos + Sticker",
      "Gelas Plastik",
      "Gelas Plastik + Tutup",
      "Cetakan Telur",
      "Thermal Bag",
      "Tutup Gelas Plastik",
      "Plastik Kresek Gelas",
      "Sticker Labeling (BBT)",
      "Cup Sauce (BBT)",
      "Kresek Gelas (BBT)",
      "Kresek Besar (BBT)",
      "Kresek Kecil (BBT)",
      "Hand Gloves (BBT)",
      "Sedotan (BBT)",
      "Packaging Box Sultan (BBT)",
      "Paper Kentang (BBT)",
      "Paper Bag (BBT)",
      "Tray Kentang (BBT)",
      "Packaging HD (BBT)",
      "Kertas Nasi (BBT)",
      "Kupon Umroh"
    ],
    "SAUCE_ITEMS": [
      "BBQ Sauce",
      "BBQ Spicy",
      "Bolognese Sauce 500gr",
      "Cheese Sauce",
      "Nacho Sauce New",
      "Mayonaise Garlic",
      "Nestea Lemontea",
      "Butter",
      "Thousand Island Mayonaise",
      "Nachos Sauce",
      "Lemon Tea",
      "Thousand Island",
      "Bolognese Sauce",
      "Mayonaise Garlic (BBT)",
      "BBQ Spicy (BBT)",
      "BBQ Sauce (BBT)",
      "Thousand Island (BBT)",
      "Bolognese Sauce (BBT)"
    ]
  },
  "ITEM_UOM": {
    "Kaus Seragam M": "Pcs",
    "Kaus Seragam L": "Pcs",
    "Kaus Seragam XL": "Pcs",
    "Kaus Seragam XXL": "Pcs",
    "Kaus Seragam XXXL": "Pcs",
    "Topi": "Pcs",
    "Polo Shirt S": "Pcs",
    "Polo Shirt M": "Pcs",
    "Polo Shirt L": "Pcs",
    "Polo Shirt XL": "Pcs",
    "Polo Shirt XXL": "Pcs",
    "Polo Shirt XXXL": "Pcs",
    "Apron": "Pcs",
    "Seragam Owner S": "Pcs",
    "Seragam Owner M": "Pcs",
    "Seragam Owner L": "Pcs",
    "Seragam Owner XL": "Pcs",
    "Seragam Owner XXL": "Pcs",
    "Seragam Owner XXXL": "Pcs",
    "Name Tag": "Pack",
    "Minyak Padat": "Dus",
    "Sabun Cuci Piring Mitra": "Jrg",
    "Sabun Lantai Mitra": "Jrg",
    "Sabun MPC": "Jrg",
    "Sabun Kerak": "Jrg",
    "Sambal Sachet Bangor": "Dus",
    "Saos Tomat Jerigen Delmonte": "Jrg",
    "Pembersih Kerak": "Jrg",
    "Sabun MPC (BBT)": "Jrg",
    "Pembersih Kerak (BBT)": "Jrg",
    "Sabun Cuci Tangan": "Jrg",
    "Hand Sanitizer": "Jrg",
    "HD Bun": "Pack",
    "Burger Bun (20)": "Pack",
    "HD Bun (BBT)": "Pack",
    "Burger Bun (BBT)": "Dus",
    "Box Hampers": "Pcs",
    "Grill Box": "Pcs",
    "Inner": "Pcs",
    "Dus Hampers": "Pcs",
    "Beef Patty Small": "Pack",
    "Beef Patty Large": "Pack",
    "Keju Slice Non Brand": "Pack",
    "Keju Slice Non Brand A": "Pack",
    "Chicken Nugget": "Pack",
    "Spicy Chicken Nugget": "Pack",
    "Bangor Fried Chicken": "Pack",
    "Sosis": "Pack",
    "Ayam Crispy": "Pack",
    "Dori Crispy": "Pack",
    "Smoke Beef Slice": "Pack",
    "Bangor Chicken Wings": "Pack",
    "Cheese Slice": "Pack",
    "Beef Slice": "Pack",
    "Chicken Wings": "Pack",
    "Spicy Chicken Patty": "Pack",
    "Beef Patty Large (BBT)": "Pack",
    "Beef Patty Small (BBT)": "Pack",
    "Keju Anchor": "Pack",
    "Jawara Patty": "Pack",
    "Kentang Goreng": "Pack",
    "Kentang Goreng Mc Cain": "Pack",
    "Poster Halal": "Pcs",
    "Kertas Nasi": "Pack",
    "Paper Kentang": "Pack",
    "Tray Kentang": "Pack",
    "Paper Bag": "Pack",
    "Packaging Box Sultan": "Ikat",
    "Packaging HD": "Ikat",
    "Kertas Printer": "Pack",
    "Cup Plastik 14 oz": "Pack",
    "Tutup Gelas": "Pack",
    "Cup Sauce": "Pack",
    "Sedotan": "Pack",
    "Hand Gloves": "Pack",
    "Kresek Kecil": "Pack",
    "Kresek Besar": "Pack",
    "Kresek Gelas": "Pack",
    "Bangor Crazy Bucket": "Pack",
    "Sticker Labeling": "Ikat",
    "Tissue Pop Up": "Pack",
    "Bangor Thermal Bag": "Pack",
    "Kertas Thermal": "Pack",
    "Spunbond Bangor": "Pack",
    "Spunbond Polos + Sticker": "Pcs",
    "Gelas Plastik": "Pack",
    "Gelas Plastik + Tutup": "Pack",
    "Cetakan Telur": "Pcs",
    "Thermal Bag": "Pack",
    "Tutup Gelas Plastik": "Pack",
    "Plastik Kresek Gelas": "Pack",
    "Sticker Labeling (BBT)": "Ikat",
    "Cup Sauce (BBT)": "Pack",
    "Kresek Gelas (BBT)": "Pack",
    "Kresek Besar (BBT)": "Pack",
    "Kresek Kecil (BBT)": "Pack",
    "Hand Gloves (BBT)": "Pack",
    "Sedotan (BBT)": "Pack",
    "Packaging Box Sultan (BBT)": "Ikat",
    "Paper Kentang (BBT)": "Pack",
    "Paper Bag (BBT)": "Pack",
    "Tray Kentang (BBT)": "Pack",
    "Packaging HD (BBT)": "Ikat",
    "Kertas Nasi (BBT)": "Pack",
    "Kupon Umroh": "RIM",
    "BBQ Sauce": "Pack",
    "BBQ Spicy": "Pack",
    "Bolognese Sauce 500gr": "Pack",
    "Cheese Sauce": "Pack",
    "Nacho Sauce New": "Pack",
    "Mayonaise Garlic": "Pack",
    "Nestea Lemontea": "Pack",
    "Butter": "Pack",
    "Thousand Island Mayonaise": "Pack",
    "Nachos Sauce": "Pack",
    "Lemon Tea": "Pack",
    "Thousand Island": "Pack",
    "Bolognese Sauce": "Pack",
    "Mayonaise Garlic (BBT)": "Pack",
    "BBQ Spicy (BBT)": "Pack",
    "BBQ Sauce (BBT)": "Pack",
    "Thousand Island (BBT)": "Pack",
    "Bolognese Sauce (BBT)": "Pack"
  },
  "BOX_CAPACITY": {
    "Kaus Seragam M": 50,
    "Kaus Seragam L": 50,
    "Kaus Seragam XL": 50,
    "Kaus Seragam XXL": 50,
    "Kaus Seragam XXXL": 50,
    "Topi": 50,
    "Polo Shirt S": 50,
    "Polo Shirt M": 50,
    "Polo Shirt L": 50,
    "Polo Shirt XL": 50,
    "Polo Shirt XXL": 50,
    "Polo Shirt XXXL": 50,
    "Apron": 50,
    "Seragam Owner S": 50,
    "Seragam Owner M": 50,
    "Seragam Owner L": 50,
    "Seragam Owner XL": 50,
    "Seragam Owner XXL": 50,
    "Seragam Owner XXXL": 50,
    "Name Tag": 50,
    "Minyak Padat": 1,
    "Sabun Cuci Piring Mitra": 1,
    "Sabun Lantai Mitra": 1,
    "Sabun MPC": 1,
    "Sabun Kerak": 1,
    "Sambal Sachet Bangor": 1,
    "Saos Tomat Jerigen Delmonte": 1,
    "Pembersih Kerak": 1,
    "Sabun MPC (BBT)": 1,
    "Pembersih Kerak (BBT)": 1,
    "Sabun Cuci Tangan": 1,
    "Hand Sanitizer": 1,
    "HD Bun": 30,
    "Burger Bun (20)": 20,
    "HD Bun (BBT)": 30,
    "Burger Bun (BBT)": 1,
    "Box Hampers": 50,
    "Grill Box": 50,
    "Inner": 50,
    "Dus Hampers": 50,
    "Beef Patty Small": 18,
    "Beef Patty Large": 18,
    "Keju Slice Non Brand": 12,
    "Keju Slice Non Brand A": 12,
    "Chicken Nugget": 10,
    "Spicy Chicken Nugget": 5,
    "Bangor Fried Chicken": 6,
    "Sosis": 10,
    "Ayam Crispy": 10,
    "Dori Crispy": 24,
    "Smoke Beef Slice": 150,
    "Bangor Chicken Wings": 6,
    "Cheese Slice": 12,
    "Beef Slice": 40,
    "Chicken Wings": 6,
    "Spicy Chicken Patty": 10,
    "Beef Patty Large (BBT)": 18,
    "Beef Patty Small (BBT)": 18,
    "Keju Anchor": 10,
    "Jawara Patty": 18,
    "Kentang Goreng": 15,
    "Kentang Goreng Mc Cain": 20,
    "Poster Halal": 20,
    "Kertas Nasi": 20,
    "Paper Kentang": 30,
    "Tray Kentang": 60,
    "Paper Bag": 30,
    "Packaging Box Sultan": 50,
    "Packaging HD": 50,
    "Kertas Printer": 10,
    "Cup Plastik 14 oz": 40,
    "Tutup Gelas": 40,
    "Cup Sauce": 24,
    "Sedotan": 50,
    "Hand Gloves": 150,
    "Kresek Kecil": 50,
    "Kresek Besar": 50,
    "Kresek Gelas": 50,
    "Bangor Crazy Bucket": 9,
    "Sticker Labeling": 100,
    "Tissue Pop Up": 50,
    "Bangor Thermal Bag": 5,
    "Kertas Thermal": 10,
    "Spunbond Bangor": 4,
    "Spunbond Polos + Sticker": 200,
    "Gelas Plastik": 40,
    "Gelas Plastik + Tutup": 40,
    "Cetakan Telur": 2,
    "Thermal Bag": 5,
    "Tutup Gelas Plastik": 40,
    "Plastik Kresek Gelas": 50,
    "Sticker Labeling (BBT)": 100,
    "Cup Sauce (BBT)": 24,
    "Kresek Gelas (BBT)": 50,
    "Kresek Besar (BBT)": 50,
    "Kresek Kecil (BBT)": 50,
    "Hand Gloves (BBT)": 150,
    "Sedotan (BBT)": 50,
    "Packaging Box Sultan (BBT)": 50,
    "Paper Kentang (BBT)": 30,
    "Paper Bag (BBT)": 30,
    "Tray Kentang (BBT)": 60,
    "Packaging HD (BBT)": 50,
    "Kertas Nasi (BBT)": 20,
    "Kupon Umroh": 200,
    "BBQ Sauce": 20,
    "BBQ Spicy": 20,
    "Bolognese Sauce 500gr": 20,
    "Cheese Sauce": 12,
    "Nacho Sauce New": 24,
    "Mayonaise Garlic": 20,
    "Nestea Lemontea": 12,
    "Butter": 40,
    "Thousand Island Mayonaise": 20,
    "Nachos Sauce": 24,
    "Lemon Tea": 12,
    "Thousand Island": 20,
    "Bolognese Sauce": 20,
    "Mayonaise Garlic (BBT)": 20,
    "BBQ Spicy (BBT)": 20,
    "BBQ Sauce (BBT)": 20,
    "Thousand Island (BBT)": 20,
    "Bolognese Sauce (BBT)": 20
  },
  "HOLIDAYS": [],
  "OUTLET_INFO": {
    "BANGOR PONDOK GEDE": {
      "name": "Budi Santoso",
      "phone": "081234567890",
      "address": "Jl. Pondok Gede Raya No. 10, Bekasi"
    },
    "BANGOR KALIMALANG": {
      "name": "Siti Aminah",
      "phone": "081234567891",
      "address": "Jl. Kalimalang No. 22, Jakarta Timur"
    }
  },
  "KODE_BARANG": {
    "100001": "Beef Patty Large (BBT)",
    "100002": "Beef Patty Small (BBT)",
    "100008": "Thousand Island (BBT)",
    "100009": "BBQ Sauce (BBT)",
    "100011": "Burger Bun (BBT)",
    "100012": "HD Bun (BBT)",
    "100020": "Mayonaise Garlic (BBT)",
    "100032": "Kertas Nasi (BBT)",
    "100033": "Tray Kentang (BBT)",
    "100037": "Packaging Box Sultan (BBT)",
    "100038": "Packaging HD (BBT)",
    "100041": "Sedotan (BBT)",
    "100042": "Kresek Kecil (BBT)",
    "100043": "Kresek Besar (BBT)",
    "100044": "Kresek Gelas (BBT)",
    "100045": "Cup Sauce (BBT)",
    "100050": "Sticker Labeling (BBT)",
    "100051": "Hand Gloves (BBT)",
    "100068": "Bolognese Sauce (BBT)",
    "100119": "Paper Kentang (BBT)",
    "100120": "Paper Bag (BBT)",
    "100125": "BBQ Spicy (BBT)",
    "100364": "Pembersih Kerak (BBT)",
    "100365": "Sabun MPC (BBT)",
    "BBBJD00001": "Beef Patty Large",
    "BBBJD00002": "Beef Patty Small",
    "BBBJD00003": "Butter",
    "BBBJD00004": "Kentang Goreng",
    "BBBJD00005": "Kentang Goreng Mc Cain",
    "BBBJD00006": "Smoke Beef Slice",
    "BBBKU00011": "Mayonaise Garlic",
    "BBBKU00013": "Saos Tomat Jerigen Delmonte",
    "BBPCK00001": "Bangor Crazy Bucket",
    "BBPCK00003": "Box Hampers",
    "BBPCK00004": "Cup Plastik 14 oz",
    "BBPCK00005": "Cup Sauce",
    "BBPCK00011": "Grill Box",
    "BBPCK00012": "Inner",
    "BBPCK00014": "Kertas Nasi",
    "BBPCK00015": "Kresek Besar",
    "BBPCK00016": "Kresek Gelas",
    "BBPCK00017": "Kresek Kecil",
    "BBPCK00018": "Packaging Box Sultan",
    "BBPCK00019": "Packaging HD",
    "BBPCK00020": "Paper Bag",
    "BBPCK00023": "Paper Kentang",
    "BBPCK00027": "Tutup Gelas",
    "BBPCK00033": "Spunbond Bangor",
    "BBPCK00034": "Sticker Labeling",
    "BBPCK00035": "Tray Kentang",
    "BBPCK00037": "Bangor Thermal Bag",
    "BBPCK00043 (S)": "Spunbond Polos + Sticker",
    "BBPLK00001": "Apron",
    "BBPLK00002": "Cetakan Telur",
    "BBPLK00003": "Hand Gloves",
    "BBPLK00004": "Hand Sanitizer",
    "BBPLK00005": "Kaus Seragam L",
    "BBPLK00006": "Kaus Seragam M",
    "BBPLK00007": "Kaus Seragam XL",
    "BBPLK00008": "Kaus Seragam XXL",
    "BBPLK00009": "Kaus Seragam XXXL",
    "BBPLK00010": "Kertas Thermal",
    "BBPLK00011": "Name Tag",
    "BBPLK00012": "Sabun Cuci Piring Mitra",
    "BBPLK00013": "Sabun Cuci Tangan",
    "BBPLK00014": "Sabun Lantai Mitra",
    "BBPLK00015": "Sedotan",
    "BBPLK00017": "Polo Shirt L",
    "BBPLK00018": "Polo Shirt M",
    "BBPLK00019": "Polo Shirt S",
    "BBPLK00020": "Polo Shirt XL",
    "BBPLK00021": "Polo Shirt XXL",
    "BBPLK00022": "Polo Shirt XXXL",
    "BBPLK00024": "Tissue Pop Up",
    "BBPLK00025": "Topi",
    "BBPLK00027": "Seragam Owner S",
    "BBPLK00028": "Seragam Owner M",
    "BBPLK00029": "Seragam Owner L",
    "BBPLK00030": "Seragam Owner XL",
    "BBPLK00031": "Seragam Owner XXL",
    "BBPLK00032": "Seragam Owner XXXL",
    "BBPLK00039": "Sabun MPC",
    "BBPLK00040": "Pembersih Kerak",
    "BBPLK00056": "Kupon Umroh",
    "BBPLK00071": "Poster Halal",
    "BBRTL00001": "Ayam Crispy",
    "BBRTL00002": "Bangor Fried Chicken",
    "BBRTL00003": "BBQ Sauce",
    "BBRTL00004": "Beef Slice",
    "BBRTL00005": "Bolognese Sauce 500gr",
    "BBRTL00007": "Cheese Sauce",
    "BBRTL00008": "Chicken Nugget",
    "BBRTL00009": "Dori Crispy",
    "BBRTL00010": "HD Bun",
    "BBRTL00011": "Keju Anchor",
    "BBRTL00013": "Keju Slice Non Brand",
    "BBRTL00014": "Keju Slice Non Brand A",
    "BBRTL00016": "Minyak Padat",
    "BBRTL00017": "Nacho Sauce New",
    "BBRTL00018": "Nestea Lemontea",
    "BBRTL00020": "Sambal Sachet Bangor",
    "BBRTL00021": "Sosis",
    "BBRTL00022": "Spicy Chicken Nugget",
    "BBRTL00023": "Spicy Chicken Patty",
    "BBRTL00024": "Thousand Island Mayonaise",
    "BBRTL00025": "BBQ Spicy",
    "BBRTL00026": "Burger Bun (20)",
    "BBRTL00028": "Bangor Chicken Wings",
    "BBBJD00009": "Jawara Patty"
  },
  "ITEM_WEIGHT_GRAMS": {
    "Kaus Seragam M": 200,
    "Kaus Seragam L": 200,
    "Kaus Seragam XL": 200,
    "Kaus Seragam XXL": 200,
    "Kaus Seragam XXXL": 200,
    "Topi": 50,
    "Polo Shirt S": 200,
    "Polo Shirt M": 200,
    "Polo Shirt L": 200,
    "Polo Shirt XL": 200,
    "Polo Shirt XXL": 200,
    "Polo Shirt XXXL": 200,
    "Apron": 200,
    "Seragam Owner S": 200,
    "Seragam Owner M": 200,
    "Seragam Owner L": 200,
    "Seragam Owner XL": 200,
    "Seragam Owner XXL": 200,
    "Seragam Owner XXXL": 200,
    "Name Tag": 0,
    "Minyak Padat": 15950,
    "Sabun Cuci Piring Mitra": 6000,
    "Sabun Lantai Mitra": 6000,
    "Sabun MPC": 5000,
    "Sabun Kerak": 4000,
    "Sambal Sachet Bangor": 4800,
    "Saos Tomat Jerigen Delmonte": 6000,
    "Pembersih Kerak": 4000,
    "Sabun MPC (BBT)": 5000,
    "Pembersih Kerak (BBT)": 4000,
    "Sabun Cuci Tangan": 6000,
    "Hand Sanitizer": 6000,
    "HD Bun": 200,
    "Burger Bun (20)": 400,
    "HD Bun (BBT)": 200,
    "Burger Bun (BBT)": 400,
    "Box Hampers": 150,
    "Grill Box": 200,
    "Inner": 100,
    "Dus Hampers": 0,
    "Beef Patty Small": 1100,
    "Beef Patty Large": 1550,
    "Keju Slice Non Brand": 0,
    "Keju Slice Non Brand A": 1100,
    "Chicken Nugget": 550,
    "Spicy Chicken Nugget": 1050,
    "Bangor Fried Chicken": 1500,
    "Sosis": 1050,
    "Ayam Crispy": 650,
    "Dori Crispy": 650,
    "Smoke Beef Slice": 300,
    "Bangor Chicken Wings": 0,
    "Cheese Slice": 0,
    "Beef Slice": 550,
    "Chicken Wings": 0,
    "Spicy Chicken Patty": 1050,
    "Beef Patty Large (BBT)": 1550,
    "Beef Patty Small (BBT)": 1100,
    "Keju Anchor": 0,
    "Jawara Patty": 0,
    "Kentang Goreng": 2100,
    "Kentang Goreng Mc Cain": 1600,
    "Poster Halal": 0,
    "Kertas Nasi": 2700,
    "Paper Kentang": 200,
    "Tray Kentang": 850,
    "Paper Bag": 500,
    "Packaging Box Sultan": 900,
    "Packaging HD": 900,
    "Kertas Printer": 450,
    "Cup Plastik 14 oz": 200,
    "Tutup Gelas": 50,
    "Cup Sauce": 100,
    "Sedotan": 100,
    "Hand Gloves": 100,
    "Kresek Kecil": 150,
    "Kresek Besar": 150,
    "Kresek Gelas": 150,
    "Bangor Crazy Bucket": 1500,
    "Sticker Labeling": 150,
    "Tissue Pop Up": 50,
    "Bangor Thermal Bag": 45,
    "Kertas Thermal": 450,
    "Spunbond Bangor": 45,
    "Spunbond Polos + Sticker": 45,
    "Gelas Plastik": 200,
    "Gelas Plastik + Tutup": 200,
    "Cetakan Telur": 100,
    "Thermal Bag": 45,
    "Tutup Gelas Plastik": 50,
    "Plastik Kresek Gelas": 150,
    "Sticker Labeling (BBT)": 150,
    "Cup Sauce (BBT)": 100,
    "Kresek Gelas (BBT)": 150,
    "Kresek Besar (BBT)": 150,
    "Kresek Kecil (BBT)": 150,
    "Hand Gloves (BBT)": 100,
    "Sedotan (BBT)": 100,
    "Packaging Box Sultan (BBT)": 900,
    "Paper Kentang (BBT)": 200,
    "Paper Bag (BBT)": 500,
    "Tray Kentang (BBT)": 850,
    "Packaging HD (BBT)": 900,
    "Kertas Nasi (BBT)": 2700,
    "Kupon Umroh": 0,
    "BBQ Sauce": 550,
    "BBQ Spicy": 550,
    "Bolognese Sauce 500gr": 550,
    "Cheese Sauce": 1050,
    "Nacho Sauce New": 1050,
    "Mayonaise Garlic": 550,
    "Nestea Lemontea": 1050,
    "Butter": 500,
    "Thousand Island Mayonaise": 550,
    "Nachos Sauce": 1050,
    "Lemon Tea": 1050,
    "Thousand Island": 550,
    "Bolognese Sauce": 550,
    "Mayonaise Garlic (BBT)": 550,
    "BBQ Spicy (BBT)": 550,
    "BBQ Sauce (BBT)": 550,
    "Thousand Island (BBT)": 550,
    "Bolognese Sauce (BBT)": 550
  }
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
async function requireAdmin(req: any, res: any, next: any) {
  // Accept admin_key (backward compat) or Supabase admin JWT
  const key = req.query.admin_key || req.body?.admin_key;
  if (key === ADMIN_SECRET) return next();
  try {
    const user = await getUserFromReq(req);
    if (user && ["SuperAdmin","Admin"].includes(user.role)) return next();
  } catch {}
  return res.status(401).send("Unauthorized");
}
function requireBearer(req: any, res: any, next: any) {
  // optional bearer check - warn but allow
  next();
}

// ===== Supabase User Management (Login Page + Admin RM) =====
// Helper: decode JWT without verification (for file fallback when Supabase not configured on Vercel)
function decodeJwtEmail(token: string): { id: string, email: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return { id: payload.sub || "file", email: (payload.email || "").toLowerCase() };
  } catch { return null; }
}
// Helper: get user from Supabase JWT (Authorization: Bearer <jwt>) — with file fallback for Vercel without env
async function getUserFromReq(req: any): Promise<{ id: string, email: string, role: string } | null> {
  try {
    const auth = String(req.headers.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return null;
    const sb = await getSupabase();
    if (sb) {
      const { data, error } = await sb.auth.getUser(token);
      if (!error && data?.user) {
        const uid = data.user.id;
        const email = (data.user.email || "").toLowerCase();
        const { data: prof } = await sb.from("profiles").select("role,email").eq("id", uid).single();
        const role = prof?.role || (email === "majestap93@gmail.com" ? "SuperAdmin" : "LogisticVittoria");
        if (email === "majestap93@gmail.com" && role !== "SuperAdmin") {
          await sb.from("profiles").upsert({ id: uid, email, role: "SuperAdmin" }, { onConflict: "id" });
          return { id: uid, email, role: "SuperAdmin" };
        }
        return { id: uid, email, role };
      }
    }
    // File fallback when Supabase not configured on Vercel (reads JWT without verify, checks data/users.json)
    const decoded = decodeJwtEmail(token);
    if (!decoded) return null;
    const email = decoded.email;
    const users = jsonRead<any[]>("users.json", []);
    const found = users.find((u:any)=> String(u.email||"").toLowerCase()===email);
    const role = found?.role || (email === "majestap93@gmail.com" ? "SuperAdmin" : "LogisticVittoria");
    return { id: decoded.id || found?.id || "file", email, role };
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

// GET /api/users — list profiles (Admin only) — Supabase primary, file fallback for Vercel without env
// Now includes Online Status / Last Seen (last_seen_at, last_login_at, last_sign_in_at) — non-breaking additive
app.get("/api/users", requireSupabaseAdmin, async (_req, res) => {
  const sb = await getSupabase();
  if (sb) {
    const { data, error } = await sb.from("profiles").select("id,email,role,alias,created_at,last_seen_at,last_login_at,banned,banned_reason,banned_until,approved,approved_at").order("created_at", { ascending: false });
    if (!error && data) {
      // Enrich with auth.last_sign_in_at for true last login (supabase auth is source of truth)
      try {
        const { data: authData } = await sb.auth.admin.listUsers({ perPage: 1000 } as any);
        const map = new Map<string, string>();
        for (const u of (authData?.users || []) as any[]) {
          if (u.id && u.last_sign_in_at) map.set(String(u.id), String(u.last_sign_in_at));
        }
        const enriched = (data as any[]).map(r => ({
          ...r,
          last_sign_in_at: map.get(String(r.id)) || null,
        }));
        return res.json(enriched);
      } catch {}
      return res.json(data || []);
    }
  }
  // File fallback when Supabase not configured on Vercel
  const users = jsonRead<any[]>("users.json", []);
  // Ensure majestap93@gmail.com SuperAdmin exists in file fallback
  if (!users.find((u:any)=> String(u.email||"").toLowerCase()==="majestap93@gmail.com")) {
    users.unshift({ id: "superadmin", email: "majestap93@gmail.com", role: "SuperAdmin", alias: "Majesta", created_at: new Date().toISOString() });
  }
  // Never expose passwords
  const safe = users.map((u:any)=> ({ id: u.id, email: u.email, role: u.role, alias: u.alias, created_at: u.created_at, last_seen_at: (u as any).last_seen_at || null, last_login_at: (u as any).last_login_at || null, last_sign_in_at: (u as any).last_sign_in_at || null }));
  res.json(safe);
});

// Heartbeat endpoint — keep Online Status fresh without breaking auth (called by AuthContext every 30s)
app.post("/api/users/heartbeat", async (req, res) => {
  const user = await getUserFromReq(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const sb = await getSupabase();
  if (!sb) return res.json({ status: "no-supabase" });
  try {
    await sb.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
  } catch {}
  res.json({ status: "ok" });
});

// POST /api/users — Admin creates account (email+password+role) — no public signup — Supabase primary, file fallback
app.post("/api/users", requireSupabaseAdmin, async (req, res) => {
  const { email, password, role, alias } = req.body;
  if (!email || !password || !role) return res.status(400).json({ error: "Missing email/password/role" });
  const allowed = ["SuperAdmin","Admin","JendralVittoria","InventoryVittoria","TSAVittoria","LogisticVittoria"];
  if (!allowed.includes(role)) return res.status(400).json({ error: "Invalid role" });
  const requester = (req as any).supaUser;
  if (role === "SuperAdmin" && requester.role !== "SuperAdmin") return res.status(403).json({ error: "Only SuperAdmin can create SuperAdmin" });
  const sb = await getSupabase();
  if (sb) {
    const { data, error } = await sb.auth.admin.createUser({ email: String(email).toLowerCase().trim(), password, email_confirm: true, user_metadata: { alias: alias || email.split("@")[0], role } });
    if (error) return res.status(400).json({ error: error.message });
    const uid = data.user?.id;
    if (uid) await sb.from("profiles").upsert({ id: uid, email: String(email).toLowerCase().trim(), role, alias: alias || email.split("@")[0] }, { onConflict: "id" });
    return res.json({ status: "success", id: uid });
  }
  // File fallback when Supabase not configured on Vercel
  const users = jsonRead<any[]>("users.json", []);
  const lc = String(email).toLowerCase().trim();
  if (users.find((u:any)=> String(u.email||"").toLowerCase()===lc)) return res.status(400).json({ error: "User already exists" });
  const newUser = { id: `file_${Date.now()}`, email: lc, role, alias: alias || email.split("@")[0], password, created_at: new Date().toISOString() };
  users.push(newUser);
  jsonWrite("users.json", users);
  res.json({ status: "success", id: newUser.id });
});

// PATCH /api/users/:id — Admin edits role/alias/password (Change Password) — Supabase primary, file fallback
app.patch("/api/users/:id", requireSupabaseAdmin, async (req, res) => {
  const { role, alias, password } = req.body;
  const id = req.params.id;
  const sb = await getSupabase();
  if (sb) {
    if (password !== undefined) {
      if (String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
      const { error: pwErr } = await sb.auth.admin.updateUserById(id, { password: String(password) });
      if (pwErr) return res.status(400).json({ error: pwErr.message });
      if (!role && alias === undefined) return res.json({ status: "success" });
    }
    const updates: any = {};
    if (role) {
      const allowed = ["SuperAdmin","Admin","JendralVittoria","InventoryVittoria","TSAVittoria","LogisticVittoria"];
      if (!allowed.includes(role)) return res.status(400).json({ error: "Invalid role" });
      const requester = (req as any).supaUser;
      if (role === "SuperAdmin" && requester.role !== "SuperAdmin") return res.status(403).json({ error: "Only SuperAdmin can assign SuperAdmin" });
      updates.role = role;
    }
    if (alias !== undefined) updates.alias = alias;
    if (Object.keys(updates).length===0) {
      if (password !== undefined) return res.json({ status: "success" });
      return res.status(400).json({ error: "No updates" });
    }
    const { error } = await sb.from("profiles").update(updates).eq("id", id);
    if (error) return res.status(400).json({ error: error.message });
    if (alias) try { await sb.auth.admin.updateUserById(id, { user_metadata: { alias } }); } catch {}
    return res.json({ status: "success" });
  }
  // File fallback when Supabase not configured
  const users = jsonRead<any[]>("users.json", []);
  const idx = users.findIndex((u:any)=> String(u.id)===String(id));
  if (idx===-1) return res.status(404).json({ error: "User not found" });
  if (password !== undefined) {
    if (String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    users[idx].password = String(password);
  }
  if (role) {
    const allowed = ["SuperAdmin","Admin","JendralVittoria","InventoryVittoria","TSAVittoria","LogisticVittoria"];
    if (!allowed.includes(role)) return res.status(400).json({ error: "Invalid role" });
    const requester = (req as any).supaUser;
    if (role === "SuperAdmin" && requester.role !== "SuperAdmin") return res.status(403).json({ error: "Only SuperAdmin can assign SuperAdmin" });
    users[idx].role = role;
  }
  if (alias !== undefined) users[idx].alias = alias;
  jsonWrite("users.json", users);
  res.json({ status: "success" });
});

// DELETE /api/users/:id — Admin removes account — Supabase primary, file fallback
app.delete("/api/users/:id", requireSupabaseAdmin, async (req, res) => {
  const id = req.params.id;
  const requester = (req as any).supaUser;
  if (id === requester.id) return res.status(400).json({ error: "Cannot delete self" });
  const sb = await getSupabase();
  if (sb) {
    const { data: target } = await sb.from("profiles").select("role").eq("id", id).single();
    if (target?.role === "SuperAdmin" && requester.role !== "SuperAdmin") return res.status(403).json({ error: "Only SuperAdmin can delete SuperAdmin" });
    const { error } = await sb.auth.admin.deleteUser(id);
    if (error) return res.status(400).json({ error: error.message });
    await sb.from("profiles").delete().eq("id", id);
    return res.json({ status: "success" });
  }
  // File fallback
  const users = jsonRead<any[]>("users.json", []);
  const idx = users.findIndex((u:any)=> String(u.id)===String(id));
  if (idx===-1) return res.status(404).json({ error: "User not found" });
  if (users[idx].role === "SuperAdmin" && requester.role !== "SuperAdmin") return res.status(403).json({ error: "Only SuperAdmin can delete SuperAdmin" });
  users.splice(idx,1);
  jsonWrite("users.json", users);
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

// ===== Packing Status (Live Board) — now persistent on Supabase ====
app.get("/api/packing_status", async (req, res) => {
  const supa = await fetchSupabasePackingStatus();
  if (supa && supa.length) {
    try { jsonWrite("packing_status.json", supa.map((r:any)=> ({ delivery_no: r.delivery_no, outlet: r.outlet, checker: r.checker, status: r.status, total_weight_kg: Number(r.total_weight_kg||0), created_at: r.created_at ? new Date(r.created_at).toLocaleString("en-CA", {timeZone:"Asia/Jakarta"}).replace(",","") : r.created_at, scanned_at: r.scanned_at||"", dus_l: r.dus_l||0, dus_s: r.dus_s||0, dus_besar: r.dus_besar||0 }))); } catch {}
    return res.json(supa);
  }
  // Fallback + also try to backfill from file if supabase empty
  const data = jsonRead<any[]>("packing_status.json", []);
  // If supabase empty but file has data, backfill to Supabase asynchronously
  if (data.length && (!supa || supa.length===0)) {
    (async()=>{ for(const e of data) await saveSupabasePackingStatus({ delivery_no: e.delivery_no, outlet: e.outlet, checker: e.checker, status: e.status||"PENDING", total_weight_kg: e.total_weight_kg||0, created_at: e.created_at ? new Date(e.created_at).toISOString() : new Date().toISOString(), scanned_at: e.scanned_at||"", dus_l: e.dus_l||0, dus_s: e.dus_s||0, dus_besar: e.dus_besar||0 }); })().catch(()=>{});
  }
  res.json(data);
});
app.post("/api/packing_status", async (req, res) => {
  const { delivery_no, outlet, checker, status, total_weight_kg } = req.body;
  if (!delivery_no) return res.status(400).json({ error: "Missing delivery_no" });
  const statuses = jsonRead<any[]>("packing_status.json", []);
  let found = statuses.find(s=>s.delivery_no===delivery_no);
  const nowWib = wibNowStr();
  if (found) {
    found.outlet = outlet ?? found.outlet;
    found.checker = checker ?? found.checker;
    found.status = status ?? found.status;
    if (total_weight_kg!==undefined) found.total_weight_kg = total_weight_kg;
    if (status==="IN PROGRESS") found.created_at = nowWib;
  } else {
    statuses.push({ delivery_no, outlet: outlet||"Unknown", checker: checker||"Unknown", status: status||"PENDING", total_weight_kg: total_weight_kg||0, created_at: nowWib, scanned_at: "" });
  }
  jsonWrite("packing_status.json", statuses);
  // Supabase persistent copy (service_role bypasses RLS)
  saveSupabasePackingStatus({ delivery_no, outlet: outlet||found?.outlet||"Unknown", checker: checker||found?.checker||"Unknown", status: status||found?.status||"PENDING", total_weight_kg: total_weight_kg ?? found?.total_weight_kg ?? 0, created_at: found?.created_at ? new Date(found.created_at).toISOString() : new Date().toISOString(), scanned_at: found?.scanned_at||"", dus_l: found?.dus_l||0, dus_s: found?.dus_s||0, dus_besar: found?.dus_besar||0 }).catch(()=>{});
  res.json({ status: "success" });
});
app.get("/scan/:delivery_no", (req, res) => {
  // Compatibility: redirect to frontend scan page handled by frontend, but provide API
  res.json({ delivery_no: req.params.delivery_no });
});
app.post("/api/scan/:delivery_no", async (req, res) => {
  const delivery_no = decodeURIComponent(req.params.delivery_no);
  const { checker, dus_l, dus_s, dus_besar } = req.body;
  const statuses = jsonRead<any[]>("packing_status.json", []);
  const entry = statuses.find(s=>s.delivery_no===delivery_no);
  if (!entry) {
    // try Supabase
    const supa = await fetchSupabasePackingStatus();
    const supaEntry = supa?.find((s:any)=> s.delivery_no===delivery_no);
    if (!supaEntry) return res.status(404).json({ error: "Not found" });
    if (supaEntry.status==="READY"||supaEntry.status==="CANCELLED") return res.status(400).json({ error: "Already processed" });
  } else {
    if (entry.status==="READY"||entry.status==="CANCELLED") return res.status(400).json({ error: "Already processed" });
    entry.status = "READY";
    if (checker) entry.checker = checker;
    entry.dus_l = Number(dus_l)||0; entry.dus_s = Number(dus_s)||0; entry.dus_besar = Number(dus_besar)||0;
    entry.scanned_at = new Date().toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta"});
    jsonWrite("packing_status.json", statuses);
  }
  // Supabase mirror
  try {
    const sb = await getSupabase();
    if (sb) {
      await sb.from("packing_status").update({ status: "READY", checker: checker||undefined, dus_l: Number(dus_l)||0, dus_s: Number(dus_s)||0, dus_besar: Number(dus_besar)||0, scanned_at: new Date().toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta"}) }).eq("delivery_no", delivery_no);
    }
  } catch {}
  res.json({ status: "success", entry: entry || { delivery_no, status:"READY" } });
});
// Pretty HTML scan pages (for QR) — Supabase-aware
app.get("/scan/*", async (req, res) => {
  const delivery_no = decodeURIComponent((req.params as any)[0] || "");
  let entry = jsonRead<any[]>("packing_status.json", []).find(s=>s.delivery_no===delivery_no) as any;
  if (!entry) {
    const supa = await fetchSupabasePackingStatus();
    entry = supa?.find((s:any)=> s.delivery_no===delivery_no);
  }
  if (!entry) return res.status(404).send("<h1>❌ Not found</h1>");
  if (entry.status==="READY"||entry.status==="CANCELLED") {
    return res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h1 style="color:#c0392b">⛔ SCAN REJECTED</h1><p>Already ${entry.status} at ${entry.scanned_at}</p><p>${delivery_no}</p></body></html>`);
  }
  const checkers = jsonRead<any>(CHECKERS_FILE, { checkers: DEFAULT_CHECKERS }).checkers;
  const opts = checkers.map((c:string)=>`<option value="${c}">${c}</option>`).join("");
  res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verify Packing</title></head><body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f4f6f9"><div style="background:white;padding:32px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);max-width:420px;width:100%;text-align:center"><h1>📦 VERIFY PACKING</h1><p>Outlet: <b>${entry.outlet}</b><br>DO: ${delivery_no}</p><form method="POST" action="/api/scan/${encodeURIComponent(delivery_no)}"><select name="checker" required style="width:100%;padding:10px;margin:10px 0"><option value="">Select Checker</option>${opts}</select><div style="display:flex;gap:8px;margin:10px 0"><input name="dus_l" type="number" placeholder="Dus L" value="0" style="flex:1;padding:8px"/><input name="dus_s" type="number" placeholder="Dus S" value="0" style="flex:1;padding:8px"/><input name="dus_besar" type="number" placeholder="Dus Besar" value="0" style="flex:1;padding:8px"/></div><button type="submit" style="width:100%;padding:12px;background:#27ae60;color:white;border:none;border-radius:8px;font-weight:bold">CONFIRM & FINALIZE</button></form></div></body></html>`);
});

// ===== Packing Board update via PUT for status override =====
app.put("/api/packing_status/:delivery_no", async (req, res) => {
  const dn = decodeURIComponent(req.params.delivery_no);
  const { status, checker } = req.body;
  const statuses = jsonRead<any[]>("packing_status.json", []);
  const entry = statuses.find(s=>s.delivery_no===dn);
  if (!entry) return res.status(404).json({ error: "Not found" });
  if (status) entry.status = status;
  if (checker) entry.checker = checker;
  if (status==="READY") entry.scanned_at = new Date().toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta"});
  jsonWrite("packing_status.json", statuses);
  // Supabase mirror
  try {
    const sb = await getSupabase();
    if (sb) {
      const upd:any={};
      if (status) upd.status=status;
      if (checker) upd.checker=checker;
      if (status==="READY") upd.scanned_at=entry.scanned_at;
      if (Object.keys(upd).length) await sb.from("packing_status").update(upd).eq("delivery_no", dn);
    }
  } catch {}
  res.json({ status: "success" });
});

// ===== Upload packing list — now persisted to Supabase Storage (packing-lists bucket) =====
const upload = multer({ dest: UPLOAD_DIR });
app.post("/api/upload_packing_list", upload.single("file"), async (req, res) => {
  const fname = req.file?.originalname || `PL_${Date.now()}.xlsx`;
  const delivery = String((req.body as any)?.delivery_no || fname.replace(/\.xlsx$/i,"")).slice(0,120);
  // Supabase Storage upload (service_role)
  try {
    const sb = await getSupabase();
    if (sb && req.file?.path) {
      const buf = fs.readFileSync(req.file.path);
      const key = `${delivery}/${fname}`.replace(/[^a-zA-Z0-9_\-./]/g,"_");
      await sb.storage.from("packing-lists").upload(key, buf, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: true } as any);
      // also create signed url not needed — list via bucket
    }
  } catch {}
  res.json({ status: "success", filename: fname });
});
app.post("/api/track_item_usage", async (req, res) => {
  const entry = { ...req.body, timestamp: wibNowStr() };
  const usage = jsonRead<any[]>("item_usage.json", []);
  usage.push(entry);
  jsonWrite("item_usage.json", usage);
  // Supabase persistent
  saveSupabaseItemUsage({ delivery_no: entry.delivery_no||null, outlet: entry.outlet||null, items: entry.items||{}, timestamp: new Date().toISOString() }).catch(()=>{});
  res.json({ status: "success" });
});
app.get("/api/item_usage", async (req, res) => {
  const supa = await fetchSupabaseItemUsage();
  if (supa && supa.length) return res.json(supa);
  const usage = jsonRead<any[]>("item_usage.json", []);
  if (usage.length && (!supa || supa.length===0)) {
    (async()=>{ for(const e of usage) await saveSupabaseItemUsage({ delivery_no: e.delivery_no||null, outlet: e.outlet||null, items: e.items||{}, timestamp: e.timestamp ? new Date(e.timestamp).toISOString() : new Date().toISOString() }); })().catch(()=>{});
  }
  res.json(usage);
});
// Aggregated report endpoint — now Supabase-persistent (packing_status + item_usage), still file fallback — non-breaking read-only
app.get("/api/report/summary", async (_req, res) => {
  let packing = await fetchSupabasePackingStatus();
  if (!packing || !packing.length) packing = jsonRead<any[]>("packing_status.json", []);
  let usage = await fetchSupabaseItemUsage();
  if (!usage || !usage.length) usage = jsonRead<any[]>("item_usage.json", []);
  const master = jsonRead<any>(MASTER_FILE, FALLBACK_MASTER_DATA);
  const w = master.ITEM_WEIGHT_GRAMS || {};
  // Top 25 SKU by qty
  const skuMap: Record<string, number> = {};
  const skuKg: Record<string, number> = {};
  for (const e of usage) {
    const items = (e.items || {}) as Record<string, number>;
    for (const [sku, qty] of Object.entries(items)) {
      skuMap[sku] = (skuMap[sku] || 0) + Number(qty || 0);
      skuKg[sku] = (skuKg[sku] || 0) + (Number(qty||0) * (w[sku]||0) / 1000);
    }
  }
  const topSku = Object.entries(skuMap).sort((a,b)=> b[1]-a[1]).slice(0,25).map(([sku, qty])=> ({ sku, qty, kg: Math.round((skuKg[sku]||0)*100)/100, uom: master.ITEM_UOM?.[sku]||"Pack" }));
  // Top 10 Outlet by PL count + tonnage
  const outletPL: Record<string, { count:number, tonnage:number }> = {};
  for (const p of packing) {
    const o = String(p.outlet||"Unknown").toUpperCase();
    if (!outletPL[o]) outletPL[o]={count:0, tonnage:0};
    outletPL[o].count += 1;
    outletPL[o].tonnage += Number(p.total_weight_kg||0);
  }
  const topOutlet = Object.entries(outletPL).sort((a,b)=> b[1].tonnage - a[1].tonnage).slice(0,10).map(([outlet, v])=> ({ outlet, ...v, tonnage: Math.round(v.tonnage*100)/100 }));
  // Monthly tonnage + PL count (WIB)
  const monthly: Record<string, { tonnage:number, pl:number }> = {};
  for (const p of packing) {
    const ts = String(p.created_at||"");
    // expected "YYYY-MM-DD HH:MM:SS" from wibNowStr
    const m = ts.slice(0,7); // YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(m)) continue;
    if (!monthly[m]) monthly[m]={tonnage:0, pl:0};
    monthly[m].tonnage += Number(p.total_weight_kg||0);
    monthly[m].pl += 1;
  }
  const monthlyArr = Object.entries(monthly).sort(([a],[b])=> a.localeCompare(b)).map(([month, v])=> ({ month, tonnage: Math.round(v.tonnage*100)/100, pl: v.pl }));
  res.json({ topSku, topOutlet, monthly: monthlyArr, totals: { totalPL: packing.length, totalTonnage: Math.round(packing.reduce((a,b)=> a+Number(b.total_weight_kg||0),0)*100)/100, totalUsageRows: usage.length } });
});
// List all exported PLs with Supabase storage file presence (for download) — fixed for slash delivery_no (DO/BBB/...)
app.get("/api/packing_lists", async (_req, res) => {
  let packing = await fetchSupabasePackingStatus();
  if (!packing || !packing.length) packing = jsonRead<any[]>("packing_status.json", []);
  let storageMap: Record<string, any[]> = {};
  try {
    const sb = await getSupabase();
    if (sb) {
      // Direct per-delivery check handles slash paths correctly (DO/BBB/16092026/021)
      // Batch in parallel (limit 50 to avoid burst)
      const slice = packing.slice(0, 100);
      await Promise.all(slice.map(async (p:any)=>{
        const delivery = String(p.delivery_no);
        try{
          const { data: files } = await sb.storage.from("packing-lists").list(delivery, { limit: 5 } as any);
          if(files && files.length) storageMap[delivery]=files;
        }catch{}
      }));
    }
  } catch {}
  const enriched = packing.map((p:any)=> ({ ...p, hasFile: !!storageMap[String(p.delivery_no)]?.length, fileCount: (storageMap[String(p.delivery_no)]||[]).length }));
  res.json(enriched);
});
app.get("/api/packing_lists/:delivery_no/download", async (req, res) => {
  const delivery = decodeURIComponent(req.params.delivery_no);
  const sb = await getSupabase();
  if (!sb) return res.status(503).json({ error: "Storage not configured" });
  try {
    const { data, error } = await sb.storage.from("packing-lists").list(delivery, { limit: 20 } as any);
    if (error || !data || data.length===0) return res.status(404).json({ error: "No file for delivery " + delivery });
    const file = data.find((f:any)=> f.name.toLowerCase().endsWith(".xlsx")) || data[0];
    const path = `${delivery}/${file.name}`;
    const { data: dl, error: dlErr } = await sb.storage.from("packing-lists").download(path);
    if (dlErr || !dl) {
      const { data: urlData, error: urlErr } = await sb.storage.from("packing-lists").createSignedUrl(path, 3600);
      if (urlErr || !urlData?.signedUrl) return res.status(404).json({ error: "Download failed" });
      return res.json({ url: urlData.signedUrl, filename: file.name });
    }
    const buf = Buffer.from(await (dl as any).arrayBuffer());
    res.setHeader("Content-Disposition", `attachment; filename="${file.name}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Length", String(buf.length));
    return res.send(buf);
  } catch (e:any) {
    return res.status(500).json({ error: e?.message || "Download error" });
  }
});
// SuperAdmin-only cascade delete — removes PL from packing_status, item_usage, and Storage (archive)
// Rest of Data Report (Top SKU, Tonnage, Monthly) automatically reflects deletion because they read from those tables — non-breaking additive
app.delete("/api/packing_lists/:delivery_no", requireSupabaseAdmin, async (req, res) => {
  const delivery = decodeURIComponent(req.params.delivery_no);
  if (!delivery) return res.status(400).json({ error: "Missing delivery_no" });
  let deletedPacking = 0, deletedUsage = 0, deletedFiles = 0;
  // File fallback cleanup
  try {
    const ps = jsonRead<any[]>("packing_status.json", []);
    const nextPs = ps.filter((p:any)=> String(p.delivery_no)!==String(delivery));
    if (nextPs.length !== ps.length) { deletedPacking = ps.length - nextPs.length; jsonWrite("packing_status.json", nextPs); }
    const us = jsonRead<any[]>("item_usage.json", []);
    const nextUs = us.filter((u:any)=> String(u.delivery_no)!==String(delivery));
    if (nextUs.length !== us.length) { deletedUsage = us.length - nextUs.length; jsonWrite("item_usage.json", nextUs); }
  } catch {}
  // Supabase persistence
  try {
    const sb = await getSupabase();
    if (sb) {
      const { error: e1, count: c1 } = await sb.from("packing_status").delete({ count: "exact" } as any).eq("delivery_no", delivery);
      if (!e1 && typeof c1==="number") deletedPacking = Math.max(deletedPacking, c1);
      else if (!e1) {
        // fallback count via select
        const { data } = await sb.from("packing_status").select("delivery_no").eq("delivery_no", delivery);
        if (!data || data.length===0) deletedPacking = deletedPacking || 1;
      }
      const { error: e2, count: c2 } = await sb.from("item_usage").delete({ count: "exact" } as any).eq("delivery_no", delivery);
      if (!e2 && typeof c2==="number") deletedUsage = Math.max(deletedUsage, c2);
      // Storage: delete all files under delivery folder
      try {
        const { data: files } = await sb.storage.from("packing-lists").list(delivery, { limit: 100 } as any);
        if (files && files.length) {
          const paths = files.map((f:any)=> `${delivery}/${f.name}`);
          const { error: e3 } = await sb.storage.from("packing-lists").remove(paths);
          if (!e3) deletedFiles = paths.length;
        }
      } catch {}
    }
  } catch {}
  // Audit log for deletion
  try {
    const user = (req as any).supaUser;
    const logs = jsonRead<any[]>("audit_logs.json", []);
    logs.push({ timestamp: wibNowStr(), user: user?.email||"SuperAdmin", role: user?.role||"SuperAdmin", action_type: "DELETE_PL", details: `Deleted ${delivery} — packing:${deletedPacking} usage:${deletedUsage} files:${deletedFiles}` });
    if (logs.length>5000) logs.splice(0, logs.length-5000);
    jsonWrite("audit_logs.json", logs);
  } catch {}
  res.json({ status: "success", delivery_no: delivery, deleted: { packing_status: deletedPacking, item_usage: deletedUsage, files: deletedFiles } });
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

// ===== Anti-Cheat: Detect + Auto-Ban =====
app.post("/api/anticheat/detect", async (req, res) => {
  try {
    const { user_id, email, reason, detail, user_agent, timestamp } = req.body;
    if (!reason) return res.status(400).json({ error: "reason required" });
    const sb = await getSupabase();
    if (!sb) return res.json({ ok: false, error: "no supabase" });

    // Count violations for this user in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await sb.from("anticheat_violations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id)
      .gte("created_at", thirtyDaysAgo);

    const newCount = (count || 0) + 1;
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";

    // Insert violation log
    await sb.from("anticheat_violations").insert({
      user_id, email, reason, detail, ip,
      user_agent: user_agent?.slice(0, 500),
      violation_count: newCount,
      auto_ban: true,
    });

    // Escalation ladder: 1st=24h, 2nd=7d, 3rd+=permanent
    let banDuration: string | null = null;
    let banReason = `Auto-ban: ${reason}`;
    if (newCount === 1) {
      banDuration = "24 hours";
      banReason += " (1st violation — 24h)";
    } else if (newCount === 2) {
      banDuration = "7 days";
      banReason += " (2nd violation — 7 days)";
    } else {
      banDuration = null; // permanent
      banReason += ` (${newCount}th violation — permanent)`;
    }

    // Apply ban
    const now = new Date();
    const banUpdate: any = {
      banned: true,
      banned_reason: banReason,
      banned_at: now.toISOString(),
    };
    if (banDuration === "24 hours") {
      banUpdate.banned_until = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    } else if (banDuration === "7 days") {
      banUpdate.banned_until = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } else {
      banUpdate.banned_until = null; // permanent
    }

    await sb.from("profiles").update(banUpdate).eq("id", user_id);

    // Audit log
    try { await sb.from("audit_logs").insert({ user: email || "anticheat", role: "System", action_type: "ANTICHEAT_AUTO_BAN", details: `${email}: ${banReason} (violation #${newCount})` }); } catch {}

    res.json({ ok: true, banned: true, reason: banReason, violation_count: newCount });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "internal" });
  }
});

// ===== Admin: Manual Ban / Unban / Approve =====
app.post("/api/users/:id/ban", requireSupabaseAdmin, async (req, res) => {
  const { id } = req.params;
  const { reason, days } = req.body; // days=null → permanent
  if (!reason) return res.status(400).json({ error: "reason required" });
  const sb = await getSupabase();
  if (!sb) return res.status(500).json({ error: "no supabase" });

  const adminUser = (req as any).supaUser;
  // Prevent banning other SuperAdmins (safety lock)
  const { data: target } = await sb.from("profiles").select("role").eq("id", id).single();
  if (target?.role === "SuperAdmin" && adminUser?.role !== "SuperAdmin") {
    return res.status(403).json({ error: "Only SuperAdmin can ban SuperAdmins" });
  }
  // Prevent self-ban
  if (adminUser?.id === id) {
    return res.status(403).json({ error: "Cannot ban yourself" });
  }

  const now = new Date();
  const update: any = {
    banned: true,
    banned_reason: reason,
    banned_at: now.toISOString(),
  };
  if (days && typeof days === "number" && days > 0) {
    update.banned_until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  } else {
    update.banned_until = null; // permanent
  }

  await sb.from("profiles").update(update).eq("id", id);
  try { await sb.from("audit_logs").insert({ user: adminUser?.email || "admin", role: adminUser?.role || "Admin", action_type: "MANUAL_BAN", details: `Banned user ${id}: ${reason} (${days ? days + " days" : "permanent"})` }); } catch {}

  res.json({ ok: true, banned: true, until: update.banned_until });
});

app.post("/api/users/:id/unban", requireSupabaseAdmin, async (req, res) => {
  const { id } = req.params;
  const sb = await getSupabase();
  if (!sb) return res.status(500).json({ error: "no supabase" });

  const adminUser = (req as any).supaUser;
  await sb.from("profiles").update({ banned: false, banned_reason: null, banned_at: null, banned_until: null }).eq("id", id);
  try { await sb.from("audit_logs").insert({ user: adminUser?.email || "admin", role: adminUser?.role || "Admin", action_type: "UNBAN", details: `Unbanned user ${id}` }); } catch {}

  res.json({ ok: true, banned: false });
});

app.post("/api/users/:id/approve", requireSupabaseAdmin, async (req, res) => {
  const { id } = req.params;
  const { approved } = req.body;
  const sb = await getSupabase();
  if (!sb) return res.status(500).json({ error: "no supabase" });

  const adminUser = (req as any).supaUser;
  await sb.from("profiles").update({ approved: approved !== false, approved_at: approved !== false ? new Date().toISOString() : null }).eq("id", id);
  try { await sb.from("audit_logs").insert({ user: adminUser?.email || "admin", role: adminUser?.role || "Admin", action_type: approved !== false ? "ACCOUNT_APPROVED" : "ACCOUNT_REJECTED", details: `${approved !== false ? "Approved" : "Rejected"} user ${id}` }); } catch {}

  res.json({ ok: true, approved: approved !== false });
});

// Get anticheat violations (SuperAdmin only)
app.get("/api/anticheat/violations", requireSupabaseAdmin, async (req, res) => {
  const sb = await getSupabase();
  if (!sb) return res.status(500).json({ error: "no supabase" });
  const limit = Math.min(parseInt(String(req.query.limit)) || 100, 500);
  const userId = req.query.user_id;
  let q = sb.from("anticheat_violations").select("*").order("created_at", { ascending: false }).limit(limit);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

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
