-- Additive: export-attested delivery date on packing_status (DD/MM/YYYY WIB).
-- Field boards key on delivery day (export today -> pack/deliver next working day).
-- Nullable-safe: old rows stay '' and fall back to derived estimates client-side.
alter table packing_status add column if not exists delivery_date text default '';
