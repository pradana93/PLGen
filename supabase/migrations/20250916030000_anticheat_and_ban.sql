-- Anti-Cheat + Ban Hammer + Account Approval — non-breaking additive
-- New columns on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_reason text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_until timestamptz; -- null = permanent
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Index for ban checks (queried on every login)
CREATE INDEX IF NOT EXISTS idx_profiles_banned ON public.profiles (banned);

-- Anti-cheat violations log
CREATE TABLE IF NOT EXISTS public.anticheat_violations (
  id bigserial PRIMARY KEY,
  user_id uuid,
  email text,
  reason text NOT NULL,
  detail text,
  ip text,
  user_agent text,
  violation_count int DEFAULT 1,
  auto_ban boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anticheat_user ON public.anticheat_violations (user_id);
CREATE INDEX IF NOT EXISTS idx_anticheat_reason ON public.anticheat_violations (reason);
CREATE INDEX IF NOT EXISTS idx_anticheat_created ON public.anticheat_violations (created_at desc);

-- RLS: anon can INSERT (for reporting from browser), only admin/service_role can SELECT
ALTER TABLE public.anticheat_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_violations" ON public.anticheat_violations;
CREATE POLICY "anon_insert_violations" ON public.anticheat_violations FOR INSERT WITH CHECK (true);

-- Admin read is handled by service_role (bypasses RLS), no anon SELECT needed
