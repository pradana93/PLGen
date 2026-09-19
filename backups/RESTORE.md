# Full backup — pre Dashboard Remaster (2026-09-19, build e803920)

## Repo
- Branch `backup/main-before-remaster-e803920` = `main @ e803920` + this `backups/` folder.
- Tag `backup-before-remaster-e803920` = repo-only point at `e803920`.
- Rollback repo: `git reset --hard backup-before-remaster-e803920`
  (or `git checkout main; git reset --hard e803920; git push --force` — force only on emergency).

## Database (`backups/db-20260919-e803920/`, Supabase yapfgtmcykstdtprijvp, ap-southeast-1)
- Snapshot via anon REST at manifest time. Row counts:
  master_data 1, current_stock 1, checkers 1, packing_status 97,
  item_usage 108, digital_pl_checks 17.
- `profiles.json` is `[]` — anon RLS denies it (expected, not a gap in readable data).
- Storage bucket `packing-lists` files NOT snapshotted (needs service_role); Excel blobs
  re-upload on next export. DB rows reference delivery_no folders 1:1.
- Restore: replay each JSON into its table (upsert on PK:
  master_data.id=1, current_stock.id=1, checkers.id=1,
  packing_status.delivery_no, item_usage append, digital_pl_checks.delivery_no).

## Notes (locked at backup time)
- Unmapped box SKUs (Dus Patty Logo L/S, Dus Medium, …) are packing-team consumables:
  IGNORED by scanner, never added to master. Do not map them in the remaster.
- `main` was clean at backup; no feature code on this branch — data only.
