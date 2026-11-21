# Decisions

Append-only log of decisions that are easy to accidentally "clean up" later.
Format: one entry per decision, newest at the bottom. Never delete an entry —
supersede it with a new one.

---

## D-001 · Packing logic is a frozen port of the Python original
**Date:** 2026-09 (initial web port)
**Decision:** `src/lib/packing.ts` reproduces `core.py` (`calculateBoxes`,
multipliers, `BOX_TOLERANCE = 1.859`, delivery numbering, WIB delivery dates)
and is treated as frozen.
**Why:** the business already trusts those numbers; the port exists to change
the interface, not the maths.
**Consequence:** every later feature is additive. UI, export and label work must
never alter box counts, PL numbers, delivery dates or quantities.

## D-002 · Flat repo layout
**Date:** 2026-09
**Decision:** app code lives at the repo root (`src/`, `api/`) rather than in
`frontend/` + `backend/`.
**Why:** single Vercel project, single install, simpler deploys.
**Consequence:** `README.md`'s "Project Structure" section is historical and
wrong. Use `docs/ARCHITECTURE.md`.

## D-003 · Standard 6-up labels are byte-frozen
**Date:** 2026-11-04
**Decision:** new label sizes are additive in `src/lib/labelSheets.ts`. The
original 6-per-A4 body in `exportExcel.ts` is never edited; `exportLabels()` runs
it unchanged when `template` is omitted or `"standard"`.
**Why:** the 6-up sheet is what production prints today. Any layout difference
is a risk with no upside.
**Consequence:** duplicated drawing code between the two files, on purpose.
Do not "deduplicate" them.

## D-004 · Label size is a per-browser preference, not a server setting
**Date:** 2026-11-04
**Decision:** store `standard | medium | large` in `localStorage`
(`plgen-label-size`), default `standard`, selectable from the profile menu.
**Why:** mirrors the existing export-destination pattern (`plgen-export-dest`);
different PCs print different sheet sizes and no migration or admin UI is needed.
**Consequence:** the setting does not follow the user across devices. That is
accepted.

## D-005 · Sized labels get distinct filename suffixes
**Date:** 2026-11-04
**Decision:** `_MEDIUM_` / `_LARGE_` before the date stamp.
**Why:** Drive uploads and ZIP bundles key on filename; identical names would
overwrite or collide.
**Consequence:** anyone parsing label filenames must tolerate the infix.

## D-006 · Label row heights are computed, not hand-tuned
**Date:** 2026-11-06
**Decision:** derive every variable-height row from text metrics
(`wrappedLines` -> `blockHeightPt`) and treat `CFG.heights` as minimums.
Width uses character units (`labelCols * colWidth`), not the column count.
**Why:** fixed heights worked for one sample address and clipped on longer ones;
merged Excel cells never auto-grow.
**Consequence:** layout changes must be verified by rendering to PDF
(`docs/LABELS.md` §5), because typechecking cannot detect an overlap.

## D-007 · Every update ships directly to `main`, with a backup branch first
**Date:** 2026-11-06
**Decision:** no PR flow. Create `backup/pre-<topic>-<YYYYMMDD>`, work on a
feature branch, verify, `git merge --no-ff` into `main`, push.
**Why:** owner preference; solo-maintained production repo.
**Consequence:** the backup branch is the rollback point. Never force-push
`main` without an explicit request.

## D-008 · No test suite, no CI — verification is manual
**Date:** 2026-11 (observed)
**Decision:** quality gate is `npm run typecheck` + `npm run build` plus manual
checks of the affected flow (label PDFs for label work).
**Why:** no test harness was ever introduced and the highest-risk logic is
layout/print output, which unit tests model poorly.
**Consequence:** when touching anything risky, verify the real artifact. If a
test harness is ever added, update this entry instead of silently relying on it.

## D-009 · Warehouse Operations (Map + Picking List) is completely additive
**Date:** 2026-11-22
**Decision:** Warehouse Maps, Receive Stock, and Picking List Generator live in
new pages (`/warehouse-map`, `/receive-stock`, `/picking-list`, `/stock-history`),
new API endpoints (`/api/warehouse/*`), and new tables (`warehouse_locations`,
`stock_batches`, `stock_movements`). Packing List core logic (`packing.ts`,
`exportExcel.ts`, `Dashboard.tsx`, `usePackingStore.ts`) is completely untouched.
**Why:** User requirement: Stock Keepers need FIFO/FEFO picking from RO per
cluster with stock deduction, while Packing List remains purely an outbound
shipping document without stock deduction.
**Consequence:** Zero regression risk to packing math or label exports.

## D-010 · Stock deduction occurs ONLY on Picking List export, not Packing List
**Date:** 2026-11-22
**Decision:** Inventory (`stock_batches`) is deducted only when the user clicks
"Export Picking List". Packing List export never touches inventory. Preview is
read-only.
**Why:** Picking List = inventory movement (stock physically leaves shelves).
Packing List = shipping document. Deducting in both would double-deduct.
**Consequence:** Export failure rolls back or prevents deduction. Each deduction
logs to append-only `stock_movements`.
