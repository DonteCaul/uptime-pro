-- device_jump_counts(p_user_id uuid)
--
-- Returns one row per device with the total jump count, computed entirely
-- inside Postgres. Replaces the old pattern of fetching ALL jump rows and
-- aggregating in JavaScript.

CREATE OR REPLACE FUNCTION public.device_jump_counts(p_user_id uuid)
RETURNS TABLE (
  device_id bigint,
  jump_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    j.device_id,
    COUNT(*)::bigint AS jump_count
  FROM public.jumps j
  WHERE j.user_id = p_user_id
    AND j.device_id IS NOT NULL
  GROUP BY j.device_id;
$$;
