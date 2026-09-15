// Auto-generated from git log. Latest commit first.
export const APP_VERSION = "2.0.0";

export interface ChangelogEntry {
  hash: string;
  date: string;
  message: string;
}

export const CHANGELOGS: ChangelogEntry[] = [
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
