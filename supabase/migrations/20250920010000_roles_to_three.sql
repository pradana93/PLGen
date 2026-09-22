-- Migrate to 3 roles only: Super Admin (immortal), Admin (Dashboard/Digital PL/Live Board), Checker (Digital PL only)
-- Preserve packing logic — only role names change

-- 1. Drop old check
alter table public.profiles drop constraint if exists profiles_role_check;
-- 2. Migrate existing roles to new names (idempotent)
update public.profiles set role='Super Admin' where role='SuperAdmin';
update public.profiles set role='Checker' where role in ('LogisticVittoria','JendralVittoria','InventoryVittoria','TSAVittoria','Checker');
-- Ensure specified users have correct roles
update public.profiles set role='Super Admin' where lower(email)='majestap93@gmail.com';
update public.profiles set role='Admin' where lower(email) in ('arikaadmwarehouse@gmail.com','suhendra.a.d@gmail.com');
-- 3. New check
alter table public.profiles add constraint profiles_role_check check (role in ('Super Admin','Admin','Checker'));

-- 4. Refresh policies for new role names
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (
  auth.uid() = id OR public.get_user_role(auth.uid()) IN ('Super Admin', 'Admin')
);
drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles for insert with check (
  public.get_user_role(auth.uid()) IN ('Super Admin', 'Admin')
  OR auth.jwt() IS NULL
);
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update using (
  public.get_user_role(auth.uid()) IN ('Super Admin', 'Admin')
) with check (
  public.get_user_role(auth.uid()) IN ('Super Admin', 'Admin')
);
drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles for delete using (
  public.get_user_role(auth.uid()) IN ('Super Admin', 'Admin')
);

-- 5. Update trigger for 3 roles
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
    case
      when lower(new.email) = 'majestap93@gmail.com' then 'Super Admin'
      when lower(new.email) in ('arikaadmwarehouse@gmail.com','suhendra.a.d@gmail.com') then 'Admin'
      else 'Checker'
    end,
    coalesce(new.raw_user_meta_data->>'alias', split_part(new.email,'@',1))
  )
  on conflict (id) do update set role = excluded.role where lower(excluded.email)='majestap93@gmail.com';
  return new;
end;
$$;
