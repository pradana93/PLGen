-- Additive: Surat Jalan refs (DO/IT numbers) attested at export for reference display.
-- Printed on the PL REF row; now also persisted so the scan-confirm page can show them.
-- Legacy rows stay '' and hide the line. No backfill writes.
alter table packing_status add column if not exists source_ref text default '';
