-- Profiles + RLS + SuperAdmin auto-assign for majestap93@gmail.com
-- Run after schema.sql
-- FIXED: replaced recursive EXISTS subqueries with SECURITY DEFINER get_user_role()

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('SuperAdmin','Admin','JendralVittoria','InventoryVittoria','TSAVittoria','LogisticVittoria')),
  alias text,
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id)
);

alter table public.profiles enable row level security;

-- SECURITY DEFINER helper: avoids RLS recursion when checking a user's role
create or replace function public.get_user_role(uid UUID)
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = uid;
$$;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (
  auth.uid() = id OR public.get_user_role(auth.uid()) IN ('SuperAdmin', 'Admin')
);

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles for insert with check (
  public.get_user_role(auth.uid()) IN ('SuperAdmin', 'Admin')
  OR auth.jwt() IS NULL -- allow service_role via backend
);

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update using (
  public.get_user_role(auth.uid()) IN ('SuperAdmin', 'Admin')
) with check (
  public.get_user_role(auth.uid()) IN ('SuperAdmin', 'Admin')
);

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles for delete using (
  public.get_user_role(auth.uid()) IN ('SuperAdmin', 'Admin')
);

-- SuperAdmin auto-assign trigger for majestap93@gmail.com
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, alias)
  values (
    new.id,
    new.email,
    case when lower(new.email) = 'majestap93@gmail.com' then 'SuperAdmin' else 'LogisticVittoria' end,
    coalesce(new.raw_user_meta_data->>'alias', split_part(new.email,'@',1))
  )
  on conflict (id) do update set role = excluded.role where lower(excluded.email)='majestap93@gmail.com';
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Ensure majestap93@gmail.com if already exists gets SuperAdmin (idempotent)
-- This will be handled by trigger on next insert, and we also upsert via backend on login
