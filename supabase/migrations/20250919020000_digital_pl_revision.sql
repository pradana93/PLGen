-- Additive: revision overlay for Digital PL shortage flow — never touches packing math
alter table public.digital_pl_checks add column if not exists revision_notes jsonb default '{}'::jsonb;
alter table public.digital_pl_checks add column if not exists revision_history jsonb default '[]'::jsonb;
