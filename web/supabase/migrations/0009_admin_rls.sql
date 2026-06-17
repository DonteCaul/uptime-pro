-- Admin role RLS policies.
--
-- Users with profiles.role = 'admin' can read all profiles, jumps, devices,
-- and system_logs for administration. Writes (role changes, public toggles)
-- go through server actions using the admin client (service role, bypasses
-- RLS), so no UPDATE policies are needed here — only SELECT.

-- Admins can read all profiles.
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Admins can read all jumps.
drop policy if exists "jumps_select_admin" on public.jumps;
create policy "jumps_select_admin"
  on public.jumps for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Admins can read all devices.
drop policy if exists "devices_select_admin" on public.devices;
create policy "devices_select_admin"
  on public.devices for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Admins can read all system_logs.
drop policy if exists "system_logs_select_admin" on public.system_logs;
create policy "system_logs_select_admin"
  on public.system_logs for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
