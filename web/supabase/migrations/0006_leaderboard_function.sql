-- Public leaderboard aggregation. Reads only is_public profiles, so it's safe
-- to call from any authenticated user (no per-user scoping needed).
--
-- period: 'day' | 'month' | 'year' | 'all'
--
-- Returns 4 result sets in a single round-trip:
--   1. Most jumps (period-filtered, excludes "Rode the plane down")
--   2. Most distinct DZs visited (1-decimal GPS grid ≈ 11km)
--   3. Most jumps by discipline
--   4. Home DZs of public users (for the globe map)
--
-- NOTE: Postgres functions can only return one set per call. We return a
-- single JSON blob with all four sections to keep it one round-trip. The
-- caller (the /social route) just forwards the JSON.

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
        select distinct
               round(j.dz_lat::numeric, 1) as dz_lat,
               round(j.dz_lon::numeric, 1) as dz_lon,
               count(j.id)::int as jump_count
        from public.jumps j
        join public.profiles p on p.id = j.user_id
        where p.is_public = true
          and j.is_public = true
          and j.dz_lat is not null
          and j.dz_lon is not null
        group by round(j.dz_lat::numeric, 1), round(j.dz_lon::numeric, 1)
        order by jump_count desc
      ) t
    )
  )
$$;

grant execute on function public.leaderboard(text) to authenticated;
