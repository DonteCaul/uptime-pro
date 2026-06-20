-- public_jump_stats(p_user_id uuid)
--
-- Returns aggregate statistics across ALL public jumps for a given user.
-- This replaces computing stats from only the 10 most recent jumps in JS,
-- which produced incorrect totals for users with more than 10 jumps.

CREATE OR REPLACE FUNCTION public.public_jump_stats(p_user_id uuid)
RETURNS TABLE (
  total_freefall_s numeric,
  highest_exit_m numeric,
  fastest_freefall_ms numeric,
  first_jump timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(SUM(j.freefall_duration_s), 0)::numeric AS total_freefall_s,
    COALESCE(MAX(j.exit_altitude_m), 0)::numeric AS highest_exit_m,
    COALESCE(MAX(j.max_freefall_speed_ms), 0)::numeric AS fastest_freefall_ms,
    MIN(j.jumped_at)::timestamptz AS first_jump
  FROM public.jumps j
  WHERE j.user_id = p_user_id
    AND j.is_public = true
    AND j.is_plane_ride = false
    AND j.jumped_at IS NOT NULL;
$$;
