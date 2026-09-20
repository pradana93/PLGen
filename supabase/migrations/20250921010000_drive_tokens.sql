-- Google Drive per-user OAuth tokens (Drive export feature) — additive.
-- One row per PLGen user. Service_role only; no anon policies by design
-- (refresh tokens must never be readable from the browser).
create table if not exists public.drive_tokens (
  user_id text primary key,
  refresh_token text not null,
  email text default '',
  updated_at timestamptz default now()
);
create index if not exists idx_drive_tokens_updated on public.drive_tokens (updated_at desc);

alter table public.drive_tokens enable row level security;
-- intentionally no policies: service_role bypasses RLS, anon/authenticated get nothing
