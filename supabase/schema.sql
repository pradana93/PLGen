-- PLGen Supabase Schema — mirrors flask_app.py file storage
-- Run in Supabase SQL Editor after creating project

-- Master data (single row, id=1)
create table if not exists master_data (
  id int primary key check (id=1),
  data jsonb not null,
  updated_at timestamptz default now()
);
insert into master_data (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

-- Current stock
create table if not exists current_stock (
  id int primary key check (id=1),
  data jsonb not null,
  updated_at timestamptz default now()
);
insert into current_stock (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

-- Packing status (live board)
create table if not exists packing_status (
  delivery_no text primary key,
  outlet text not null,
  checker text not null,
  status text not null default 'PENDING',
  total_weight_kg numeric default 0,
  created_at timestamptz default now(),
  scanned_at text,
  dus_l int default 0,
  dus_s int default 0,
  dus_besar int default 0
);

-- Outbound manifests
create table if not exists outbound_manifests (
  manifest_id text primary key,
  manifest_name text,
  truck_plate text,
  driver text,
  created_by text,
  created_at timestamptz default now(),
  outlets jsonb default '[]'::jsonb,
  status text default 'MANIFESTED',
  loading_started_at timestamptz,
  loading_finished_at timestamptz,
  loaded_by text
);

-- Inbound logs
create table if not exists inbound_logs (
  id bigserial primary key,
  timestamp timestamptz default now(),
  pic text,
  warehouse text,
  vendor text,
  sku text,
  uom text,
  po_qty text,
  received_qty int,
  rejected_qty text,
  time_to_load text,
  total_weight_kg numeric
);

-- Audit logs
create table if not exists audit_logs (
  id bigserial primary key,
  timestamp timestamptz default now(),
  user_name text,
  role text,
  action_type text,
  details text
);

-- Staff roster & OT
create table if not exists staff_roster (
  staff_id text primary key,
  name text,
  role text,
  status text,
  join_date date
);
create table if not exists staff_ot_logs (
  id bigserial primary key,
  log_date date not null,
  staff_id text references staff_roster(staff_id),
  ot_hours numeric,
  cost numeric,
  note text
);

-- Checkers
create table if not exists checkers (
  id int primary key check (id=1),
  list jsonb not null default '[]'::jsonb
);
insert into checkers (id, list) values (1, '["Masroor","Aji","Fadly","Luthfi"]'::jsonb) on conflict (id) do nothing;

-- Wallet
create table if not exists wallet (
  hwid text primary key,
  balance int default 0,
  updated_at timestamptz default now()
);

-- Enable RLS (disable for service_role, enable for anon with policies)
alter table master_data enable row level security;
alter table current_stock enable row level security;
alter table packing_status enable row level security;
alter table outbound_manifests enable row level security;
alter table inbound_logs enable row level security;
alter table audit_logs enable row level security;
alter table staff_roster enable row level security;
alter table staff_ot_logs enable row level security;
alter table checkers enable row level security;
alter table wallet enable row level security;

-- Allow service_role full access (backend). For demo, allow anon read/write via backend API only.
-- Create policy allowing read for authenticated via service role bypass; no anon direct access needed
-- Backend uses service_role key, so RLS bypassed.

-- Example policy: allow all for service_role (implicit). To allow frontend direct reads, add:
-- create policy "Allow anon read master" on master_data for select using (true);
