# AGENTS.md

Operating contract for any AI agent or developer working in this repo.
Read this first, then the docs it points to. Keep it short — detail lives in `docs/`.

---

## 1. What this project is

PLGen — packing-list generator for **Burger Bangor** (PT Bangor Berkembang Bersama /
PT Bangor Berani Terukur).

- React 18 + TypeScript + Vite SPA in `src/`
- Express API in `api/index.ts` (serverless on Vercel, ~90 routes)
- ExcelJS builds the Packing List (PL) and label sheets
- Supabase for auth + persistence, with a local JSON file fallback in `data/`
- Deployed on Vercel from `main`
- **Warehouse Operations (Additive):** Warehouse Map, Receive Stock, Picking List Generator (FIFO with stock deduction)

---

## 2. Read before changing code

| Doc | When |
|---|---|
| `docs/STATE.md` | Always — what is live, what is in flight, known gaps |
| `docs/ARCHITECTURE.md` | Finding where something lives |
| `docs/DECISIONS.md` | Before reversing or "cleaning up" an existing design |
| `docs/LABELS.md` | Before touching `src/lib/labelSheets.ts` or the 6-up label path |
| `docs/WAREHOUSE_PICKING_DESIGN.md` | Supabase schema for warehouse locations, stock batches, movements |
| `docs/WAREHOUSE_PICKING_API.md` | API endpoint specifications for warehouse operations |
| `docs/WAREHOUSE_PICKING_UI.md` | Wireframes and component specs for warehouse pages |

If you learn something non-obvious, write it into the matching doc in the same change.
Docs are part of the deliverable, not an afterthought.

---

## 3. Hard rules (non-negotiable)

1. **Packing logic is frozen.**
   `src/lib/packing.ts` (`calculateBoxes`, `toPackedQty`/`fromPackedQty`,
   `getNextDeliveryNumber`, `getDeliveryDateWIB`) is a 1:1 port of `core.py`.
   Box counts, PL numbers, delivery dates and quantities must never change as a
   side effect of UI, export, label, or warehouse work.
2. **Standard labels are frozen.**
   `exportLabels(...)` with no `template` (or `template: "standard"`) must stay
   byte-identical to the original 6-per-A4 output. The original body in
   `src/lib/exportExcel.ts` is not to be edited. New sizes are additive only.
3. **New label sizes live in `src/lib/labelSheets.ts` only.**
4. **Warehouse Operations are additive only.**
   Warehouse Map, Receive Stock, and Picking List live in new pages/components and
   call new `/api/warehouse/*` endpoints. They do not touch `packing.ts`,
   `exportExcel.ts`, or the existing Dashboard/Digital PL flows.
5. **Every user-facing string goes into both `en` and `id` in `src/i18n.tsx`.**
   Never hard-code Indonesian or English copy inside a component.
6. **Never commit** `.env`, `.env.local`, `data/` (except the tracked
   `data/master_data.json`), `pdf files/`, `Labels/`, logs, or `dist/`.
7. **Never force-push `main`.** Roll back with a revert commit, or use the
   documented `--force-with-lease` recipe in `docs/STATE.md` only when the user
   explicitly asks for it.
8. **Stay in scope.** No speculative refactors, renames or new dependencies.
   Match the surrounding style. Comments explain *why*, not *what*.

---

## 4. Git workflow (user preference)

The owner wants **every update pushed directly to `main`** — no PR required.

```powershell
# 1. backup the current production state first
git checkout main
git branch backup/pre-<topic>-<YYYYMMDD>
git push origin backup/pre-<topic>-<YYYYMMDD>

# 2. do the work on a feature branch
git checkout -b feature/<topic>
git add <files>; git commit -m "type(scope): summary — detail"

# 3. verify, then merge straight into main
npm run typecheck; npm run build
git checkout main
git merge --no-ff feature/<topic>
git push origin main
```

- Backup branches follow `backup/pre-<topic>-<YYYYMMDD>`. There are ~56 of them;
  do not delete or rename them without being asked.
- Never leave the repo parked on a feature branch with unmerged work.
- Never commit `pdf files/` (untracked visual proofs). It is git-ignored on purpose.

Commit message style: `type(scope): summary — detail`
(`feat`, `fix`, `chore`, `docs`, `refactor`). One line, specific, no trailing period.

---

## 5. Commands

```powershell
npm run dev        # Vite on :5173, proxies /api -> :4000
npm run typecheck  # tsc --noEmit
npm run build      # tsc && vite build   (must pass before any push)
npm run preview    # serve the production build

npx tsx api/index.ts   # API on :4000 with the local file DB
vercel dev             # full Vercel emulation (rewrites + serverless)
```

Node 24 / npm 11. There is **no test suite and no CI** — `typecheck`, `build`
and manual verification are the quality gate (see `docs/LABELS.md` for the
label visual-proof recipe).

---

## 6. Definition of done

- [ ] `npm run typecheck` and `npm run build` pass
- [ ] Core untouched: packing math, PL numbering, delivery dates, quantities
- [ ] Standard 6-up label path untouched
- [ ] i18n updated in **both** `en` and `id` if any UI text changed
- [ ] `src/lib/changelogs.ts` entry added if the change is user-visible
- [ ] Backup branch created and pushed before merging to `main`
- [ ] Merged to `main` and pushed
- [ ] `docs/STATE.md` updated (date, what changed, next step)

---

## 7. Repo map (short version)

```
src/          React app — pages/, components/, lib/, store/, context/, i18n.tsx
api/index.ts  Express API (also served locally on :4000)
supabase/     schema.sql + migrations
scripts/      one-off Supabase push/seed helpers
data/         local JSON fallback DB (only master_data.json is tracked)
*.py          legacy Python originals, reference only — never imported by the app
```

Full details, routes, roles and the export pipeline: `docs/ARCHITECTURE.md`.
