-- Per-user stats aggregation, RLS-safe.
--
-- Returns the dashboard summary (total jumps, highest exit, fastest freefall,
-- total freefall, first/last jump dates) in a single round-trip. Filters by
-- auth.uid() so the calling user only ever sees their own numbers regardless
-- of which key is used.
--
-- Called from the Dashboard via supabase.rpc('user_stats', {}).

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
    -- "Rode the plane down" sentinel is excluded from freefall-based stats
    -- (preserves original app semantics).
    and discipline <> 'Rode the plane down';
$$;

-- Allow authenticated users to call it. SECURITY DEFINER runs as the owner,
-- but we explicitly filter by auth.uid() inside, so it's safe.
grant execute on function public.user_stats() to authenticated;
