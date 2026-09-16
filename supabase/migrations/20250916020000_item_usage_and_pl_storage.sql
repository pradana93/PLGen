-- Item usage for Data Report (Top 25 SKU) — mirrors api/track_item_usage file storage, now persistent
create table if not exists public.item_usage (
  id bigserial primary key,
  delivery_no text,
  outlet text,
  items jsonb not null default '{}'::jsonb,
  timestamp timestamptz default now()
);
create index if not exists idx_item_usage_delivery on public.item_usage (delivery_no);
create index if not exists idx_item_usage_outlet on public.item_usage (outlet);
create index if not exists idx_item_usage_ts on public.item_usage (timestamp desc);

alter table public.item_usage enable row level security;

-- Allow service_role full access (bypass RLS already), allow anon read via backend anon policies if needed
drop policy if exists "anon_read_item_usage" on public.item_usage;
create policy "anon_read_item_usage" on public.item_usage for select using (true);
drop policy if exists "service_write_item_usage" on public.item_usage;
create policy "service_write_item_usage" on public.item_usage for insert with check (true);
create policy "service_write_item_usage_update" on public.item_usage for update using (true);

-- Packing status policies — ensure backend can read/write via anon fallback too (service_role already bypasses)
drop policy if exists "anon_read_packing_status" on public.packing_status;
create policy "anon_read_packing_status" on public.packing_status for select using (true);
drop policy if exists "anon_write_packing_status" on public.packing_status;
create policy "anon_write_packing_status" on public.packing_status for insert with check (true);
drop policy if exists "anon_update_packing_status" on public.packing_status;
create policy "anon_update_packing_status" on public.packing_status for update using (true) with check (true);

-- Packing lists Storage bucket (PL Excel files for download) — public bucket for authenticated download via backend
insert into storage.buckets (id, name, public) values ('packing-lists', 'packing-lists', false)
on conflict (id) do nothing;

-- Storage policies: allow service_role full, authenticated read/write via backend
-- Note: storage.objects policies use bucket_id
drop policy if exists "Allow service upload" on storage.objects;
create policy "Allow service upload" on storage.objects for insert with check (bucket_id = 'packing-lists');
drop policy if exists "Allow service read" on storage.objects;
create policy "Allow service read" on storage.objects for select using (bucket_id = 'packing-lists');
drop policy if exists "Allow service update" on storage.objects;
create policy "Allow service update" on storage.objects for update using (bucket_id = 'packing-lists') with check (bucket_id = 'packing-lists');
drop policy if exists "Allow service delete" on storage.objects;
create policy "Allow service delete" on storage.objects for delete using (bucket_id = 'packing-lists');
