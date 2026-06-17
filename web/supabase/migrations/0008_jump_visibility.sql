-- Per-jump visibility toggle.
--
-- A jump is publicly visible only if BOTH:
--   1. The owner's profile.is_public = true
--   2. The jump's own is_public = true
--
-- This lets users keep a public logbook but mark sensitive jumps (private DZs,
-- demos, etc.) as private without hiding their whole profile.
--
-- Default is_public = true on new jumps so behavior matches the previous
-- "public profile = all jumps visible" model unless a user opts out per-jump.

-- 1. Add the column, defaulting existing + new rows to public.
alter table public.jumps
  add column if not exists is_public boolean not null default true;

-- 2. RLS: tighten the public-jump SELECT policy to require both conditions.
--    Drop the policy added in 0007 and replace it.
drop policy if exists "jumps_select_public_profile" on public.jumps;

create policy "jumps_select_public_profile"
  on public.jumps for select
  to authenticated
  using (
    is_public = true
    and exists (
      select 1 from public.profiles p
      where p.id = jumps.user_id and p.is_public = true
    )
  );

-- Same tightening for jump_data_points (kept consistent in case a public
-- replay view is added later).
drop policy if exists "jump_data_points_select_public_profile" on public.jump_data_points;

create policy "jump_data_points_select_public_profile"
  on public.jump_data_points for select
  to authenticated
  using (
    exists (
      select 1 from public.jumps j
      join public.profiles p on p.id = j.user_id
      where j.id = jump_data_points.jump_id
        and j.is_public = true
        and p.is_public = true
    )
  );

-- 3. Update the leaderboard function to count only public jumps.
create or replace function public.leaderboard(period text default 'all')
returns json
language sql
stable
security definer set search_path = public
as $$
  select json_build_object(
    'jumps', (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select p.id, p.full_name, p.avatar_url, count(j.id)::int as jump_count
        from public.profiles p
        join public.jumps j on j.user_id = p.id
        where p.is_public = true
          and j.is_public = true
          and j.discipline is distinct from 'Rode the plane down'
          and (
            period = 'all' or
            (period = 'day'   and j.jumped_at >= current_date) or
            (period = 'month' and j.jumped_at >= date_trunc('month', now())) or
            (period = 'year'  and j.jumped_at >= date_trunc('year', now()))
          )
        group by p.id, p.full_name, p.avatar_url
        order by jump_count desc
        limit 20
      ) t
    ),
    'dzs', (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select p.id, p.full_name, p.avatar_url,
               count(distinct round(j.dz_lat::numeric, 1)::text || ',' || round(j.dz_lon::numeric, 1)::text)::int as dz_count
        from public.profiles p
        join public.jumps j on j.user_id = p.id
        where p.is_public = true
          and j.is_public = true
          and j.dz_lat is not null and j.dz_lon is not null
          and (
            period = 'all' or
            (period = 'day'   and j.jumped_at >= current_date) or
            (period = 'month' and j.jumped_at >= date_trunc('month', now())) or
            (period = 'year'  and j.jumped_at >= date_trunc('year', now()))
          )
        group by p.id, p.full_name, p.avatar_url
        order by dz_count desc
        limit 20
      ) t
    ),
    'disciplines', (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select p.id, p.full_name, p.avatar_url,
               j.discipline,
               count(j.id)::int as jump_count
        from public.profiles p
        join public.jumps j on j.user_id = p.id
        where p.is_public = true
          and j.is_public = true
          and j.discipline is not null
          and j.discipline is distinct from 'Rode the plane down'
          and (
            period = 'all' or
            (period = 'day'   and j.jumped_at >= current_date) or
            (period = 'month' and j.jumped_at >= date_trunc('month', now())) or
            (period = 'year'  and j.jumped_at >= date_trunc('year', now()))
          )
        group by p.id, p.full_name, p.avatar_url, j.discipline
        order by jump_count desc
        limit 50
      ) t
    ),
    'homeDzs', (
      select coalesce(json_agg(t), '[]'::json)
      from (
        select p.id, p.full_name, p.avatar_url, p.home_dz, p.home_dz_lat, p.home_dz_lon
        from public.profiles p
        where p.is_public = true
          and p.home_dz_lat is not null
          and p.home_dz_lon is not null
      ) t
    )
  )
$$;
