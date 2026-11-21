# State

Living snapshot of where the project is. **Update this at the end of every
session**: bump the date, adjust the shipped/open lists, add one row to the log.

---

## Snapshot

| | |
|---|---|
| Last updated | **2026-11-06** |
| Branch | `main` (direct-to-main workflow, see `AGENTS.md` §4) |
| Last product commit | `a9825ee` — merge of `feature/perfect-label-sizes` |
| App version | `2.1.0` (`package.json`, `src/lib/changelogs.ts`) |
| Deploy | Vercel, production from `main` |
| Node / npm | 24.21.0 / 11.19.0 |
| Verification | `typecheck` + `build` green; Medium/Large labels visually verified |

---

## In flight

- Nothing. Working tree clean except untracked `pdf files/` (local proofs, ignored).

## Next up (not started)

1. **Backfill the in-app changelog.** `src/lib/changelogs.ts` stops at
   2026-09-20 (`fa9e219`). Everything since — Dashboard v2 phases, idle
   auto-lock, uncapped Live Board paging, label size templates, the label
   geometry fix — is missing from the footer. Either backfill from `git log` or
   reset the baseline at `a9825ee` and note it.
2. **Fix the README structure section.** It still describes `frontend/` +
   `backend/`; the repo is flat. Point it at `docs/ARCHITECTURE.md`.
3. **Test/CI decision.** There is no harness. Either accept it explicitly
   (`docs/DECISIONS.md` D-008) or add a minimal vitest suite around
   `packing.ts` as a regression guard for the frozen maths.

No product work is pending approval — wait for the owner's direction.

---

## Recently shipped

| Date | What | Commit |
|---|---|---|
| 2026-11-06 | Medium/Large label overlap fixed: character-unit width math + text-derived row heights | `ebab53c` -> `a9825ee` |
| 2026-11-04 | Label size templates (Standard 6-up / Medium 4-up / Large 2-up), profile-menu selector | PR #3 `8b3c1c9` |
| 2026-11-04 | Uncapped Live Board data (`packing_status` + `item_usage` range paging) | `e86977f` |
| 2026-10-17 | Dashboard v2: multi-file DO+IT, outlet match, review, merged PL per outlet | `92fdd39`, `ded3232`, `4c889c4` |
| 2026-10-17 | Idle auto-lock for shared PCs (15 min, password unlock) | `73067a8` |

Older history: `git log --oneline` and the in-app changelog data file.

---

## Known gaps and risks

- **In-app changelog is stale** since 2026-09-20 (see Next up #1). The footer
  build stamp and `APP_VERSION` therefore under-report recent work.
- **No tests, no CI.** `typecheck` + `build` cannot catch layout regressions;
  label work needs the PDF proof in `docs/LABELS.md` §5.
- **`data/` is ephemeral on Vercel.** Production persistence must go through
  Supabase; never rely on the JSON fallback in production.
- **56+ backup branches on `origin`.** Nothing is broken, but branch listing is
  noisy. Cleanup is optional and needs owner approval.
- **`pdf files/` and `Labels/` are generated artifacts.** Both are git-ignored;
  never commit them.
- **`.env.production` is tracked.** It contains only public `VITE_*` values
  (anon key, API base). A service-role key must never be added there.

---

## Rollback runbook

Preferred — revert the offending merge and push:

```powershell
git checkout main
git revert -m 1 <merge-commit>
git push origin main
```

Hard reset to a backup branch (only when the owner explicitly asks, because it
rewrites shared history):

```powershell
git checkout main
git reset --hard backup/pre-label-size-20261104
git push --force-with-lease origin main
```

Known rollback points:

| Branch | Points at | Meaning |
|---|---|---|
| `backup/pre-label-size-20261104` | `e86977f` | before label size templates |
| `backup/pre-label-size-fix-20261106` | `8b3c1c9` | after templates, before geometry fix |

---

## How to update this file

1. Change the snapshot date and the last product commit.
2. Move finished items out of **In flight** into **Recently shipped** (keep the
   table at ~5 rows; older detail lives in git).
3. Refresh **Next up** only with things that are genuinely still open.
4. Append one line below.

## Log

- 2026-11-06 — Label geometry fix merged to `main` (`a9825ee`); docs set created
  (`AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/STATE.md`, `docs/DECISIONS.md`,
  `docs/LABELS.md`); `pdf files/` ignored.
