-- Supabase Migration: Warehouse Map + Picking List Inventory
-- Run this in Supabase SQL Editor
-- Compatible with existing schema (master_data, current_stock, packing_status, etc.)

-- =============================================================================
-- 1. WAREHOUSE LOCATIONS (Static map - managed via Warehouse Map page)
-- =============================================================================
create table if not exists warehouse_locations (
  id uuid primary key default gen_random_uuid(),
  pallet_code text not null unique,           -- Nomor Rak, e.g., 'C11-RC-A1-01'
  warehouse text not null,                    -- 'C11', 'C12'
  zone_type text not null,                    -- 'Racking', 'Container', 'Floor'
  level_rack text not null,                   -- 'Level A / Bay 1', 'Left', 'Floor / Front'
  max_capacity_pcs int not null default 0,    -- Max boxes/pcs that fit
  in_pack int not null default 1,             -- Conversion: pcs per pack (UOM)
  assigned_sku text,                          -- SKU name from master_data (nullable)
  status text not null default 'Available',   -- 'Available', 'Occupied', 'Reserved', 'Maintenance'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists idx_warehouse_locations_warehouse on warehouse_locations(warehouse);
create index if not exists idx_warehouse_locations_assigned_sku on warehouse_locations(assigned_sku);
create index if not exists idx_warehouse_locations_status on warehouse_locations(status);

-- RLS: Admins can manage, all authenticated can read
alter table warehouse_locations enable row level security;

create policy "Admins can manage warehouse locations"
  on warehouse_locations for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('Super Admin', 'Admin')
    )
  );

create policy "Authenticated users can read warehouse locations"
  on warehouse_locations for select
  using (auth.role() = 'authenticated');

-- Auto-update updated_at
create trigger update_warehouse_locations_updated_at
  before update on warehouse_locations
  for each row execute function update_updated_at_column();

-- Auto-status: trigger to set status based on assigned_sku
create or replace function update_warehouse_location_status()
returns trigger as $$
begin
  if new.assigned_sku is null or new.assigned_sku = '' then
    new.status := 'Available';
  elsif new.status = 'Available' then
    new.status := 'Occupied';
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql security definer;

create trigger warehouse_location_status_trigger
  before insert or update on warehouse_locations
  for each row execute function update_warehouse_location_status();

-- =============================================================================
-- 2. STOCK BATCHES (Dynamic inventory with expiry - managed via Receive Stock)
-- =============================================================================
create table if not exists stock_batches (
  id uuid primary key default gen_random_uuid(),
  pallet_code text not null references warehouse_locations(pallet_code) on delete restrict,
  sku text not null,                          -- SKU name from master_data
  kode_barang text,                           -- KODE_BARANG code (optional, for linking)
  exp_date date not null,                     -- Best Before / Expiry date (required for FIFO)
  qty_packs numeric not null default 0,       -- On-hand packs at this location
  received_at timestamptz not null default now(), -- When this batch arrived
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_stock_batches_pallet_code on stock_batches(pallet_code);
create index if not exists idx_stock_batches_sku on stock_batches(sku);
create index if not exists idx_stock_batches_exp_date on stock_batches(exp_date);
create index if not exists idx_stock_batches_qty on stock_batches(qty_packs) where qty_packs > 0;

-- RLS: Admins manage, all authenticated read
alter table stock_batches enable row level security;

create policy "Admins can manage stock batches"
  on stock_batches for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('Super Admin', 'Admin')
    )
  );

create policy "Authenticated users can read stock batches"
  on stock_batches for select
  using (auth.role() = 'authenticated');

