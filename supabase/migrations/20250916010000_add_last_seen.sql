-- Add activity tracking to profiles (Online Status / Last Seen) — non-breaking
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists last_login_at timestamptz;
-- Index for ordering by activity
create index if not exists idx_profiles_last_seen on public.profiles (last_seen_at desc);
-- Allow users to update own last_seen (for heartbeat)
drop policy if exists "profiles_update_own_last_seen" on public.profiles;
create policy "profiles_update_own_last_seen" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
-- Keep existing admin update policy
