-- Community-wide aggregate stats for the social page ticker.
--
-- Reads only public profiles + public jumps, so it's safe to call
-- from any authenticated user (no per-user scoping needed).
--
-- Returns a flat JSON object:
--   users      – count of public profiles
--   jumps      – count of public jumps (excl. "Rode the plane down")
--   total_ft   – sum of exit altitudes converted to feet
--   freefall_hrs – sum of freefall durations in hours
--   dropzones  – count of distinct 1-decimal GPS grids visited

create or replace function public.community_stats()
returns json
language sql
stable
security definer set search_path = public
as $$
  select json_build_object(
    'users', (
      select count(*)::int
      from public.profiles
      where is_public = true
    ),
    'jumps', (
      select count(*)::int
      from public.jumps j
      join public.profiles p on p.id = j.user_id
      where p.is_public = true
        and j.is_public = true
        and j.discipline is distinct from 'Rode the plane down'
    ),
    'total_ft', (
      select coalesce(sum((j.exit_altitude_m - j.deployment_altitude_m)::numeric) * 3.28084, 0)::bigint
      from public.jumps j
      join public.profiles p on p.id = j.user_id
      where p.is_public = true
        and j.is_public = true
        and j.exit_altitude_m is not null
        and j.deployment_altitude_m is not null
    ),
    'freefall_hrs', (
      select coalesce(sum(j.freefall_duration_s::numeric) / 3600, 0)::numeric
      from public.jumps j
      join public.profiles p on p.id = j.user_id
      where p.is_public = true
        and j.is_public = true
    ),
    'dropzones', (
      select count(distinct round(j.dz_lat::numeric, 1)::text || ',' || round(j.dz_lon::numeric, 1)::text)::int
      from public.jumps j
      join public.profiles p on p.id = j.user_id
      where p.is_public = true
        and j.is_public = true
        and j.dz_lat is not null
        and j.dz_lon is not null
    )
  )
$$;

grant execute on function public.community_stats() to authenticated;
