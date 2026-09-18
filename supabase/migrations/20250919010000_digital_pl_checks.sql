-- Digital PL server-synced Koli checklist — additive, never touches packing math
-- Run in Supabase SQL Editor (or via scripts/push-schema.mjs). File fallback digital_pl.json keeps the app working if this is not applied yet.
create table if not exists public.digital_pl_checks (
  delivery_no text primary key,
  boxes jsonb not null default '[]'::jsonb,
  checks jsonb not null default '[]'::jsonb,
  dus_besar int not null default 0,
  dus_l int not null default 0,
  dus_s int not null default 0,
  packed_by text default '',
  packed_at timestamptz,
  updated_at timestamptz default now()
);
create index if not exists idx_digital_pl_updated on public.digital_pl_checks (updated_at desc);

alter table public.digital_pl_checks enable row level security;

drop policy if exists "anon_read_digital_pl" on public.digital_pl_checks;
create policy "anon_read_digital_pl" on public.digital_pl_checks for select using (true);
drop policy if exists "anon_write_digital_pl" on public.digital_pl_checks;
create policy "anon_write_digital_pl" on public.digital_pl_checks for insert with check (true);
drop policy if exists "anon_update_digital_pl" on public.digital_pl_checks;
create policy "anon_update_digital_pl" on public.digital_pl_checks for update using (true) with check (true);
