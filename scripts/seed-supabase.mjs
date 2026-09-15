#!/usr/bin/env node
// Zero-error Supabase seed for master_data.json
// Usage: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/seed-supabase.mjs
// Or via dotenv: node --env-file=.env scripts/seed-supabase.mjs (Node 20+)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("Set env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service_role, not anon)");
  console.error("Example: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/seed-supabase.mjs");
  process.exit(1);
}

const candidates = [
  path.join(__dirname, "..", "data", "master_data.json"),
  path.join(__dirname, "..", "supabase", "master_data.json"),
  path.join("C:", "Users", "User", "Desktop", "master_data.json"),
];
let masterPath = candidates.find(p=> fs.existsSync(p));
if (!masterPath) {
  console.error("❌ master_data.json not found in", candidates);
  process.exit(1);
}

console.log(`📖 Reading ${masterPath}`);
const raw = fs.readFileSync(masterPath, "utf-8");
let data;
try { data = JSON.parse(raw); } catch(e){ console.error("❌ Invalid JSON:", e.message); process.exit(1); }

// Validate required keys like Python fallback
const required = ["BOX_CAPACITY","BOX_TOLERANCE","CATEGORIES","ITEM_UOM"];
for(const k of required) if(!(k in data)) { console.error(`❌ Missing key ${k}`); process.exit(1); }
console.log(`✅ Valid: BOX_CAPACITY ${Object.keys(data.BOX_CAPACITY).length}, CATEGORIES ${Object.keys(data.CATEGORIES).length}, KODE_BARANG ${Object.keys(data.KODE_BARANG||{}).length}, OUTLET_INFO ${Object.keys(data.OUTLET_INFO||{}).length}`);

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log(`🚀 Upserting to Supabase ${SUPABASE_URL} -> master_data id=1`);
const { error: mErr } = await supabase.from("master_data").upsert({ id: 1, data, updated_at: new Date().toISOString() }, { onConflict: "id" });
if (mErr) { console.error("❌ master_data upsert failed:", mErr.message); process.exit(1); }
console.log("✅ master_data seeded");

// Also seed checkers and stock if present (optional)
if (data.CHECKERS || data.checkers) {
  const list = data.CHECKERS || data.checkers;
  const { error } = await supabase.from("checkers").upsert({ id: 1, list }, { onConflict: "id" });
  if (!error) console.log("✅ checkers seeded");
}
console.log("🎉 Done — WebApp will now serve from Supabase (primary) with zero error. Verify: curl https://your-vercel-app/api/master_data");
