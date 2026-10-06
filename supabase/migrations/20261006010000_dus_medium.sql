-- Additive: Dus Medium tracking across packing flows (Besar / Medium / L / S).
-- Legacy rows without dus_m read as 0 via app-level fallbacks; no backfill writes.
alter table packing_status add column if not exists dus_m int default 0;
alter table public.digital_pl_checks add column if not exists dus_m int not null default 0;
