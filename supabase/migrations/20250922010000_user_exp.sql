-- EXP leveling (Admin/Operator flex) — additive. Server-awarded only, never gates packing.
-- Levels: level = floor(sqrt(exp/100)) + 1  → Lv100 ≈ 980k EXP (legendary, takes years).
create table if not exists public.user_exp (
  user_id text primary key,
  exp bigint not null default 0,
  updated_at timestamptz default now()
);
create index if not exists idx_user_exp_exp on public.user_exp (exp desc);

-- Idempotency + audit trail: one row per award. key examples:
-- export:{deliveryNo} (+50), pack:{deliveryNo} (+30), daily:{YYYY-MM-DD} (+10)
create table if not exists public.exp_awards (
  id bigserial primary key,
  user_id text not null,
  key text not null,
  amount int not null default 0,
  created_at timestamptz default now(),
  unique (user_id, key)
);
create index if not exists idx_exp_awards_user on public.exp_awards (user_id);
create index if not exists idx_exp_awards_created on public.exp_awards (created_at desc);

alter table public.user_exp enable row level security;
alter table public.exp_awards enable row level security;
-- intentionally no policies: service_role only (clients must never self-grant EXP)
