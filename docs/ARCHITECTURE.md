# Architecture

How the app is put together. Update this when you move, add or delete a module.

Last verified: **2026-11-06** against `main` `a9825ee`.

---

## 1. Stack

| Layer | Choice |
|---|---|
| UI | React 18, React Router 6, Tailwind CSS, lucide-react icons, recharts |
| State | zustand (`src/store/usePackingStore.ts`) + React context (`src/context/AuthContext.tsx`) |
| Build | Vite 5 + TypeScript 5 (`npm run build` = `tsc && vite build`) |
| API | Express 4 in `api/index.ts`, exported as a Vercel serverless function |
| Exports | ExcelJS (+ `file-saver`), `qrcode` for PL QR codes, `xlsx` for parsing scans |
| Parsing | `pdfjs-dist` + `xlsx` for Surat Jalan / DO+IT documents |
| Data | Supabase (auth + tables); falls back to JSON files in `data/` |

The repo is **flat**: the app is at the root (`src/`, `api/`), not in
`frontend/` and `backend/`. The `README.md` project-structure section still
describes the old split layout — trust this file instead.

---

## 2. Directory map

```
api/index.ts        all HTTP routes (~90), auth guards, Supabase + file-DB access
src/
  App.tsx           shell: routing, nav, profile menu (incl. label size selector)
  i18n.tsx          EN/ID dictionaries — every UI string lives here, both languages
  main.tsx          React root
  index.css         Tailwind entry + global styles
  pages/
    Dashboard.tsx       v1 flow: scan -> order -> calculate -> export PL/labels
    DashboardV2.tsx     multi-file DO+IT flow, one merged PL per outlet, single/ZIP
    DigitalPl.tsx       field checklist: pick PL, tick koli, dus counts, Done Packed
    LiveBoard.tsx       archive, revision history, dus usage, exports, bulk actions
    Admin.tsx           users, master data, checkers, staff/OT, audit, settings
    Manifests.tsx       outbound manifests
    Inbound.tsx         inbound logs + planner
    ScanPage.tsx        QR scan landing / checker confirm page
    Login.tsx           Supabase auth
  components/       AccessGate, AntiCheatProvider, IdleLock, Copilot, KoliReviewer,
                    BootstrapSplash, DesktopGate, FeedbackModal, RankBadge,
                    ServerStatus, UpdateBanner
  lib/
    packing.ts          FROZEN core: calculateBoxes, UOM/multipliers, master data
                        fallbacks, delivery number + delivery date (WIB)
    exportExcel.ts      PL export (exportPackingList) + labels dispatcher
                        (exportLabels) + original 6-up label layout
    labelSheets.ts      ADDITIVE Medium (4-up) and Large (2-up) label layouts
    labelPrefs.ts       per-browser label size preference (localStorage)
    drive.ts            Google Drive export destination (per-user OAuth)
    zip.ts              ZIP bundling for multi-outlet exports
    api.ts              fetch wrapper + base URL resolution
    supabase.ts         browser Supabase client
    scanner.ts          Surat Jalan PDF/Excel parsing
    groupScan.ts        Dashboard v2 multi-file DO+IT grouping
    fuzzyOutlet.ts      outlet name matching
    outletAliases.ts    learned outlet alias mappings
    plQuantity.ts       delivered-quantity reconciliation (v2 == v1)
    exp.ts              XP / leveling (Super Admin, Admin, Operator)
    audit.ts            audit trail helpers
    anticheat.ts        client-side tamper probes
    changelogs.ts       in-app changelog data + APP_VERSION
    copilot/            local rules engine + Gemini fallback
  store/usePackingStore.ts   order state, persisted
  context/AuthContext.tsx    session, role, profile
supabase/schema.sql   tables + policies
scripts/             push-schema.mjs, push-profiles.mjs, push-master.mjs, seed-supabase.mjs
data/                local JSON fallback (only master_data.json is tracked)
*.py                 legacy Tkinter/Flask originals — reference only, never imported
```

---

## 3. Routes and roles

