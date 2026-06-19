-- Fix user_stats() so NULL discipline jumps are counted.
--
-- `discipline <> 'Rode the plane down'` evaluates to NULL (not true) when
-- discipline is NULL, silently excluding those jumps. Switch to IS DISTINCT FROM.

create or replace function public.user_stats()
returns table (
  total_jumps            bigint,
  total_freefall_s       numeric,
  highest_exit_m         numeric,
  highest_exit_jump_id   integer,
  fastest_freefall_ms    numeric,
  fastest_ff_jump_id     integer,
  first_jump             timestamptz,
  last_jump              timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select
    count(*),
    coalesce(sum(freefall_duration_s), 0),
    max(exit_altitude_m),
    (array_agg(id order by exit_altitude_m desc nulls last))[1],
    max(max_freefall_speed_ms),
    (array_agg(id order by max_freefall_speed_ms desc nulls last))[1],
    min(jumped_at),
    max(jumped_at)
  from public.jumps
  where user_id = auth.uid()
    and discipline is distinct from 'Rode the plane down';
$$;
