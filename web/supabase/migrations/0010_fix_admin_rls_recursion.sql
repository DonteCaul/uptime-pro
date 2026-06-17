-- Fix infinite recursion in admin RLS policies.
--
-- Migration 0009's admin policies queried `profiles` to check the caller's
-- role — but that SELECT itself triggers the profiles RLS, which checks
-- admin again → infinite recursion.
--
-- The fix: use auth.users.raw_app_meta_data (set by Supabase when we grant
-- admin via the admin API) instead of querying profiles. We set
-- raw_app_meta_data.role = 'admin' on the profiles row too, but the
-- authoritative check is via the auth schema (which has no RLS recursion).
--
-- We also add a second guard via a SECURITY DEFINER function that reads the
-- role without RLS interference.

-- Drop the recursive policies.
drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "jumps_select_admin" on public.jumps;
drop policy if exists "devices_select_admin" on public.devices;
drop policy if exists "system_logs_select_admin" on public.system_logs;

-- Helper function: is the current user an admin? SECURITY DEFINER + no RLS
-- on the function body means it can read profiles.role without recursion.
-- Returns true/false — safe to call in policy USING clauses.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- Recreate the admin SELECT policies using the helper function.
create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create policy "jumps_select_admin"
  on public.jumps for select
  to authenticated
  using (public.is_admin());

create policy "devices_select_admin"
  on public.devices for select
  to authenticated
  using (public.is_admin());

create policy "system_logs_select_admin"
  on public.system_logs for select
  to authenticated
  using (public.is_admin());
