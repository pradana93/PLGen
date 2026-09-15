import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Push data/master_data.json into Supabase as the postgres role (bypasses RLS).
// Unlike seed-supabase.mjs (service_role via PostgREST), this works with just the
// SUPABASE_ACCESS_TOKEN, same as push-schema.mjs / push-profiles.mjs.
// Usage: SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/push-master.mjs

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || "yapfgtmcykstdtprijvp";
if (!token) {
  console.error("❌ Missing SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const candidates = [
  path.join(__dirname, "..", "data", "master_data.json"),
  path.join(__dirname, "..", "supabase", "master_data.json"),
];
const masterPath = candidates.find((p) => fs.existsSync(p));
if (!masterPath) {
  console.error("❌ master_data.json not found in", candidates);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(masterPath, "utf-8"));
const required = ["BOX_CAPACITY", "BOX_TOLERANCE", "CATEGORIES", "ITEM_UOM"];
for (const k of required) {
  if (!(k in data)) {
    console.error(`❌ Missing key ${k}`);
    process.exit(1);
  }
}
console.log(
  `✅ Valid: BOX_CAPACITY ${Object.keys(data.BOX_CAPACITY).length}, CATEGORIES ${Object.keys(data.CATEGORIES).length}, KODE_BARANG ${Object.keys(data.KODE_BARANG || {}).length}, OUTLET_INFO ${Object.keys(data.OUTLET_INFO || {}).length}`
);

// Escape single quotes for SQL string literal
const jsonLiteral = JSON.stringify(data).replace(/'/g, "''");
const sql = `
insert into master_data (id, data, updated_at)
values (1, '${jsonLiteral}'::jsonb, now())
on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;

insert into current_stock (id, data, updated_at)
values (1, '{}'::jsonb, now())
on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;
`;

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log("Status", res.status);
console.log(text.slice(0, 2000));
if (!res.ok) process.exit(1);
console.log("MASTER DATA PUSH SUCCESS");