Roles are exactly three: **Super Admin**, **Admin**, **Checker**.

| Path | Page | Allowed |
|---|---|---|
| `/login` | Login | public |
| `/` | Dashboard | Super Admin, Admin |
| `/dashboard-v2` | Dashboard v2 | Super Admin, Admin |
| `/digital-pl` | Digital PL | Super Admin, Admin, Checker |
| `/live` | Live Board | Super Admin, Admin |
| `/manifests` | Manifests | Super Admin |
| `/inbound` | Inbound | Super Admin |
| `/admin` | Admin | Super Admin |
| `/scan/:deliveryNo` | Scan confirm | public route, guarded by the scan gate |

`Protected` in `src/App.tsx` enforces the role list. Client-side guards are UX,
not security — the API re-checks on every mutating endpoint.

---

## 4. Core data flow (PL generation)

```
Surat Jalan (PDF/XLSX)
  -> lib/scanner.ts          parse rows, match KODE_BARANG + SKU fuzzy
  -> store/usePackingStore   order quantities (+/- with multipliers)
  -> lib/packing.ts          calculateBoxes() -> Box[]  [FROZEN MATH]
  -> components/KoliReviewer optional drag/merge/insert before export
  -> lib/exportExcel.ts      exportPackingList() -> xlsx (QR, delivery no, dates)
  -> lib/exportExcel.ts      exportLabels() -> xlsx labels (size from labelPrefs)
  -> optional: lib/drive.ts  upload to Google Drive, or lib/zip.ts for bundles
```

Delivery number and delivery date both come from `packing.ts`
(`getNextDeliveryNumber`, `getDeliveryDateWIB`) so the PL and the label stamp can
never disagree. `getDeliveryDateWIB` skips Sundays and `master.HOLIDAYS`.

---

## 5. Data layer

Supabase tables (`supabase/schema.sql`): `master_data`, `current_stock`,
`packing_status`, `outbound_manifests`, `inbound_logs`, `audit_logs`,
`staff_roster`, `staff_ot_logs`, `checkers`, `wallet` (+ migration-added columns
such as revision notes, delivery dates, scan refs).

If Supabase env vars are missing, `api/index.ts` falls back to JSON files in
`data/`. On Vercel that directory is ephemeral (`/tmp`), so production relies on
Supabase. Never store anything durable only in `data/`.

---

## 6. Environment

Frontend (must be `VITE_` prefixed to reach the browser):

- `VITE_API_URL` — empty on Vercel (same-origin `/api`), `http://localhost:4000` locally
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Server-only (Vercel env, never committed):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_*`, `FEEDBACK_TO` for the feedback mailer
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `FRONTEND_URL` for Drive
- `ADMIN_SECRET`, `API_BEARER`, `MAJESTA_SECRET_SALT`

`.env.example` is tracked and documents the shape. `.env.production` is tracked
and contains only public `VITE_*` values — never put a service-role key there.

---

## 7. Deploy

Vercel builds with `npm run vercel-build` -> `dist/`. `vercel.json` rewrites
`/api/*`, `/static/*`, `/check`, `/scan/*`, `/uploads/*` and the legacy Python
endpoint names to the single `api/index.ts` function; everything else falls
through to `index.html` for the SPA. Pushing `main` deploys production.

---

## 8. Where to look first

| Symptom | Start here |
|---|---|
| Box counts changed | `src/lib/packing.ts` — it should not have changed |
| PL Excel wrong / overlap | `src/lib/exportExcel.ts` (`exportPackingList`) |
| Label layout wrong by size | `docs/LABELS.md`, then `src/lib/labelSheets.ts` |
| Labels all wrong after a size change | `src/lib/labelPrefs.ts` + `Dashboard.tsx` caller |
| Export goes to Drive unexpectedly | `src/lib/drive.ts`, `plgen-export-dest` key |
| Login / role problems | `src/context/AuthContext.tsx`, `api/index.ts` auth middleware |
| Data missing in production | Supabase env on Vercel, `docs/STATE.md` known gaps |