-- =============================================================================
-- 3. STOCK MOVEMENTS (Audit trail - append only)
-- =============================================================================
create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  movement_type text not null check (movement_type in ('RECEIVE', 'PICK', 'ADJUST', 'TRANSFER')),
  pallet_code text not null,
  sku text not null,
  kode_barang text,
  exp_date date,
  qty_packs numeric not null,                 -- positive for RECEIVE/ADJUST+, negative for PICK/ADJUST-
  reference text,                             -- PO # (RECEIVE), Cluster name (PICK), note (ADJUST)
  user_id uuid not null,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_stock_movements_pallet on stock_movements(pallet_code);
create index if not exists idx_stock_movements_sku on stock_movements(sku);
create index if not exists idx_stock_movements_type on stock_movements(movement_type);
create index if not exists idx_stock_movements_created on stock_movements(created_at);

-- RLS: Admins manage, all authenticated read
alter table stock_movements enable row level security;

create policy "Admins can manage stock movements"
  on stock_movements for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('Super Admin', 'Admin')
    )
  );

create policy "Authenticated users can read stock movements"
  on stock_movements for select
  using (auth.role() = 'authenticated');

-- =============================================================================
-- 4. HELPER VIEWS
-- =============================================================================

-- Current stock per SKU per location (aggregated from batches)
create or replace view v_current_stock_per_location as
select
  wl.pallet_code,
  wl.warehouse,
  wl.zone_type,
  wl.level_rack,
  wl.assigned_sku,
  sb.sku,
  sb.kode_barang,
  sum(sb.qty_packs) as total_qty_packs,
  min(sb.exp_date) as nearest_exp_date,
  count(sb.id) as batch_count
from warehouse_locations wl
left join stock_batches sb on sb.pallet_code = wl.pallet_code and sb.qty_packs > 0
group by wl.pallet_code, wl.warehouse, wl.zone_type, wl.level_rack, wl.assigned_sku, sb.sku, sb.kode_barang;

-- FIFO allocation helper: available batches ordered for picking
create or replace view v_fifo_available_batches as
select
  sb.id,
  sb.pallet_code,
  wl.warehouse,
  wl.zone_type,
  wl.level_rack,
  sb.sku,
  sb.kode_barang,
  sb.exp_date,
  sb.qty_packs,
  sb.received_at
from stock_batches sb
join warehouse_locations wl on wl.pallet_code = sb.pallet_code
where sb.qty_packs > 0
order by sb.sku, sb.exp_date asc nulls last, sb.received_at asc;

-- =============================================================================
-- 5. SEED DATA: Import your Excel mapping as initial warehouse_locations
-- =============================================================================
-- Run this after verifying the data. The Excel has C11 and C12 side by side.
-- This is a template - replace with actual INSERT statements from your file.

/*
-- Example inserts (run after cleaning your Excel data):
insert into warehouse_locations (pallet_code, warehouse, zone_type, level_rack, max_capacity_pcs, in_pack, assigned_sku, status) values
('C11-RC-A1-01', 'C11', 'Racking', 'Level A / Bay 1', 50, 1000, 'Thousand Island', 'Occupied'),
('C11-RC-A1-02', 'C11', 'Racking', 'Level A / Bay 1', 50, 1000, 'Thousand Island', 'Occupied'),
-- ... all 70+ rows from your Excel
on conflict (pallet_code) do update set
  warehouse = excluded.warehouse,
  zone_type = excluded.zone_type,
  level_rack = excluded.level_rack,
  max_capacity_pcs = excluded.max_capacity_pcs,
  in_pack = excluded.in_pack,
  assigned_sku = excluded.assigned_sku,
  status = excluded.status,
  updated_at = now();
*/

-- =============================================================================
-- NOTES
-- =============================================================================
-- 1. Run in Supabase SQL Editor in order
-- 2. The seed data section needs your Excel data converted to INSERT statements
-- 3. No changes to existing tables (master_data, current_stock, packing_status, etc.)
-- 4. All new tables are additive - PLGen core logic untouched
-- 5. update_updated_at_column() function assumed to exist (from your existing schema)
--    If not, create it:
--    create or replace function update_updated_at_column()
--    returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;