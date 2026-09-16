// Auto-generated from git log. Latest commit first.
export const APP_VERSION = "2.0.0";

export interface ChangelogEntry {
  hash: string;
  date: string;
  message: string;
}

export const CHANGELOGS: ChangelogEntry[] = [
  { hash: "c316b2a", date: "2026-09-16", message: "fix(export): ensure single Export & Save appears in Live Board — await Supabase after instant download" },
  { hash: "86d9fbb", date: "2026-09-16", message: "fix(live-board): ensure Exported PL caught after template patch (slash delivery_no + keepalive)" },
  { hash: "7cd2ba2", date: "2026-09-16", message: "fix(export): instant PL+Labels download + widen Checker column (E 22→28)" },
  { hash: "d932549", date: "2026-09-16", message: "fix(export): prevent Ship-To/Checker overlap in Print Preview (row heights & wrap)" },
  { hash: "9c2622d", date: "2026-09-16", message: "fix(export): header/footer print positioning + Ship-To wrap (image review)" },
  { hash: "cc5ffe1", date: "2026-09-16", message: "feat(export): add printed footer Page 1 of N | OUTLET to PL Excel" },
  { hash: "477abac", date: "2026-09-16", message: "feat(report): checker leaderboard + SuperAdmin inline checker edit per PL" },
  { hash: "92cad44", date: "2026-09-16", message: "fix: revert lazy to fix blank screen — keep vite code-split, header stays lite" },
  { hash: "961c3c6", date: "2026-09-16", message: "perf: flagship header lite + code-split — fix lag (main 514KB)" },
  { hash: "237cfcd", date: "2026-09-16", message: "feat(header): flagship premium — gradient, glass, pill nav, avatar" },
  { hash: "66a9426", date: "2026-09-16", message: "feat(report): export Data Report as Excel/CSV — all report data" },
  { hash: "eec937e", date: "2026-09-16", message: "feat(admin): SuperAdmin can delete Exported PL Archive with cascade" },
  { hash: "711aae7", date: "2026-09-16", message: "feat(supabase): persist PLs to Supabase + auto-upload & archive download" },
  { hash: "f0e7144", date: "2026-09-16", message: "feat(live-board): Data Report — Top 25 SKU / Top 10 Outlet / Monthly Tonnage + PL" },
  { hash: "737ebc0", date: "2026-09-16", message: "feat(admin): user activity — Online Status / Last Seen (WIB), heartbeat" },
  { hash: "c7b1043", date: "2026-09-16", message: "chore(header): remove Manifests & Inbound from nav" },
  { hash: "51f0839", date: "2026-09-16", message: "feat(server-status): premium 100x redesign — drops below header" },
  { hash: "25f646c", date: "2026-09-16", message: "fix(server-status): anchor dropdown below header instead of above" },
  { hash: "40560ea", date: "2026-09-16", message: "fix: sync master data fallback 1:1 with data/master_data.json, env supabase wiring" },
  { hash: "fccc634", date: "2026-09-15", message: "feat(admin): full CRUD editor for Master Data — SKUs, KODE_BARANG, OUTLET_INFO, HOLIDAYS" },
  { hash: "d5a5d65", date: "2026-09-15", message: "fix(supabase): resolve RLS infinite recursion in profiles policies" },
  { hash: "5d8dfe6", date: "2026-09-15", message: "fix(migration): PDF scanner line breaks, multi-file scan abort, export filename format" },
  { hash: "55ddd53", date: "2026-09-15", message: "fix(auth): allow SuperAdmin to create accounts even when Supabase env missing on Vercel" },
  { hash: "b98d0e5", date: "2026-09-15", message: "feat(ui): show UOM in Active Manifest and Koli Pre-Flight — no logic change" },
  { hash: "ceadecd", date: "2026-09-15", message: "fix(dashboard): make stock shortage popup compact and scrollable" },
  { hash: "cec5e43", date: "2026-09-15", message: "chore: remove /devmode route and header PIN — embedded in Admin only" },
  { hash: "f60b7e2", date: "2026-09-15", message: "feat(admin): embed Offline PIN Generator from Devmode.py" },
  { hash: "508d9d8", date: "2026-09-15", message: "fix(admin): make Master Data tables scrollable" },
  { hash: "f52ba21", date: "2026-09-15", message: "feat(admin): detailed Master Data — 1:1 with admin_overhaul.py" },
  { hash: "42d6ecd", date: "2026-09-15", message: "fix(auth): clean Login, temp password for SuperAdmin, Change Password" },
  { hash: "dde4cb1", date: "2026-09-15", message: "feat(auth): Login Page + Supabase User Management — SuperAdmin majestap93@gmail.com" },
  { hash: "ee11313", date: "2026-09-15", message: "fix(koli): 1:1 port of addons.py open_koli_reviewer — drag, move, ledger" },
  { hash: "c1f6338", date: "2026-09-15", message: "fix(api): revert to PythonAnywhere as primary backend — user reports Supabase broken" },
  { hash: "25f6de0", date: "2026-09-15", message: "fix(vercel): seed /tmp from committed data/ for zero-error fallback" },
  { hash: "ad29b7a", date: "2026-09-15", message: "feat(backend): migrate master_data.json to Supabase — zero error" },
  { hash: "ca806b8", date: "2026-09-15", message: "feat: 1:1 multi-file drag + outlet typo guard — full deepscan" },
  { hash: "914d8e9", date: "2026-09-15", message: "fix(scanner): exact 1:1 port of addons.py smart_scan — PDF table+fallback, Excel, stock validation" },
];
